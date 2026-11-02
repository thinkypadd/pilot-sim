import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// 0. Syntax & copy hygiene check across all project files
for (const file of ['index.html', 'style.css', 'physics.js', 'game.js']) {
  const src = fs.readFileSync(new URL('./' + file, import.meta.url), 'utf8');
  assert.equal(src.includes('\u2014'), false, `Forbidden em-dash found in ${file}`);
  if (file.endsWith('.js')) {
    new Function(src);
  }
}

const {
  WORLD,
  terrainHeight,
  getRunwayAt,
  createPlane,
  stepPlane
} = require('./physics.js');

// 1. Verify flat runways
for (const key of ['start', 'refuel', 'dest']) {
  const ap = WORLD.airports[key];
  for (let x = ap.x1; x <= ap.x2; x += 20) {
    assert.equal(terrainHeight(x), ap.elev, `Runway ${key} must be flat at x=${x}`);
    assert.equal(getRunwayAt(x)?.id, ap.id);
  }
}

// 2. Verify Engine Master OFF & Parking Brake ON safety interlocks, then Takeoff
{
  const p = createPlane();
  const dt = 1 / 60;

  // Throttle pushed while ENG OFF: zero motion
  for (let i = 0; i < 40; i++) {
    stepPlane(p, { engineOn: false, brakesCmd: false, throttleCmd: 1.0 }, dt);
  }
  assert.equal(p.vx, 0, 'Plane must not move when ENG MASTER is OFF');

  // ENG ON + mid throttle while BRAKES ON: held at ramp
  for (let i = 0; i < 40; i++) {
    stepPlane(p, { engineOn: true, brakesCmd: true, throttleCmd: 0.5 }, dt);
  }
  assert.equal(p.vx, 0, 'Parking brake must hold aircraft at low/mid power');

  // Release brakes, set T/O flaps, full power, pull +13 deg pitch -> liftoff
  for (let i = 0; i < 60 * 6; i++) {
    stepPlane(p, {
      engineOn: true,
      brakesCmd: false,
      flaps: 1,
      throttleCmd: 0.95,
      pitchCmd: 0.23
    }, dt);
    if (!p.onGround && p.y > WORLD.airports.start.elev + 12) break;
  }
  assert.equal(p.onGround, false, 'Plane should lift off');
  assert.ok(p.x < WORLD.airports.start.x2 - 120, `Takeoff roll too long: x=${p.x}`);

  // Verify ALT HOLD levels vertical speed
  for (let i = 0; i < 60 * 5; i++) {
    stepPlane(p, { gearCmd: false, flaps: 0, throttleCmd: 0.72, altHold: true }, dt);
  }
  assert.ok(Math.abs(p.vy) < 1.2, `ALT HOLD should stabilize vertical speed, got vy=${p.vy}`);
}

// 3. Verify Gear-Up belly landing crashes
{
  const p = createPlane();
  p.onGround = false;
  p.x = WORLD.airports.refuel.x1 + 120;
  p.y = WORLD.airports.refuel.elev + 6;
  p.vx = 34;
  p.vy = -2.0;
  p.gear = 0;
  p.gearCmd = false;
  for (let i = 0; i < 120; i++) {
    stepPlane(p, { gearCmd: false, pitchCmd: -0.08 }, 1 / 60);
    if (p.status === 'crashed') break;
  }
  assert.equal(p.status, 'crashed', 'Landing with retracted gear must crash');
  assert.ok(p.failReason.includes('Gear-up'), `Unexpected reason: ${p.failReason}`);
}

// 4. Verify non-stop flight at full burn runs out of fuel before Airport B
{
  const p = createPlane();
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 150; i++) {
    const groundAhead = Math.max(terrainHeight(p.x + 250), terrainHeight(p.x + 500));
    const targetAlt = Math.max(290, groundAhead + 80);
    const pitch = Math.max(-0.2, Math.min(0.32, (targetAlt - p.y) * 0.009));
    stepPlane(p, {
      engineOn: true,
      brakesCmd: false,
      flaps: p.onGround ? 1 : 0,
      gearCmd: p.onGround,
      throttleCmd: 1.0,
      pitchCmd: pitch
    }, dt);
    if (p.status === 'crashed' || p.x >= WORLD.airports.dest.x1) break;
  }
  assert.equal(p.fuel, 0, 'Tank should empty if skipping refuel at full power');
  assert.ok(p.x < WORLD.airports.dest.x1, `Should not reach dest on 1 full-burn tank (reached x=${p.x.toFixed(0)})`);
}

// 5. Full cockpit-procedure mission: KALA -> MESA-4 (Refuel Pump) -> SOLIS
{
  const p = createPlane();
  const dt = 1 / 60;
  let phase = 'leg1_climb';
  const refuelAp = WORLD.airports.refuel;
  const destAp = WORLD.airports.dest;

  for (let step = 0; step < 60 * 260; step++) {
    const cmd = {
      engineOn: true,
      throttleCmd: 0,
      spoilerCmd: 0,
      pitchCmd: 0,
      flaps: 0,
      gearCmd: false,
      brakesCmd: false
    };

    if (phase === 'leg1_climb') {
      cmd.flaps = p.onGround || p.vx < 38 ? 1 : 0;
      cmd.gearCmd = p.onGround;
      cmd.throttleCmd = p.y < 275 ? 0.88 : 0.72;
      cmd.pitchCmd = Math.max(-0.18, Math.min(0.28, (285 - p.y) * 0.010));
      if (p.x > refuelAp.x1 - 650) {
        phase = 'leg1_approach';
      }
    } else if (phase === 'leg1_approach') {
      const dist = (refuelAp.x1 + 95) - p.x;
      const glideY = refuelAp.elev + 2.3 + Math.max(0, dist * 0.085);
      const vyTarget = p.x < refuelAp.x1 ? Math.max(-3.6, (glideY - p.y) * 0.45) : -1.7;
      cmd.flaps = 2;
      cmd.gearCmd = true;
      cmd.brakesCmd = true; // Pre-arm wheel brakes!
      cmd.throttleCmd = !p.onGround && p.vx < 27 ? 0.35 : 0;
      cmd.spoilerCmd = p.vx > 38 ? 0.65 : 0.15;
      cmd.pitchCmd = Math.max(-0.14, Math.min(0.20, (vyTarget - p.vy) * 0.06 + 0.02));

      if (p.onGround && p.groundedAirport === 'refuel' && p.vx < 0.8) {
        phase = 'refueling';
      }
    } else if (phase === 'refueling') {
      cmd.flaps = 1;
      cmd.gearCmd = true;
      cmd.brakesCmd = true;
      cmd.throttleCmd = 0;
      cmd.spoilerCmd = 0;
      cmd.refuelRequested = true;
      if (p.refueledOnce && p.fuel >= 99.9) {
        phase = 'leg2_climb';
      }
    } else if (phase === 'leg2_climb') {
      const lookAhead = Math.max(
        terrainHeight(p.x + 200),
        terrainHeight(p.x + 420),
        terrainHeight(p.x + 620)
      );
      const desiredY = p.x < 5880 ? Math.max(395, lookAhead + 65) : Math.max(95, lookAhead + 70);
      cmd.flaps = p.onGround || p.vx < 38 ? 1 : 0;
      cmd.gearCmd = p.onGround;
      cmd.brakesCmd = false;
      cmd.throttleCmd = p.x < 5920 ? (p.y < desiredY - 6 ? 0.90 : 0.72) : (p.vx < 42 ? 0.45 : 0.08);
      cmd.spoilerCmd = p.x > 6100 && p.y > desiredY + 35 ? 0.6 : 0;
      cmd.pitchCmd = Math.max(-0.28, Math.min(0.32, (desiredY - p.y) * 0.011));
      if (p.x > destAp.x1 - 950) {
        phase = 'leg2_approach';
      }
    } else if (phase === 'leg2_approach') {
      const dist = (destAp.x1 + 120) - p.x;
      const glideY = destAp.elev + 2.3 + Math.max(0, dist * 0.085);
      const vyTarget = p.x < destAp.x1 ? Math.max(-4.0, (glideY - p.y) * 0.45) : -1.6;
      cmd.flaps = 2;
      cmd.gearCmd = true;
      cmd.brakesCmd = true;
      cmd.throttleCmd = !p.onGround && p.vx < 27 ? 0.35 : 0;
      cmd.spoilerCmd = (p.vx > 36 || p.y > glideY + 12) ? 0.75 : 0.15;
      cmd.pitchCmd = Math.max(-0.24, Math.min(0.20, (vyTarget - p.vy) * 0.06 + 0.02));
    }

    stepPlane(p, cmd, dt);
    if (p.status === 'crashed' || p.status === 'arrived') break;
  }

  assert.equal(
    p.status,
    'arrived',
    `Expected 'arrived', got '${p.status}' at x=${p.x.toFixed(0)} y=${p.y.toFixed(1)} phase=${phase} reason=${p.failReason} fuel=${p.fuel.toFixed(1)}`
  );
  assert.equal(p.refueledOnce, true, 'Must have refueled at MESA-4');
  assert.ok(p.fuel > 15, `Expected comfortable reserve fuel at Solis, got ${p.fuel.toFixed(1)}%`);
  console.log(
    `PASS: Cockpit mission completed in ${p.flightTime.toFixed(1)}s | End fuel: ${p.fuel.toFixed(1)}% | Total burned: ${p.fuelUsedTotal.toFixed(1)} units`
  );
}
