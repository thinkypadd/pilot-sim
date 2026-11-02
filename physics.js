(function (root) {
  'use strict';

  const WORLD = {
    length: 8800,
    ceiling: 760,
    seaLevel: 0,
    airports: {
      start: {
        id: 'start',
        code: 'KALA',
        name: 'Kala Valley Field',
        x1: 40,
        x2: 720,
        elev: 42,
        spawnX: 130
      },
      refuel: {
        id: 'refuel',
        code: 'MESA-4',
        name: 'Redrock Fuel Depot',
        x1: 3880,
        x2: 4680,
        elev: 224,
        gantryX: 4300
      },
      dest: {
        id: 'dest',
        code: 'SOLIS',
        name: 'Solis Coastal Intl',
        x1: 7860,
        x2: 8700,
        elev: 18,
        terminalX: 8400
      }
    },
    thermals: [
      { x: 1850, radius: 210, baseY: 95, topY: 430, lift: 5.4 },
      { x: 3180, radius: 190, baseY: 140, topY: 470, lift: 5.0 },
      { x: 5320, radius: 240, baseY: 150, topY: 540, lift: 6.2 },
      { x: 6880, radius: 200, baseY: 95, topY: 410, lift: 4.5 }
    ]
  };

  function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  const CONTROL_POINTS = [
    { x: -600, y: 155 },
    { x: -80, y: 68 },
    { x: 20, y: 42 },
    { x: 745, y: 42 },
    { x: 1180, y: 96 },
    { x: 1560, y: 148 },
    { x: 1920, y: 78 },
    { x: 2460, y: 176 },
    { x: 2940, y: 126 },
    { x: 3460, y: 198 },
    { x: 3845, y: 224 },
    { x: 4710, y: 224 },
    { x: 5020, y: 108 },
    { x: 5760, y: 332 },
    { x: 6360, y: 186 },
    { x: 7020, y: 88 },
    { x: 7600, y: 32 },
    { x: 7830, y: 18 },
    { x: 8720, y: 18 },
    { x: 8800, y: -14 },
    { x: 9800, y: -18 }
  ];

  function getRunwayAt(x) {
    const list = [WORLD.airports.start, WORLD.airports.refuel, WORLD.airports.dest];
    for (let i = 0; i < list.length; i++) {
      const ap = list[i];
      if (x >= ap.x1 && x <= ap.x2) return ap;
    }
    return null;
  }

  function terrainHeight(x) {
    const rw = getRunwayAt(x);
    if (rw) return rw.elev;

    if (x <= CONTROL_POINTS[0].x) return CONTROL_POINTS[0].y;
    const last = CONTROL_POINTS[CONTROL_POINTS.length - 1];
    if (x >= last.x) return last.y;

    for (let i = 0; i < CONTROL_POINTS.length - 1; i++) {
      const p0 = CONTROL_POINTS[i];
      const p1 = CONTROL_POINTS[i + 1];
      if (x >= p0.x && x <= p1.x) {
        const t = smoothstep(p0.x, p1.x, x);
        let h = lerp(p0.y, p1.y, t);
        const nearPad =
          (x > -10 && x < 790) ||
          (x > 3810 && x < 4745) ||
          (x > 7790 && x < 8750) ||
          x > 8755;
        if (!nearPad) {
          const edgeFade = Math.min(Math.abs(x - p0.x), Math.abs(p1.x - x), 90) / 90;
          const micro = Math.sin(x * 0.029) * 4.2 + Math.sin(x * 0.071 + 1.3) * 2.1;
          h += micro * edgeFade;
        }
        return h;
      }
    }
    return 0;
  }

  function terrainSlope(x) {
    if (getRunwayAt(x)) return 0;
    const dx = 2.0;
    return Math.atan2(terrainHeight(x + dx) - terrainHeight(x - dx), dx * 2);
  }

  function sampleAir(x, y) {
    let updraft = 0;
    let windX = 0;

    for (let i = 0; i < WORLD.thermals.length; i++) {
      const th = WORLD.thermals[i];
      const dx = Math.abs(x - th.x);
      if (dx < th.radius && y >= th.baseY && y <= th.topY) {
        const horiz = Math.cos((dx / th.radius) * Math.PI * 0.5);
        const vert = Math.sin(
          Math.max(0, Math.min(1, (y - th.baseY) / (th.topY - th.baseY))) * Math.PI
        );
        updraft += th.lift * horiz * vert;
      }
    }

    if (x > 5400 && x < 6250 && y > 230) {
      const ridgeFactor = Math.sin(((x - 5400) / 850) * Math.PI);
      windX -= 4.2 * ridgeFactor;
    }

    if (y > 410) {
      windX += Math.min(5.0, (y - 410) * 0.035);
    }

    return { windX, updraft };
  }

  const FLAP_MODES = [
    { name: 'UP', cl0: 0.18, cd: 0.000, stall: 0.34, angleDeg: 0 },
    { name: 'T/O', cl0: 0.35, cd: 0.013, stall: 0.39, angleDeg: 15 },
    { name: 'LAND', cl0: 0.54, cd: 0.046, stall: 0.44, angleDeg: 35 }
  ];

  const PLANE_CFG = {
    gearHeight: 2.3,
    gravity: 11.4,
    maxThrust: 15.2,
    retroThrust: 5.4,
    wheelBrakeDecel: 16.5,
    rollFriction: 0.40,
    qFactor: 0.0175,
    clAlpha: 4.25,
    cd0: 0.034,
    cdInduced: 0.043,
    cdGear: 0.016,
    cdBrake: 0.22,
    fuelBurnBase: 1.72,
    refuelRate: 38.0,
    maxSinkSafe: 7.6,
    maxSinkButter: 3.1,
    minPitchSafe: -0.19,
    maxPitchSafe: 0.40
  };

  function createPlane(checkpoint) {
    const startAtRefuel = checkpoint === 'refuel';
    const ap = startAtRefuel ? WORLD.airports.refuel : WORLD.airports.start;
    const spawnX = startAtRefuel ? ap.gantryX + 20 : ap.spawnX;
    return {
      x: spawnX,
      y: ap.elev + PLANE_CFG.gearHeight,
      vx: 0,
      vy: 0,
      pitch: 0,
      targetPitch: 0,
      // Cockpit panel controls
      engineOn: startAtRefuel,
      rpm: startAtRefuel ? 0.22 : 0,
      throttleCmd: 0,
      throttle: 0,
      spoilerCmd: 0,
      brake: 0,
      pitchCmd: 0,
      altHold: false,
      flaps: startAtRefuel ? 1 : 0, // 0=UP, 1=T/O, 2=LAND
      flapPos: startAtRefuel ? 0.5 : 0,
      gearCmd: true,
      gear: 1, // 1=locked down, 0=retracted
      brakesCmd: true, // Parking / Wheel brake ON at ramp
      refuelRequested: false,
      canRefuel: false,
      // Telemetry & status
      fuel: 100,
      fuelFlow: 0,
      hull: 100,
      onGround: true,
      groundedAirport: ap.id,
      refueledOnce: startAtRefuel,
      isRefueling: false,
      stallWarning: false,
      gearWarning: false,
      flapOverspeed: false,
      inThermal: false,
      status: 'ready',
      failReason: '',
      touchdownNote: '',
      lastSinkRate: 0,
      flightTime: 0,
      fuelUsedTotal: 0,
      maxAlt: ap.elev,
      checkpointUnlocked: startAtRefuel
    };
  }

  function stepPlane(plane, panelInput, dt) {
    if (plane.status === 'crashed' || plane.status === 'arrived') {
      return plane;
    }

    const clampedDt = Math.min(dt, 0.05);
    if (panelInput) {
      if (typeof panelInput.engineOn === 'boolean') plane.engineOn = panelInput.engineOn;
      if (typeof panelInput.throttleCmd === 'number') {
        plane.throttleCmd = Math.max(0, Math.min(1, panelInput.throttleCmd));
      }
      if (typeof panelInput.spoilerCmd === 'number') {
        plane.spoilerCmd = Math.max(0, Math.min(1, panelInput.spoilerCmd));
      }
      if (typeof panelInput.pitchCmd === 'number') {
        plane.pitchCmd = Math.max(-0.52, Math.min(0.61, panelInput.pitchCmd));
      }
      if (typeof panelInput.altHold === 'boolean') plane.altHold = panelInput.altHold;
      if (typeof panelInput.flaps === 'number') {
        plane.flaps = Math.max(0, Math.min(2, Math.round(panelInput.flaps)));
      }
      if (typeof panelInput.gearCmd === 'boolean') {
        // Weight-on-wheels safety prevents retracting gear while sitting on tarmac
        if (!plane.onGround || panelInput.gearCmd === true) {
          plane.gearCmd = panelInput.gearCmd;
        }
      }
      if (typeof panelInput.brakesCmd === 'boolean') plane.brakesCmd = panelInput.brakesCmd;
      if (typeof panelInput.refuelRequested === 'boolean') {
        plane.refuelRequested = panelInput.refuelRequested;
      }
    }

    const hasFuel = plane.fuel > 0.001;
    const running = plane.engineOn && hasFuel;

    // Turbine RPM & Thrust spooling
    const targetThrottle = running ? plane.throttleCmd : 0;
    const spoolRate = targetThrottle > plane.throttle ? 1.85 : 2.6;
    plane.throttle += Math.sign(targetThrottle - plane.throttle) *
      Math.min(Math.abs(targetThrottle - plane.throttle), spoolRate * clampedDt);

    const targetRpm = running ? 0.22 + plane.throttle * 0.78 : 0;
    plane.rpm += (targetRpm - plane.rpm) * Math.min(1, 3.2 * clampedDt);

    // Spoiler / Airbrake actuator
    plane.brake += (plane.spoilerCmd - plane.brake) * Math.min(1, 5.5 * clampedDt);

    // Flaps actuator (0 -> 0.5 -> 1.0)
    const flapTargetNorm = plane.flaps * 0.5;
    plane.flapPos += (flapTargetNorm - plane.flapPos) * Math.min(1, 2.4 * clampedDt);

    // Landing gear hydraulic transit (~1.1s)
    if (plane.onGround) plane.gearCmd = true;
    const gearTarget = plane.gearCmd ? 1 : 0;
    plane.gear += Math.sign(gearTarget - plane.gear) *
      Math.min(Math.abs(gearTarget - plane.gear), 0.92 * clampedDt);

    if (plane.status === 'ready' && plane.vx > 0.6) {
      plane.status = 'flying';
    }
    if (plane.status === 'flying') {
      plane.flightTime += clampedDt;
    }

    // Fuel burn: overboost above 80% throttle burns extra fuel per unit thrust
    plane.fuelFlow = 0;
    if (running && plane.throttle > 0.005) {
      const overboost = plane.throttle > 0.80 ? (plane.throttle - 0.80) * 1.45 : 0;
      const idleTrickle = 0.04;
      const rate = PLANE_CFG.fuelBurnBase * (idleTrickle + plane.throttle * 0.96 + overboost);
      plane.fuelFlow = rate;
      const burned = Math.min(plane.fuel, rate * clampedDt);
      plane.fuel -= burned;
      plane.fuelUsedTotal += burned;
    }

    const groundY = terrainHeight(plane.x);
    const agl = plane.y - PLANE_CFG.gearHeight - groundY;

    const air = sampleAir(plane.x, plane.y);
    plane.inThermal = air.updraft > 0.6 && !plane.onGround;

    const airVx = plane.vx - air.windX;
    const airVy = plane.vy - air.updraft;
    const airSpeed = Math.hypot(airVx, airVy);
    const groundSpeed = Math.hypot(plane.vx, plane.vy);

    // Autopilot Level Hold servo (maintains vy = 0 in cruise)
    if (plane.onGround || plane.stallWarning) {
      plane.altHold = false;
    }
    let desiredPitch = plane.pitchCmd;
    if (plane.altHold && !plane.onGround && airSpeed > 25) {
      const targetVy = 0;
      const servoPitch = (targetVy - plane.vy) * 0.055 + 0.03;
      desiredPitch = Math.max(-0.22, Math.min(0.28, servoPitch));
      plane.pitchCmd = desiredPitch;
    }

    // Pitch dynamics
    plane.targetPitch = desiredPitch;
    if (plane.onGround) {
      const rotThreshold = plane.flaps > 0 ? 22 : 25;
      const maxGroundRot = groundSpeed > rotThreshold
        ? Math.min(0.26, ((groundSpeed - rotThreshold) / 9) * 0.26)
        : 0.02;
      const clampedGroundPitch = Math.max(-0.02, Math.min(maxGroundRot, desiredPitch));
      plane.pitch += (clampedGroundPitch - plane.pitch) * Math.min(1, 5.8 * clampedDt);
    } else {
      const aeroAuthority = Math.max(0.26, Math.min(1.0, airSpeed / 34));
      const maxTurnRate = 2.2 * aeroAuthority;
      const diff = desiredPitch - plane.pitch;
      plane.pitch += Math.max(
        -maxTurnRate * clampedDt,
        Math.min(maxTurnRate * clampedDt, diff * 4.6 * clampedDt)
      );
      if (airSpeed < 20) {
        plane.pitch -= (20 - airSpeed) * 0.034 * clampedDt;
      }
    }

    // Aerodynamics with Flaps, Spoilers, and Gear
    const flapCfg = FLAP_MODES[plane.flaps];
    plane.flapOverspeed = !plane.onGround &&
      ((plane.flaps === 2 && airSpeed > 64) || (plane.flaps === 1 && airSpeed > 78));

    const flightPathAngle = airSpeed > 1.5 ? Math.atan2(airVy, Math.max(0.1, airVx)) : 0;
    let alpha = plane.pitch - flightPathAngle;
    alpha = Math.max(-0.75, Math.min(0.75, alpha));

    const baseCl0 = flapCfg.cl0 * (1 - 0.62 * plane.brake);
    let cl = 0;
    let stalled = false;
    if (Math.abs(alpha) <= flapCfg.stall) {
      cl = baseCl0 + PLANE_CFG.clAlpha * alpha;
    } else {
      stalled = !plane.onGround && airSpeed > 12;
      const sign = Math.sign(alpha);
      const peak = baseCl0 + PLANE_CFG.clAlpha * flapCfg.stall * sign;
      const excess = Math.abs(alpha) - flapCfg.stall;
      cl = peak * Math.max(0.22, 1 - excess * 2.1);
    }

    const minFlySpeed = plane.flaps === 2 ? 19.5 : (plane.flaps === 1 ? 21.5 : 24.0);
    plane.stallWarning = stalled || (!plane.onGround && airSpeed < minFlySpeed && agl > 6);
    plane.gearWarning = !plane.onGround && plane.gear < 0.85 && agl < 58 &&
      (plane.vy < -1.5 || plane.throttleCmd < 0.45);

    const q = PLANE_CFG.qFactor * airSpeed * airSpeed;
    const liftAccel = q * cl;
    const cd =
      PLANE_CFG.cd0 +
      flapCfg.cd +
      PLANE_CFG.cdInduced * cl * cl +
      plane.gear * PLANE_CFG.cdGear +
      plane.brake * PLANE_CFG.cdBrake;
    const dragAccel = q * cd;

    let ax = 0;
    let ay = -PLANE_CFG.gravity;

    if (airSpeed > 0.2) {
      const ux = airVx / airSpeed;
      const uy = airVy / airSpeed;
      ax += -uy * liftAccel - ux * dragAccel;
      ay += ux * liftAccel - uy * dragAccel;
    }

    // Main jet thruster
    const speedTaper = Math.max(0.36, 1 - groundSpeed / 150);
    const thrustAccel = plane.throttle * PLANE_CFG.maxThrust * speedTaper;
    ax += Math.cos(plane.pitch) * thrustAccel;
    ay += Math.sin(plane.pitch) * thrustAccel;

    // Retro-thruster assist when spoiler lever > 25% in air
    if (!plane.onGround && plane.brake > 0.25 && plane.vx > 22) {
      ax -= plane.brake * PLANE_CFG.retroThrust;
    }

    // Ground handling & Wheel Brakes
    if (plane.onGround) {
      if (ay < 0) {
        ay = 0;
        plane.vy = 0;
      } else if (ay > 0.4 && (!plane.brakesCmd || plane.vx > 18)) {
        plane.onGround = false;
        plane.groundedAirport = null;
        plane.isRefueling = false;
        plane.refuelRequested = false;
      }

      if (plane.onGround) {
        if (plane.brakesCmd && plane.vx < 0.4 && ax < PLANE_CFG.wheelBrakeDecel) {
          // Parking brake holds aircraft stationary against low/mid thrust
          ax = 0;
          plane.vx = 0;
        } else if (plane.vx > 0) {
          const brakeDecel = plane.brakesCmd ? PLANE_CFG.wheelBrakeDecel : 0;
          const spoilerGroundDecel = plane.brake * 4.5;
          ax -= (PLANE_CFG.rollFriction + brakeDecel + spoilerGroundDecel);
        }
      }
    }

    plane.vx += ax * clampedDt;
    plane.vy += ay * clampedDt;

    if (plane.onGround && plane.vx < 0) {
      plane.vx = 0;
    }
    if (plane.x < 15 && plane.vx < 0) {
      plane.vx = 0;
    }
    if (plane.y > WORLD.ceiling && plane.vy > 0) {
      plane.vy *= 0.85;
    }

    plane.x += plane.vx * clampedDt;
    plane.y += plane.vy * clampedDt;

    if (plane.y > plane.maxAlt) {
      plane.maxAlt = plane.y;
    }

    // Collision & Touchdown checks
    const newGroundY = terrainHeight(plane.x);
    const runway = getRunwayAt(plane.x);
    const contactOffset = plane.gear > 0.5 ? PLANE_CFG.gearHeight * plane.gear : 0.9;
    const bottomY = plane.y - contactOffset;

    if (plane.onGround) {
      if (runway) {
        plane.y = runway.elev + PLANE_CFG.gearHeight;
        plane.groundedAirport = runway.id;
      } else {
        if (newGroundY < bottomY - 0.8) {
          plane.onGround = false;
          plane.groundedAirport = null;
        } else {
          crashPlane(plane, 'Overran runway onto rough ground. Arm WHEEL BRAKES before landing.');
          return plane;
        }
      }
    } else if (bottomY <= newGroundY) {
      const sinkRate = -plane.vy;
      plane.lastSinkRate = Math.max(0, sinkRate);

      if (plane.x > 8740 && newGroundY <= WORLD.seaLevel) {
        crashPlane(plane, 'Overshot Solis Coastal and ditched into Solis Bay.');
        return plane;
      }
      if (!runway) {
        const slopeDeg = Math.round((terrainSlope(plane.x) * 180) / Math.PI);
        crashPlane(
          plane,
          'Struck rough terrain outside paved runways (ground slope ' + slopeDeg + ' deg).'
        );
        return plane;
      }
      if (plane.gear < 0.85) {
        crashPlane(
          plane,
          'Gear-up belly impact! Set GEAR lever to DN and confirm 3 GREEN lamps before touchdown.'
        );
        return plane;
      }
      if (sinkRate > PLANE_CFG.maxSinkSafe) {
        crashPlane(
          plane,
          'Hard impact (' + sinkRate.toFixed(1) + ' m/s vertical sink; gear limit is ' +
            PLANE_CFG.maxSinkSafe.toFixed(1) + ' m/s). Extend LAND flaps and flare PITCH up.'
        );
        return plane;
      }
      if (plane.pitch < PLANE_CFG.minPitchSafe) {
        crashPlane(plane, 'Nose-wheel slam: pull PITCH lever above -10 deg before touchdown.');
        return plane;
      }
      if (plane.pitch > PLANE_CFG.maxPitchSafe) {
        crashPlane(plane, 'Tail-strike impact: nose pitched too high on touchdown.');
        return plane;
      }

      plane.y = runway.elev + PLANE_CFG.gearHeight;
      plane.vy = 0;
      plane.onGround = true;
      plane.groundedAirport = runway.id;
      plane.altHold = false;
      plane.pitch = Math.max(0, Math.min(0.10, plane.pitch));
      plane.pitchCmd = Math.max(0, Math.min(0.08, plane.pitchCmd));

      if (sinkRate <= PLANE_CFG.maxSinkButter) {
        plane.touchdownNote = 'Smooth touchdown (' + sinkRate.toFixed(1) + ' m/s)';
      } else {
        const wear = Math.round((sinkRate - PLANE_CFG.maxSinkButter) * 6);
        plane.hull = Math.max(15, plane.hull - wear);
        plane.touchdownNote = 'Firm touchdown (' + sinkRate.toFixed(1) + ' m/s)';
      }
    }

    // Refueling & Arrival logic
    plane.isRefueling = false;
    plane.canRefuel = false;
    if (plane.onGround && runway) {
      if (runway.id === 'refuel' && plane.vx < 2.2) {
        plane.checkpointUnlocked = true;
        const needsService = plane.fuel < 99.9 || plane.hull < 100;
        plane.canRefuel = needsService;
        if (plane.refuelRequested && needsService) {
          plane.isRefueling = true;
          plane.fuel = Math.min(100, plane.fuel + PLANE_CFG.refuelRate * clampedDt);
          plane.hull = Math.min(100, plane.hull + 24 * clampedDt);
          if (plane.fuel >= 99.95 && plane.hull >= 99.95) {
            plane.fuel = 100;
            plane.hull = 100;
            plane.refuelRequested = false;
            plane.refueledOnce = true;
          }
        }
        if (plane.fuel >= 99.5) {
          plane.refueledOnce = true;
        }
      } else {
        plane.refuelRequested = false;
      }

      if (runway.id === 'dest' && plane.vx < 1.0) {
        plane.vx = 0;
        plane.status = 'arrived';
      }
    } else {
      plane.refuelRequested = false;
    }

    if (plane.x > WORLD.length + 500) {
      crashPlane(plane, 'Flew past Solis Coastal airspace without landing.');
    }

    return plane;
  }

  function crashPlane(plane, reason) {
    plane.status = 'crashed';
    plane.failReason = reason;
    plane.throttle = 0;
    plane.rpm = 0;
    plane.isRefueling = false;
    plane.refuelRequested = false;
  }

  const api = {
    WORLD,
    FLAP_MODES,
    PLANE_CFG,
    terrainHeight,
    terrainSlope,
    getRunwayAt,
    sampleAir,
    createPlane,
    stepPlane
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.PlaneSim = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
