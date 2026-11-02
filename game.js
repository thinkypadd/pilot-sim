(function () {
  'use strict';

  const {
    WORLD,
    PLANE_CFG,
    terrainHeight,
    createPlane,
    stepPlane
  } = window.PlaneSim;

  const skyCanvas = document.getElementById('skyCanvas');
  const ctx = skyCanvas.getContext('2d');
  const adiCanvas = document.getElementById('adiCanvas');
  const actx2d = adiCanvas.getContext('2d');
  const routeCanvas = document.getElementById('routeCanvas');
  const rctx = routeCanvas.getContext('2d');

  // Top bar & dialogs
  const legReadout = document.getElementById('legReadout');
  const liveBanner = document.getElementById('liveBanner');
  const helpModal = document.getElementById('helpModal');
  const outcomeModal = document.getElementById('outcomeModal');
  const outcomeHeading = document.getElementById('outcomeHeading');
  const outcomeDesc = document.getElementById('outcomeDesc');
  const statTime = document.getElementById('statTime');
  const statFuel = document.getElementById('statFuel');
  const statBurned = document.getElementById('statBurned');
  const statHull = document.getElementById('statHull');
  const checkpointBtn = document.getElementById('checkpointBtn');
  const restartModalBtn = document.getElementById('restartModalBtn');
  const soundBtn = document.getElementById('soundBtn');
  const soundLabel = document.getElementById('soundLabel');
  const soundWaves = document.getElementById('soundWaves');
  const soundMuteX = document.getElementById('soundMuteX');
  const helpBtn = document.getElementById('helpBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const restartTopBtn = document.getElementById('restartTopBtn');

  // Glareshield
  const checklistStrip = document.getElementById('checklistStrip');
  const warnStall = document.getElementById('warnStall');
  const warnSink = document.getElementById('warnSink');
  const warnGear = document.getElementById('warnGear');
  const warnFlap = document.getElementById('warnFlap');
  const warnFuel = document.getElementById('warnFuel');

  // Console controls
  const engSwitch = document.getElementById('engSwitch');
  const engStateText = document.getElementById('engStateText');
  const rpmReadout = document.getElementById('rpmReadout');
  const fuelReadout = document.getElementById('fuelReadout');
  const flowReadout = document.getElementById('flowReadout');
  const fuelBar = document.getElementById('fuelBar');
  const refuelBtn = document.getElementById('refuelBtn');
  const refuelBtnText = document.getElementById('refuelBtnText');

  const throttleSlot = document.getElementById('throttleSlot');
  const thrReadout = document.getElementById('thrReadout');
  const thrSlotFill = document.getElementById('thrSlotFill');
  const thrHandle = document.getElementById('thrHandle');
  const idleCutBtn = document.getElementById('idleCutBtn');

  const spoilerSlot = document.getElementById('spoilerSlot');
  const spoilReadout = document.getElementById('spoilReadout');
  const spoilSlotFill = document.getElementById('spoilSlotFill');
  const spoilHandle = document.getElementById('spoilHandle');
  const spoilRetBtn = document.getElementById('spoilRetBtn');

  const pitchSlot = document.getElementById('pitchSlot');
  const pitchReadout = document.getElementById('pitchReadout');
  const pitchHandle = document.getElementById('pitchHandle');
  const pitchZeroBtn = document.getElementById('pitchZeroBtn');
  const altHoldBtn = document.getElementById('altHoldBtn');

  const flapBtns = [
    document.getElementById('flapBtn0'),
    document.getElementById('flapBtn1'),
    document.getElementById('flapBtn2')
  ];
  const gearBtn = document.getElementById('gearBtn');
  const gearStateText = document.getElementById('gearStateText');
  const gearLampN = document.getElementById('gearLampN');
  const gearLampL = document.getElementById('gearLampL');
  const gearLampR = document.getElementById('gearLampR');

  const brakeSwitch = document.getElementById('brakeSwitch');
  const brakeStateText = document.getElementById('brakeStateText');

  const spdReadout = document.getElementById('spdReadout');
  const altReadout = document.getElementById('altReadout');
  const vsiReadout = document.getElementById('vsiReadout');
  const waypointDist = document.getElementById('waypointDist');

  const PITCH_MIN_DEG = -30;
  const PITCH_MAX_DEG = 35;

  let viewW = 1280;
  let viewH = 520;
  let dpr = 1;

  let plane = createPlane();
  let paused = false;
  let outcomeShown = false;
  let bannerTimer = 0;
  let lastTouchdownSeen = '';
  let lastChecklistHtml = '';

  const camera = {
    x: plane.x,
    y: plane.y + 26,
    scale: 4.1
  };

  // Deterministic cloud layer
  const clouds = [];
  for (let i = 0; i < 34; i++) {
    const seed = Math.sin(i * 12.9898) * 43758.5453;
    const frac = seed - Math.floor(seed);
    const frac2 = (seed * 7.13) - Math.floor(seed * 7.13);
    clouds.push({
      x: -200 + i * 290 + frac * 140,
      y: 280 + frac2 * 260,
      w: 95 + frac * 115,
      h: 24 + frac2 * 20,
      speed: 1.4 + frac * 1.8
    });
  }

  const particles = [];
  function spawnParticle(x, y, vx, vy, radius, life, color) {
    if (particles.length > 260) return;
    particles.push({ x, y, vx, vy, radius, life, maxLife: life, color });
  }

  // Procedural Web Audio (turbine + airflow + mechanical switch clicks + caution tones)
  const sound = {
    enabled: false,
    ctx: null,
    engineGain: null,
    engineFilter: null,
    toneOsc: null,
    toneGain: null,
    refuelTimer: 0,
    warnTimer: 0
  };

  function initAudio() {
    if (sound.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      const actx = new AudioCtx();
      const bufferSize = actx.sampleRate * 2;
      const noiseBuf = actx.createBuffer(1, bufferSize, actx.sampleRate);
      const out = noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.04 * white) / 1.04;
        out[i] = last * 2.6;
      }

      const noise = actx.createBufferSource();
      noise.buffer = noiseBuf;
      noise.loop = true;

      const filter = actx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 180;
      filter.Q.value = 0.9;

      const gain = actx.createGain();
      gain.gain.value = 0.0;

      const osc = actx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 100;
      const oscGain = actx.createGain();
      oscGain.gain.value = 0.0;

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(actx.destination);

      osc.connect(oscGain);
      oscGain.connect(actx.destination);

      noise.start();
      osc.start();

      sound.ctx = actx;
      sound.engineFilter = filter;
      sound.engineGain = gain;
      sound.toneOsc = osc;
      sound.toneGain = oscGain;
    } catch (_err) {
      sound.ctx = null;
    }
  }

  function setSoundEnabled(next) {
    sound.enabled = next;
    if (next) {
      initAudio();
      if (sound.ctx && sound.ctx.state === 'suspended') {
        sound.ctx.resume().catch(function () {});
      }
    } else if (sound.ctx && sound.engineGain && sound.toneGain) {
      sound.engineGain.gain.setTargetAtTime(0, sound.ctx.currentTime, 0.04);
      sound.toneGain.gain.setTargetAtTime(0, sound.ctx.currentTime, 0.04);
    }
    soundBtn.setAttribute('aria-pressed', String(next));
    soundLabel.textContent = next ? 'Audio On' : 'Audio Off';
    soundWaves.style.display = next ? '' : 'none';
    soundMuteX.style.display = next ? 'none' : '';
  }

  function playBlip(freq, dur, vol, type) {
    if (!sound.enabled || !sound.ctx) return;
    try {
      const now = sound.ctx.currentTime;
      const osc = sound.ctx.createOscillator();
      const g = sound.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(g);
      g.connect(sound.ctx.destination);
      osc.start(now);
      osc.stop(now + dur);
    } catch (_err) {}
  }

  function playSwitchClick(high) {
    playBlip(high ? 920 : 640, 0.035, 0.045, 'square');
  }

  function updateAudio(dt) {
    if (!sound.enabled || !sound.ctx) return;
    const now = sound.ctx.currentTime;
    if (paused || plane.status === 'crashed' || plane.status === 'arrived') {
      sound.engineGain.gain.setTargetAtTime(0, now, 0.06);
      sound.toneGain.gain.setTargetAtTime(0, now, 0.06);
      return;
    }
    const spd = Math.hypot(plane.vx, plane.vy);
    const rpm = plane.rpm;
    const targetVol = Math.min(0.22, rpm * 0.14 + Math.min(0.07, spd / 1200) + plane.brake * 0.035);
    const targetFreq = 110 + rpm * 330 + spd * 1.6 + plane.brake * 130;
    sound.engineGain.gain.setTargetAtTime(targetVol, now, 0.05);
    sound.engineFilter.frequency.setTargetAtTime(targetFreq, now, 0.06);

    const turbineVol = rpm > 0.05 ? 0.014 + rpm * 0.026 : 0;
    sound.toneOsc.frequency.setTargetAtTime(85 + rpm * 210 + spd * 0.4, now, 0.06);
    sound.toneGain.gain.setTargetAtTime(turbineVol, now, 0.05);

    if (plane.isRefueling) {
      sound.refuelTimer -= dt;
      if (sound.refuelTimer <= 0) {
        sound.refuelTimer = 0.14;
        playBlip(340 + plane.fuel * 3.4, 0.08, 0.04, 'triangle');
      }
    }

    if (plane.gearWarning || plane.stallWarning) {
      sound.warnTimer -= dt;
      if (sound.warnTimer <= 0) {
        sound.warnTimer = 0.55;
        playBlip(plane.gearWarning ? 440 : 580, 0.11, 0.05, 'sawtooth');
      }
    }
  }

  // Viewport sizing
  function resize() {
    const rect = skyCanvas.parentElement.getBoundingClientRect();
    viewW = Math.max(320, rect.width);
    viewH = Math.max(180, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    skyCanvas.width = Math.round(viewW * dpr);
    skyCanvas.height = Math.round(viewH * dpr);

    const aRect = adiCanvas.getBoundingClientRect();
    if (aRect.width > 0) {
      adiCanvas.width = Math.round(aRect.width * dpr);
      adiCanvas.height = Math.round(aRect.height * dpr);
    }

    const rRect = routeCanvas.getBoundingClientRect();
    if (rRect.width > 0 && rRect.height > 0) {
      routeCanvas.width = Math.round(rRect.width * dpr);
      routeCanvas.height = Math.round(rRect.height * dpr);
    }
  }

  function worldToScreenX(wx) {
    return (wx - camera.x) * camera.scale + viewW * 0.27;
  }

  function worldToScreenY(wy) {
    return viewH * 0.58 - (wy - camera.y) * camera.scale;
  }

  function screenToWorldX(sx) {
    return (sx - viewW * 0.27) / camera.scale + camera.x;
  }

  function showBanner(msg, tone, duration) {
    liveBanner.textContent = msg;
    liveBanner.className = 'live-banner' + (tone ? ' ' + tone : '');
    liveBanner.hidden = false;
    bannerTimer = duration || 2.8;
  }

  // Cockpit Control Setters
  function setThrottleNorm(norm) {
    const clamped = Math.max(0, Math.min(1, norm));
    plane.throttleCmd = clamped;
    if (clamped > 0.08 && !plane.engineOn) {
      showBanner('ENGINE MASTER IS OFF: FLIP ENG SWITCH ON LEFT BAY', 'is-warn', 2.4);
    } else if (clamped > 0.25 && plane.onGround && plane.brakesCmd && plane.vx < 0.5) {
      showBanner('WHEEL BRAKES ARE LOCKED: FLIP BRAKES SWITCH OFF TO ROLL', 'is-warn', 2.4);
    }
  }

  function setSpoilerNorm(norm) {
    plane.spoilerCmd = Math.max(0, Math.min(1, norm));
  }

  function setPitchFromNorm(norm, snapCenter) {
    const clamped = Math.max(0, Math.min(1, norm));
    let deg = PITCH_MIN_DEG + clamped * (PITCH_MAX_DEG - PITCH_MIN_DEG);
    if (snapCenter && Math.abs(deg) < 1.3) {
      deg = 0;
    }
    plane.altHold = false;
    plane.pitchCmd = (deg * Math.PI) / 180;
  }

  function pitchToNorm(rad) {
    const deg = (rad * 180) / Math.PI;
    return Math.max(0, Math.min(1, (deg - PITCH_MIN_DEG) / (PITCH_MAX_DEG - PITCH_MIN_DEG)));
  }

  // Reusable pointer-drag + wheel + keyboard binder for vertical cockpit levers
  function bindVerticalLever(slotEl, onNormChange, getNorm, stepSize, snapZero) {
    let dragging = false;

    function updateFromClientY(clientY) {
      if (paused || outcomeShown) return;
      const rect = slotEl.getBoundingClientRect();
      const pad = 11;
      const usable = Math.max(20, rect.height - pad * 2);
      const fromBottom = rect.bottom - pad - clientY;
      const norm = Math.max(0, Math.min(1, fromBottom / usable));
      onNormChange(norm, Boolean(snapZero));
    }

    slotEl.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      dragging = true;
      updateFromClientY(e.clientY);
      try {
        slotEl.setPointerCapture(e.pointerId);
      } catch (_err) {}
    });

    slotEl.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      updateFromClientY(e.clientY);
    });

    function stopDrag() {
      dragging = false;
    }
    slotEl.addEventListener('pointerup', stopDrag);
    slotEl.addEventListener('pointercancel', stopDrag);

    slotEl.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (paused || outcomeShown) return;
      const dir = e.deltaY < 0 ? 1 : -1;
      onNormChange(getNorm() + dir * stepSize, false);
    }, { passive: false });

    slotEl.addEventListener('keydown', function (e) {
      if (paused || outcomeShown) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault();
        onNormChange(getNorm() + stepSize, false);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault();
        onNormChange(getNorm() - stepSize, false);
      } else if (e.key === 'Home') {
        e.preventDefault();
        onNormChange(0, false);
      } else if (e.key === 'End') {
        e.preventDefault();
        onNormChange(1, false);
      }
    });
  }

  bindVerticalLever(
    throttleSlot,
    function (norm) { setThrottleNorm(norm); },
    function () { return plane.throttleCmd; },
    0.05,
    false
  );

  bindVerticalLever(
    spoilerSlot,
    function (norm) { setSpoilerNorm(norm); },
    function () { return plane.spoilerCmd; },
    0.08,
    false
  );

  bindVerticalLever(
    pitchSlot,
    function (norm, snap) { setPitchFromNorm(norm, snap); },
    function () { return pitchToNorm(plane.pitchCmd); },
    0.03,
    true
  );

  // Switch & button handlers
  engSwitch.addEventListener('click', function () {
    if (paused || outcomeShown) return;
    plane.engineOn = !plane.engineOn;
    playSwitchClick(plane.engineOn);
  });

  refuelBtn.addEventListener('click', function () {
    if (paused || outcomeShown) return;
    if (plane.canRefuel) {
      plane.refuelRequested = !plane.refuelRequested;
      playSwitchClick(plane.refuelRequested);
    }
  });

  idleCutBtn.addEventListener('click', function () {
    if (paused || outcomeShown) return;
    plane.throttleCmd = 0;
    playSwitchClick(false);
  });

  spoilRetBtn.addEventListener('click', function () {
    if (paused || outcomeShown) return;
    plane.spoilerCmd = 0;
    playSwitchClick(false);
  });

  pitchZeroBtn.addEventListener('click', function () {
    if (paused || outcomeShown) return;
    plane.altHold = false;
    plane.pitchCmd = 0;
    playSwitchClick(true);
  });

  altHoldBtn.addEventListener('click', function () {
    if (paused || outcomeShown) return;
    if (plane.onGround) {
      showBanner('ALTITUDE HOLD AVAILABLE ONCE AIRBORNE', '', 2.0);
      return;
    }
    plane.altHold = !plane.altHold;
    playSwitchClick(plane.altHold);
  });

  for (let i = 0; i < flapBtns.length; i++) {
    flapBtns[i].addEventListener('click', function () {
      if (paused || outcomeShown) return;
      plane.flaps = i;
      playSwitchClick(true);
    });
  }

  gearBtn.addEventListener('click', function () {
    if (paused || outcomeShown) return;
    if (plane.onGround) {
      showBanner('WEIGHT ON WHEELS: GEAR LOCKED DOWN ON RUNWAY', '', 2.0);
      return;
    }
    plane.gearCmd = !plane.gearCmd;
    playSwitchClick(plane.gearCmd);
  });

  brakeSwitch.addEventListener('click', function () {
    if (paused || outcomeShown) return;
    plane.brakesCmd = !plane.brakesCmd;
    playSwitchClick(plane.brakesCmd);
  });

  // Top utility buttons & shortcuts
  function resetFlight(checkpoint) {
    const keepCheckpoint = plane && plane.checkpointUnlocked;
    plane = createPlane(checkpoint);
    if (keepCheckpoint) {
      plane.checkpointUnlocked = true;
    }
    particles.length = 0;
    outcomeShown = false;
    lastTouchdownSeen = '';
    lastChecklistHtml = '';
    outcomeModal.hidden = true;
    helpModal.hidden = true;
    paused = false;
    helpBtn.setAttribute('aria-expanded', 'false');

    camera.scale = 4.1;
    camera.x = plane.x;
    camera.y = plane.y + 24;

    if (checkpoint === 'refuel') {
      showBanner('READY AT MESA-4 DEPOT: RELEASE BRAKES & PUSH THROTTLE', 'is-good', 3.4);
    } else {
      liveBanner.hidden = true;
    }
    syncConsoleUI();
  }

  function setPaused(next) {
    if (outcomeShown) return;
    paused = next;
    helpModal.hidden = !paused;
    helpBtn.setAttribute('aria-expanded', String(paused));
    if (paused) {
      resumeBtn.focus();
    }
  }

  function presentOutcome() {
    outcomeShown = true;
    outcomeModal.hidden = false;

    const mins = Math.floor(plane.flightTime / 60);
    const secs = Math.floor(plane.flightTime % 60);
    statTime.textContent = mins + ':' + String(secs).padStart(2, '0');
    statFuel.textContent = Math.round(plane.fuel) + '%';
    statBurned.textContent = Math.round(plane.fuelUsedTotal) + ' u';
    statHull.textContent = Math.round(plane.hull) + '%';

    if (plane.status === 'arrived') {
      outcomeHeading.textContent = 'Touchdown Confirmed at Solis Coastal';
      const stopNote = plane.refueledOnce
        ? 'Completed scheduled refuel service at Redrock Depot and delivered cargo intact.'
        : 'Unscheduled nonstop soaring flight! You rode canyon thermals all the way to the coast.';
      outcomeDesc.textContent = stopNote + ' Final sink rate: ' + plane.lastSinkRate.toFixed(1) + ' m/s.';
      checkpointBtn.hidden = true;
      restartModalBtn.className = 'primary-btn';
      restartModalBtn.textContent = 'Fly Route Again';
      playBlip(520, 0.18, 0.08, 'triangle');
      setTimeout(function () { playBlip(690, 0.28, 0.08, 'triangle'); }, 140);
      restartModalBtn.focus();
    } else {
      outcomeHeading.textContent = 'Aircraft Lost';
      outcomeDesc.textContent = plane.failReason;
      if (plane.checkpointUnlocked) {
        checkpointBtn.hidden = false;
        restartModalBtn.className = 'secondary-btn';
        restartModalBtn.textContent = 'Restart Full Route (Kala Field)';
        checkpointBtn.focus();
      } else {
        checkpointBtn.hidden = true;
        restartModalBtn.className = 'primary-btn';
        restartModalBtn.textContent = 'Retry from Kala Field';
        restartModalBtn.focus();
      }
      playBlip(135, 0.35, 0.11, 'sawtooth');
    }
  }

  soundBtn.addEventListener('click', function () {
    setSoundEnabled(!sound.enabled);
  });
  helpBtn.addEventListener('click', function () {
    setPaused(!paused);
  });
  resumeBtn.addEventListener('click', function () {
    setPaused(false);
  });
  restartTopBtn.addEventListener('click', function () {
    resetFlight();
  });
  restartModalBtn.addEventListener('click', function () {
    resetFlight();
  });
  checkpointBtn.addEventListener('click', function () {
    resetFlight('refuel');
  });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (!outcomeShown) {
        e.preventDefault();
        setPaused(!paused);
      }
    } else if (e.key === 'm' || e.key === 'M') {
      setSoundEnabled(!sound.enabled);
    } else if (e.key === 'r' || e.key === 'R') {
      resetFlight();
    }
  });

  window.addEventListener('resize', resize);

  // Co-Pilot Checklist Builder
  function buildChecklistItems() {
    const refuelAp = WORLD.airports.refuel;
    const destAp = WORLD.airports.dest;
    const pitchDeg = Math.round((plane.pitchCmd * 180) / Math.PI);

    // 1. At KALA before takeoff
    if (plane.onGround && plane.groundedAirport === 'start') {
      return {
        phase: 'PRE-TAKEOFF:',
        steps: [
          { label: 'ENG ON', done: plane.engineOn },
          { label: 'FLAPS T/O', done: plane.flaps === 1 },
          { label: 'BRAKES OFF', done: !plane.brakesCmd },
          { label: 'THRUST >80%', done: plane.throttleCmd >= 0.78 },
          { label: 'PITCH +12° AT 25 m/s', done: pitchDeg >= 8 && plane.vx >= 23 }
        ]
      };
    }

    // 2. Stopped or rolling on MESA-4 Refuel Strip
    if (plane.onGround && plane.groundedAirport === 'refuel') {
      if (!plane.refueledOnce || plane.fuel < 98) {
        return {
          phase: 'MESA-4 SERVICE:',
          steps: [
            { label: 'STOP (<2 m/s)', done: plane.vx < 2.0 },
            { label: 'THROTTLE IDLE', done: plane.throttleCmd < 0.05 },
            { label: 'CLICK REFUEL PUMP', done: plane.isRefueling || plane.fuel >= 99.5 }
          ]
        };
      }
      return {
        phase: 'LEG 2 DEPARTURE:',
        steps: [
          { label: 'SPOILER 0%', done: plane.spoilerCmd < 0.05 },
          { label: 'FLAPS T/O', done: plane.flaps === 1 },
          { label: 'BRAKES OFF', done: !plane.brakesCmd },
          { label: 'THRUST >85%', done: plane.throttleCmd >= 0.82 },
          { label: 'PITCH +12°', done: pitchDeg >= 8 }
        ]
      };
    }

    // 3. Approaching MESA-4
    if (!plane.refueledOnce && plane.x > refuelAp.x1 - 1550 && plane.x < refuelAp.x2) {
      return {
        phase: 'APPROACH MESA-4:',
        steps: [
          { label: 'THROTTLE <35%', done: plane.throttleCmd <= 0.36 },
          { label: 'FLAPS LAND', done: plane.flaps === 2 },
          { label: 'GEAR DN (3 GRN)', done: plane.gear > 0.95 },
          { label: 'ARM BRAKES ON', done: plane.brakesCmd },
          { label: 'FLARE PITCH 0..+8°', done: pitchDeg >= -1 && pitchDeg <= 11 }
        ]
      };
    }

    // 4. Approaching SOLIS Coastal
    if (plane.x > destAp.x1 - 1650) {
      return {
        phase: 'FINAL SOLIS:',
        steps: [
          { label: 'THROTTLE <30%', done: plane.throttleCmd <= 0.32 },
          { label: 'FLAPS LAND', done: plane.flaps === 2 },
          { label: 'GEAR DN (3 GRN)', done: plane.gear > 0.95 },
          { label: 'ARM BRAKES ON', done: plane.brakesCmd },
          { label: 'SINK <4 m/s', done: plane.vy > -4.2 }
        ]
      };
    }

    // 5. En-route Climb & Cruise
    return {
      phase: 'CRUISE:',
      steps: [
        { label: 'GEAR UP', done: !plane.gearCmd && plane.gear < 0.1 },
        { label: 'FLAPS UP', done: plane.flaps === 0 },
        { label: 'SPOILER 0%', done: plane.spoilerCmd < 0.05 },
        { label: 'CRUISE THR 65-80%', done: plane.throttleCmd >= 0.55 && plane.throttleCmd <= 0.82 }
      ]
    };
  }

  function syncConsoleUI() {
    // Engine switch
    engSwitch.classList.toggle('is-on', plane.engineOn);
    engSwitch.classList.toggle('is-cue', !plane.engineOn && plane.status !== 'crashed');
    engSwitch.setAttribute('aria-pressed', String(plane.engineOn));
    engStateText.textContent = plane.engineOn ? 'IGN ON' : 'OFF';
    rpmReadout.textContent = Math.round(plane.rpm * 100) + '%';

    // Fuel & Refuel Pump button
    const fuelPct = Math.max(0, Math.round(plane.fuel));
    fuelReadout.innerHTML = fuelPct + '% <small id="flowReadout">' + plane.fuelFlow.toFixed(1) + ' u/s</small>';
    fuelBar.style.width = fuelPct + '%';
    if (fuelPct <= 15) {
      fuelBar.style.background = 'var(--danger)';
    } else if (fuelPct <= 32) {
      fuelBar.style.background = 'var(--amber)';
    } else {
      fuelBar.style.background = 'var(--green)';
    }

    if (plane.isRefueling) {
      refuelBtn.disabled = false;
      refuelBtn.className = 'pump-btn is-pumping';
      refuelBtnText.textContent = 'PUMPING FUEL (' + fuelPct + '%)';
    } else if (plane.canRefuel) {
      refuelBtn.disabled = false;
      refuelBtn.className = 'pump-btn is-ready';
      refuelBtnText.textContent = 'CONNECT MESA-4 PUMP';
    } else if (plane.onGround && plane.groundedAirport === 'refuel' && plane.fuel >= 99.5) {
      refuelBtn.disabled = true;
      refuelBtn.className = 'pump-btn';
      refuelBtnText.textContent = 'TANKS TOPPED (100%)';
    } else {
      refuelBtn.disabled = true;
      refuelBtn.className = 'pump-btn';
      refuelBtnText.textContent = 'REFUEL AT MESA-4';
    }

    // Throttle lever
    const thrCmdPct = Math.round(plane.throttleCmd * 100);
    const thrActPct = Math.round(plane.throttle * 100);
    thrReadout.textContent = thrCmdPct + '%';
    thrHandle.style.bottom = (plane.throttleCmd * 82 + 9) + '%';
    thrSlotFill.style.height = thrActPct + '%';
    throttleSlot.setAttribute('aria-valuenow', String(thrCmdPct));

    // Spoiler lever
    const spoilPct = Math.round(plane.spoilerCmd * 100);
    spoilReadout.textContent = spoilPct + '%';
    spoilHandle.style.bottom = (plane.spoilerCmd * 82 + 9) + '%';
    spoilSlotFill.style.height = Math.round(plane.brake * 100) + '%';
    spoilerSlot.setAttribute('aria-valuenow', String(spoilPct));

    // Pitch lever & Alt Hold
    const pitchDeg = Math.round((plane.pitchCmd * 180) / Math.PI);
    pitchReadout.textContent = (pitchDeg > 0 ? '+' : '') + pitchDeg + '°';
    const pNorm = pitchToNorm(plane.pitchCmd);
    pitchHandle.style.bottom = (pNorm * 84 + 8) + '%';
    pitchSlot.setAttribute('aria-valuenow', String(pitchDeg));

    altHoldBtn.setAttribute('aria-pressed', String(plane.altHold));
    altHoldBtn.textContent = plane.altHold ? 'HOLD ON' : 'ALT HOLD';

    // Flaps
    for (let i = 0; i < flapBtns.length; i++) {
      flapBtns[i].classList.toggle('is-active', plane.flaps === i);
    }

    // Gear 3-greens
    gearBtn.setAttribute('aria-pressed', String(plane.gearCmd));
    let lampClass = 'g-wheel';
    if (plane.gear > 0.96) {
      lampClass = 'g-wheel is-green';
      gearStateText.textContent = 'DOWN & LOCKED';
    } else if (plane.gear < 0.04) {
      lampClass = 'g-wheel';
      gearStateText.textContent = 'UP & STOWED';
    } else {
      lampClass = 'g-wheel is-transit';
      gearStateText.textContent = 'IN TRANSIT';
    }
    gearLampN.className = lampClass;
    gearLampL.className = lampClass;
    gearLampR.className = lampClass;

    // Wheel Brakes
    brakeSwitch.classList.toggle('is-on', plane.brakesCmd);
    brakeSwitch.setAttribute('aria-pressed', String(plane.brakesCmd));
    if (!plane.brakesCmd) {
      brakeStateText.textContent = 'RELEASED';
    } else if (plane.onGround) {
      brakeStateText.textContent = plane.vx > 0.6 ? 'BRAKING' : 'PARKED ON';
    } else {
      brakeStateText.textContent = 'ARMED FOR LAND';
    }

    // Telemetry
    const spd = Math.round(Math.hypot(plane.vx, plane.vy));
    const alt = Math.round(plane.y);
    const vsi = plane.vy;
    spdReadout.innerHTML = spd + ' <small>m/s</small>';
    altReadout.innerHTML = alt + ' <small>m</small>';
    vsiReadout.innerHTML = (vsi >= 0 ? '+' : '') + vsi.toFixed(1) + ' <small>m/s</small>';

    if (!plane.onGround && vsi < -PLANE_CFG.maxSinkSafe) {
      vsiReadout.className = 'num-val is-warn';
    } else if (!plane.onGround && vsi < 0 && vsi >= -PLANE_CFG.maxSinkButter) {
      vsiReadout.className = 'num-val is-good';
    } else {
      vsiReadout.className = 'num-val';
    }

    // Master Caution Lamps
    warnStall.className = 'warn-lamp' + (plane.stallWarning ? ' is-danger' : '');
    warnSink.className = 'warn-lamp' + (!plane.onGround && vsi < -PLANE_CFG.maxSinkSafe ? ' is-danger' : '');
    warnGear.className = 'warn-lamp' + (plane.gearWarning ? ' is-danger' : '');
    warnFlap.className = 'warn-lamp' + (plane.flapOverspeed ? ' is-caution' : '');
    warnFuel.className = 'warn-lamp' + (plane.fuel < 22 ? ' is-caution' : '');

    // Route leg & distance
    const refuelAp = WORLD.airports.refuel;
    const destAp = WORLD.airports.dest;
    if (!plane.refueledOnce && plane.x < refuelAp.x2) {
      legReadout.textContent = 'LEG 1: KALA TO MESA-4 FUEL DEPOT';
      const km = Math.max(0, (refuelAp.x1 - plane.x) / 1000);
      waypointDist.textContent = km > 0.05 ? 'MESA-4: ' + km.toFixed(1) + ' km' : 'AT MESA-4';
    } else {
      legReadout.textContent = 'LEG 2: MESA-4 TO SOLIS COASTAL';
      const km = Math.max(0, (destAp.x1 - plane.x) / 1000);
      waypointDist.textContent = km > 0.05 ? 'SOLIS: ' + km.toFixed(1) + ' km' : 'AT SOLIS';
    }

    // Co-Pilot Checklist HTML (updated only when changed)
    const chk = buildChecklistItems();
    let nextAssigned = false;
    let html = '<span class="chk-phase">' + chk.phase + '</span>';
    for (let i = 0; i < chk.steps.length; i++) {
      const st = chk.steps[i];
      let cls = 'chk-step';
      let mark = '[ ] ';
      if (st.done) {
        cls += ' is-done';
        mark = '[x] ';
      } else if (!nextAssigned) {
        cls += ' is-next';
        nextAssigned = true;
      }
      html += '<span class="' + cls + '">' + mark + st.label + '</span>';
    }
    if (html !== lastChecklistHtml) {
      checklistStrip.innerHTML = html;
      lastChecklistHtml = html;
    }

    drawADI();
    drawRouteProfile();
  }

  function drawADI() {
    const w = adiCanvas.width;
    const h = adiCanvas.height;
    if (w === 0 || h === 0) return;

    const cx = w * 0.5;
    const cy = h * 0.5;
    const r = Math.min(cx, cy) - 2 * dpr;
    const pxPerRad = r * 1.45;

    actx2d.save();
    actx2d.clearRect(0, 0, w, h);
    actx2d.beginPath();
    actx2d.arc(cx, cy, r, 0, Math.PI * 2);
    actx2d.clip();

    const horizonOffset = plane.pitch * pxPerRad;
    // Sky half
    actx2d.fillStyle = '#2d6894';
    actx2d.fillRect(0, 0, w, cy + horizonOffset);
    // Earth half
    actx2d.fillStyle = '#7d4b32';
    actx2d.fillRect(0, cy + horizonOffset, w, h - (cy + horizonOffset));

    // Horizon line
    actx2d.strokeStyle = '#f4efe6';
    actx2d.lineWidth = 1.6 * dpr;
    actx2d.beginPath();
    actx2d.moveTo(0, cy + horizonOffset);
    actx2d.lineTo(w, cy + horizonOffset);
    actx2d.stroke();

    // Pitch ladder (-20, -10, +10, +20 deg)
    actx2d.strokeStyle = 'rgba(244, 239, 230, 0.72)';
    actx2d.lineWidth = 1.1 * dpr;
    const degMarks = [-20, -10, 10, 20];
    for (let i = 0; i < degMarks.length; i++) {
      const rad = (degMarks[i] * Math.PI) / 180;
      const ly = cy + (plane.pitch - rad) * pxPerRad;
      const span = Math.abs(degMarks[i]) === 20 ? 15 * dpr : 10 * dpr;
      actx2d.beginPath();
      actx2d.moveTo(cx - span, ly);
      actx2d.lineTo(cx + span, ly);
      actx2d.stroke();
    }

    // Target Pitch Command Bug (amber brackets)
    const cmdY = cy + (plane.pitch - plane.pitchCmd) * pxPerRad;
    actx2d.strokeStyle = '#efa931';
    actx2d.lineWidth = 2 * dpr;
    actx2d.beginPath();
    actx2d.moveTo(cx - 22 * dpr, cmdY);
    actx2d.lineTo(cx - 14 * dpr, cmdY);
    actx2d.moveTo(cx + 14 * dpr, cmdY);
    actx2d.lineTo(cx + 22 * dpr, cmdY);
    actx2d.stroke();

    // Flight Path Vector (green velocity bird)
    const spd = Math.hypot(plane.vx, plane.vy);
    if (spd > 4) {
      const gamma = Math.atan2(plane.vy, Math.max(0.5, plane.vx));
      const fpvY = cy + (plane.pitch - gamma) * pxPerRad;
      actx2d.strokeStyle = '#48bd75';
      actx2d.lineWidth = 1.6 * dpr;
      actx2d.beginPath();
      actx2d.arc(cx, fpvY, 4 * dpr, 0, Math.PI * 2);
      actx2d.moveTo(cx - 9 * dpr, fpvY);
      actx2d.lineTo(cx - 4 * dpr, fpvY);
      actx2d.moveTo(cx + 4 * dpr, fpvY);
      actx2d.lineTo(cx + 9 * dpr, fpvY);
      actx2d.stroke();
    }

    // Fixed Aircraft Reference Wings (center)
    actx2d.strokeStyle = '#e45c34';
    actx2d.lineWidth = 2.4 * dpr;
    actx2d.beginPath();
    actx2d.moveTo(cx - 26 * dpr, cy);
    actx2d.lineTo(cx - 8 * dpr, cy);
    actx2d.lineTo(cx - 8 * dpr, cy + 5 * dpr);
    actx2d.moveTo(cx + 26 * dpr, cy);
    actx2d.lineTo(cx + 8 * dpr, cy);
    actx2d.lineTo(cx + 8 * dpr, cy + 5 * dpr);
    actx2d.stroke();

    actx2d.fillStyle = '#e45c34';
    actx2d.beginPath();
    actx2d.arc(cx, cy, 2.2 * dpr, 0, Math.PI * 2);
    actx2d.fill();

    actx2d.restore();
  }

  function drawRouteProfile() {
    const w = routeCanvas.width;
    const h = routeCanvas.height;
    if (w === 0 || h === 0) return;

    rctx.clearRect(0, 0, w, h);
    const maxW = WORLD.length;
    const maxElev = 620;

    rctx.fillStyle = '#2d363d';
    rctx.beginPath();
    rctx.moveTo(0, h);
    for (let px = 0; px <= w; px += 4) {
      const wx = (px / w) * maxW;
      const ty = Math.max(0, terrainHeight(wx));
      const py = h - (ty / maxElev) * (h - 6) - 2;
      rctx.lineTo(px, py);
    }
    rctx.lineTo(w, h);
    rctx.closePath();
    rctx.fill();

    const marks = [
      { ap: WORLD.airports.start, color: '#f4efe6' },
      { ap: WORLD.airports.refuel, color: '#efa931' },
      { ap: WORLD.airports.dest, color: '#48bd75' }
    ];
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      const x1 = (m.ap.x1 / maxW) * w;
      const x2 = (m.ap.x2 / maxW) * w;
      const py = h - (m.ap.elev / maxElev) * (h - 6) - 3;
      rctx.fillStyle = m.color;
      rctx.fillRect(x1, py, Math.max(4, x2 - x1), 3 * dpr);
    }

    const bx = Math.max(3, Math.min(w - 3, (plane.x / maxW) * w));
    const by = Math.max(4, Math.min(h - 4, h - (plane.y / maxElev) * (h - 6) - 2));
    rctx.fillStyle = '#e45c34';
    rctx.beginPath();
    rctx.arc(bx, by, 3.6 * dpr, 0, Math.PI * 2);
    rctx.fill();
  }

  // Simulation step
  function update(dt) {
    if (paused) {
      updateAudio(dt);
      return;
    }

    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      c.x -= c.speed * dt;
      if (c.x < -450) c.x += 9900;
    }

    if (plane.status !== 'crashed' && plane.status !== 'arrived') {
      const wasOnGround = plane.onGround;
      const prevStatus = plane.status;
      stepPlane(plane, null, dt);

      if (!wasOnGround && plane.onGround && plane.status !== 'crashed') {
        playBlip(190, 0.12, 0.07, 'sine');
        for (let i = 0; i < 8; i++) {
          spawnParticle(
            plane.x - 1.5,
            plane.y - PLANE_CFG.gearHeight + 0.3,
            plane.vx * 0.35 - Math.random() * 6,
            1.5 + Math.random() * 3.5,
            2.2 + Math.random() * 2.5,
            0.55,
            'rgba(228, 220, 206, 0.65)'
          );
        }
        if (plane.touchdownNote && plane.touchdownNote !== lastTouchdownSeen) {
          lastTouchdownSeen = plane.touchdownNote;
          showBanner(plane.touchdownNote.toUpperCase(), 'is-good', 2.8);
        }
      }

      if (plane.canRefuel && !plane.isRefueling && !plane.refueledOnce) {
        showBanner('STOPPED AT MESA-4: CLICK "CONNECT MESA-4 PUMP" ON FUEL BAY', 'is-good', 0.5);
      } else if (plane.fuel <= 0 && !plane.onGround) {
        showBanner('FUEL EXHAUSTED: TURBINE FLAMEOUT', 'is-warn', 0.5);
      }

      // Main thruster exhaust smoke
      if (plane.throttle > 0.06) {
        const cos = Math.cos(plane.pitch);
        const sin = Math.sin(plane.pitch);
        const tailX = plane.x - cos * 5.2;
        const tailY = plane.y - sin * 5.2;
        if (Math.random() < plane.throttle * 0.85) {
          spawnParticle(
            tailX,
            tailY,
            plane.vx - cos * (26 + plane.throttle * 34) + (Math.random() - 0.5) * 4,
            plane.vy - sin * (26 + plane.throttle * 34) + (Math.random() - 0.5) * 4,
            1.4 + plane.throttle * 1.9,
            0.34 + Math.random() * 0.22,
            'rgba(242, 232, 214, 0.42)'
          );
        }
      }

      // Retro-spoiler puffs
      if (plane.brake > 0.25 && plane.vx > 16 && Math.random() < 0.6) {
        spawnParticle(
          plane.x + 1.8,
          plane.y + 0.6,
          plane.vx + 18 + Math.random() * 8,
          plane.vy + 4 + (Math.random() - 0.5) * 5,
          1.2 + Math.random() * 1.3,
          0.24,
          'rgba(239, 169, 49, 0.48)'
        );
      }

      if (prevStatus !== 'crashed' && plane.status === 'crashed') {
        for (let i = 0; i < 28; i++) {
          const ang = Math.random() * Math.PI;
          const spd = 6 + Math.random() * 26;
          spawnParticle(
            plane.x,
            plane.y,
            Math.cos(ang) * spd * (Math.random() < 0.5 ? -1 : 1),
            Math.sin(ang) * spd,
            2.5 + Math.random() * 4.5,
            0.9 + Math.random() * 0.6,
            i % 2 === 0 ? 'rgba(228, 92, 52, 0.85)' : 'rgba(42, 46, 48, 0.8)'
          );
        }
        presentOutcome();
      } else if (prevStatus !== 'arrived' && plane.status === 'arrived') {
        presentOutcome();
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.radius += 2.2 * dt;
      pt.life -= dt;
      if (pt.life <= 0) particles.splice(i, 1);
    }

    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) liveBanner.hidden = true;
    }

    // Windshield camera framing
    const spd = Math.hypot(plane.vx, plane.vy);
    const groundBelow = Math.max(0, terrainHeight(plane.x + 90));
    const agl = Math.max(0, plane.y - groundBelow);
    const targetScale = Math.max(2.5, Math.min(4.2, 4.2 - agl * 0.0042 - spd * 0.006));
    camera.scale += (targetScale - camera.scale) * Math.min(1, 2.6 * dt);

    camera.x += (plane.x - camera.x) * Math.min(1, 7.5 * dt);
    const groundBiasY = (plane.y * 0.72 + groundBelow * 0.28) + 16;
    camera.y += (groundBiasY - camera.y) * Math.min(1, 4.4 * dt);

    const minCamY = groundBelow + (viewH * 0.28) / camera.scale;
    if (camera.y < minCamY && agl < 75) {
      camera.y += (minCamY - camera.y) * Math.min(1, 5.0 * dt);
    }

    syncConsoleUI();
    updateAudio(dt);
  }

  function lerpColor(c1, c2, t) {
    const k = Math.max(0, Math.min(1, t));
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * k);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * k);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * k);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function render() {
    ctx.save();
    ctx.scale(dpr, dpr);

    const routeProgress = Math.max(0, Math.min(1, camera.x / WORLD.length));
    const topValley = [44, 82, 114];
    const topMesa = [34, 74, 118];
    const topCoast = [46, 94, 132];
    const botValley = [232, 198, 152];
    const botMesa = [226, 178, 132];
    const botCoast = [242, 208, 158];

    const skyTop = routeProgress < 0.5
      ? lerpColor(topValley, topMesa, routeProgress * 2)
      : lerpColor(topMesa, topCoast, (routeProgress - 0.5) * 2);
    const skyBot = routeProgress < 0.5
      ? lerpColor(botValley, botMesa, routeProgress * 2)
      : lerpColor(botMesa, botCoast, (routeProgress - 0.5) * 2);

    const skyGrad = ctx.createLinearGradient(0, 0, 0, viewH);
    skyGrad.addColorStop(0, skyTop);
    skyGrad.addColorStop(0.68, lerpColor([118, 154, 176], [148, 178, 188], routeProgress));
    skyGrad.addColorStop(1, skyBot);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, viewW, viewH);

    const sunX = viewW * (0.78 - routeProgress * 0.22);
    const sunY = viewH * 0.22;
    ctx.fillStyle = 'rgba(252, 236, 198, 0.22)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 245, 218, 0.82)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 25, 0, Math.PI * 2);
    ctx.fill();

    drawParallaxRange(0.16, 145, 'rgba(72, 92, 108, 0.52)', 0.0024);
    drawParallaxRange(0.36, 95, 'rgba(98, 92, 88, 0.62)', 0.0042);

    drawThermals();
    drawClouds();
    drawApproachGuides();
    drawOcean();
    drawTerrain();
    drawAirportStart();
    drawRefuelDepot();
    drawAirportDest();

    for (let i = 0; i < particles.length; i++) {
      const pt = particles[i];
      const sx = worldToScreenX(pt.x);
      const sy = worldToScreenY(pt.y);
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(sx, sy, pt.radius * camera.scale * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawPlane();
    ctx.restore();
  }

  function drawParallaxRange(factor, baseElev, color, freq) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, viewH);
    const stepPx = 28;
    for (let sx = 0; sx <= viewW + stepPx; sx += stepPx) {
      const wx = camera.x * factor + (sx - viewW * 0.27) / 3.5;
      const h = baseElev +
        Math.sin(wx * freq) * 58 +
        Math.sin(wx * freq * 2.3 + 1.7) * 26 +
        Math.cos(wx * freq * 0.6) * 34;
      const sy = viewH * 0.66 - (h - camera.y * factor * 0.65) * 1.4;
      ctx.lineTo(sx, sy);
    }
    ctx.lineTo(viewW, viewH);
    ctx.closePath();
    ctx.fill();
  }

  function drawThermals() {
    const time = performance.now() * 0.001;
    for (let i = 0; i < WORLD.thermals.length; i++) {
      const th = WORLD.thermals[i];
      const leftX = worldToScreenX(th.x - th.radius);
      const rightX = worldToScreenX(th.x + th.radius);
      if (rightX < -40 || leftX > viewW + 40) continue;

      const topY = worldToScreenY(th.topY);
      const cx = worldToScreenX(th.x);

      ctx.strokeStyle = 'rgba(255, 238, 196, 0.24)';
      ctx.lineWidth = 2;
      for (let r = -1; r <= 1; r++) {
        const rx = cx + r * th.radius * 0.34 * camera.scale;
        ctx.beginPath();
        for (let h = th.baseY; h <= th.topY; h += 18) {
          const phase = ((h + time * 58 + r * 35) % (th.topY - th.baseY));
          const wy = th.baseY + phase;
          const sway = Math.sin(wy * 0.05 + time * 2 + r) * 6 * camera.scale;
          const sy = worldToScreenY(wy);
          if (h === th.baseY) ctx.moveTo(rx + sway, sy);
          else ctx.lineTo(rx + sway, sy);
        }
        ctx.stroke();
      }

      for (let b = 0; b < 2; b++) {
        const ang = time * 1.1 + b * Math.PI + i;
        const bx = cx + Math.cos(ang) * 26 * camera.scale * 0.4;
        const by = topY + 18 + Math.sin(ang * 2) * 6;
        ctx.strokeStyle = 'rgba(38, 42, 46, 0.65)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(bx - 6, by + 2);
        ctx.quadraticCurveTo(bx - 3, by - 2, bx, by + 1);
        ctx.quadraticCurveTo(bx + 3, by - 2, bx + 6, by + 2);
        ctx.stroke();
      }

      if (Math.abs(plane.x - th.x) < 520) {
        ctx.fillStyle = 'rgba(255, 244, 214, 0.7)';
        ctx.font = '700 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('THERMAL LIFT', cx, Math.max(76, topY - 8));
      }
    }
  }

  function drawClouds() {
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      const sx = worldToScreenX(c.x);
      const sy = worldToScreenY(c.y);
      const sw = c.w * camera.scale;
      const sh = c.h * camera.scale;
      if (sx + sw < -80 || sx - sw > viewW + 80) continue;

      ctx.fillStyle = 'rgba(250, 246, 238, 0.78)';
      ctx.beginPath();
      ctx.roundRect(sx - sw * 0.5, sy - sh * 0.35, sw, sh * 0.7, sh * 0.35);
      ctx.arc(sx - sw * 0.18, sy - sh * 0.25, sh * 0.52, 0, Math.PI * 2);
      ctx.arc(sx + sw * 0.14, sy - sh * 0.32, sh * 0.62, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(186, 178, 172, 0.34)';
      ctx.beginPath();
      ctx.roundRect(sx - sw * 0.48, sy + sh * 0.08, sw * 0.96, sh * 0.24, sh * 0.12);
      ctx.fill();
    }
  }

  function drawApproachGuides() {
    const targets = [WORLD.airports.refuel, WORLD.airports.dest];
    for (let i = 0; i < targets.length; i++) {
      const ap = targets[i];
      if (ap.id === 'refuel' && plane.refueledOnce && plane.x > ap.x2 - 120) continue;
      const dist = ap.x1 - plane.x;
      if (dist > -260 && dist < 1750 && !plane.onGround) {
        const touchX = ap.x1 + 75;
        const touchY = ap.elev + 2.3;
        const guideStartX = ap.x1 - 950;
        const guideStartY = touchY + 950 * 0.084;

        ctx.save();
        ctx.setLineDash([8, 8]);
        ctx.strokeStyle = 'rgba(72, 189, 117, 0.65)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(worldToScreenX(guideStartX), worldToScreenY(guideStartY));
        ctx.lineTo(worldToScreenX(touchX), worldToScreenY(touchY));
        ctx.stroke();
        ctx.restore();

        const sx = Math.min(viewW - 86, Math.max(86, worldToScreenX(ap.x1)));
        const sy = Math.max(82, Math.min(viewH - 42, worldToScreenY(ap.elev + 28)));
        if (dist > 140) {
          ctx.fillStyle = 'rgba(18, 21, 24, 0.88)';
          ctx.strokeStyle = ap.id === 'refuel' ? '#efa931' : '#48bd75';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(sx - 64, sy - 26, 128, 24, 3);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#f4efe6';
          ctx.font = '700 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(ap.code + ' ' + Math.max(0, Math.round(dist)) + 'm', sx, sy - 10);
        }
      }
    }
  }

  function drawOcean() {
    const seaLeft = worldToScreenX(8710);
    if (seaLeft > viewW) return;
    const seaTop = worldToScreenY(0);
    if (seaTop > viewH) return;

    const grad = ctx.createLinearGradient(0, seaTop, 0, viewH);
    grad.addColorStop(0, '#2a6f8e');
    grad.addColorStop(1, '#163d52');
    ctx.fillStyle = grad;
    ctx.fillRect(Math.max(0, seaLeft), seaTop, viewW - Math.max(0, seaLeft), viewH - seaTop);

    ctx.strokeStyle = 'rgba(232, 246, 252, 0.45)';
    ctx.lineWidth = 1.5;
    const t = performance.now() * 0.002;
    for (let wx = 8725; wx < 9500; wx += 26) {
      const sx = worldToScreenX(wx + Math.sin(t + wx) * 3);
      if (sx < seaLeft || sx > viewW) continue;
      ctx.beginPath();
      ctx.moveTo(sx, seaTop + 4);
      ctx.lineTo(sx + 12, seaTop + 4);
      ctx.stroke();
    }
  }

  function drawTerrain() {
    const stepPx = 8;
    const startWx = screenToWorldX(-16);
    const endWx = screenToWorldX(viewW + 16);

    ctx.beginPath();
    ctx.moveTo(-16, viewH + 20);
    for (let sx = -16; sx <= viewW + 16; sx += stepPx) {
      const wx = screenToWorldX(sx);
      ctx.lineTo(sx, worldToScreenY(terrainHeight(wx)));
    }
    ctx.lineTo(viewW + 16, viewH + 20);
    ctx.closePath();

    const progress = Math.max(0, Math.min(1, camera.x / WORLD.length));
    const earthTop = progress < 0.55 ? '#8f5338' : '#6c6848';
    const tGrad = ctx.createLinearGradient(0, viewH * 0.25, 0, viewH);
    tGrad.addColorStop(0, earthTop);
    tGrad.addColorStop(1, '#2c221e');
    ctx.fillStyle = tGrad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(232, 186, 138, 0.16)';
    ctx.lineWidth = 2;
    for (let depth = 16; depth <= 56; depth += 20) {
      ctx.beginPath();
      for (let sx = -16; sx <= viewW + 16; sx += 14) {
        const wx = screenToWorldX(sx);
        const wy = terrainHeight(wx) - depth + Math.sin(wx * 0.012) * 3;
        const sy = worldToScreenY(wy);
        if (sx === -16) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = '#473325';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let sx = -16; sx <= viewW + 16; sx += stepPx) {
      const wx = screenToWorldX(sx);
      const sy = worldToScreenY(terrainHeight(wx));
      if (sx === -16) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    const pads = [WORLD.airports.start, WORLD.airports.refuel, WORLD.airports.dest];
    for (let i = 0; i < pads.length; i++) {
      const ap = pads[i];
      if (ap.x2 < startWx || ap.x1 > endWx) continue;
      const x1 = worldToScreenX(ap.x1);
      const x2 = worldToScreenX(ap.x2);
      const y = worldToScreenY(ap.elev);
      const slabH = Math.max(5, 2.4 * camera.scale);

      ctx.fillStyle = '#2b3034';
      ctx.fillRect(x1, y - 1, x2 - x1, slabH);

      ctx.fillStyle = '#e8e2d5';
      for (let wx = ap.x1 + 18; wx < ap.x2 - 18; wx += 26) {
        const mx = worldToScreenX(wx);
        ctx.fillRect(mx, y + 1, 11 * (camera.scale / 4), 2);
      }
      ctx.fillStyle = ap.id === 'refuel' ? '#efa931' : '#f4efe6';
      ctx.fillRect(worldToScreenX(ap.x1 + 4), y - 1, 5 * (camera.scale / 4), slabH);
      ctx.fillRect(worldToScreenX(ap.x2 - 9), y - 1, 5 * (camera.scale / 4), slabH);
    }
  }

  function drawWindsock(wx, wy) {
    const sx = worldToScreenX(wx);
    const sy = worldToScreenY(wy);
    if (sx < -40 || sx > viewW + 40) return;
    const s = camera.scale;
    const poleH = 8.5 * s;
    ctx.strokeStyle = '#d8d2c7';
    ctx.lineWidth = Math.max(1.2, 0.45 * s);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx, sy - poleH);
    ctx.stroke();

    const flutter = Math.sin(performance.now() * 0.007) * 0.14;
    ctx.save();
    ctx.translate(sx, sy - poleH);
    ctx.rotate(flutter);
    ctx.fillStyle = '#e45c34';
    ctx.beginPath();
    ctx.moveTo(0, -1.2 * s);
    ctx.lineTo(5.2 * s, -0.5 * s);
    ctx.lineTo(5.2 * s, 0.7 * s);
    ctx.lineTo(0, 1.2 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4efe6';
    ctx.fillRect(1.8 * s, -0.9 * s, 1.5 * s, 1.8 * s);
    ctx.restore();
  }

  function drawAirportStart() {
    const ap = WORLD.airports.start;
    if (worldToScreenX(ap.x2 + 80) < 0 || worldToScreenX(ap.x1 - 80) > viewW) return;
    const hx = worldToScreenX(72);
    const hy = worldToScreenY(ap.elev);
    const s = camera.scale;

    ctx.fillStyle = '#434b50';
    ctx.fillRect(hx - 24 * s, hy - 13 * s, 38 * s, 13 * s);
    ctx.fillStyle = '#c8522d';
    ctx.beginPath();
    ctx.moveTo(hx - 26 * s, hy - 13 * s);
    ctx.lineTo(hx - 5 * s, hy - 19 * s);
    ctx.lineTo(hx + 16 * s, hy - 13 * s);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1b2023';
    ctx.fillRect(hx - 12 * s, hy - 9.5 * s, 18 * s, 9.5 * s);

    const tx = worldToScreenX(215);
    ctx.fillStyle = '#cfc8ba';
    ctx.fillRect(tx - 3.5 * s, hy - 20 * s, 7 * s, 20 * s);
    ctx.fillStyle = '#25333d';
    ctx.fillRect(tx - 5.5 * s, hy - 25 * s, 11 * s, 5 * s);
    ctx.fillStyle = '#e45c34';
    ctx.fillRect(tx - 6.2 * s, hy - 26.5 * s, 12.4 * s, 1.6 * s);

    const pulse = (Math.sin(performance.now() * 0.006) + 1) * 0.5;
    ctx.fillStyle = 'rgba(239, 169, 49, ' + (0.35 + pulse * 0.65).toFixed(2) + ')';
    ctx.beginPath();
    ctx.arc(tx, hy - 28 * s, 1.6 * s, 0, Math.PI * 2);
    ctx.fill();

    drawWindsock(690, ap.elev);

    ctx.fillStyle = '#f4efe6';
    ctx.font = '700 ' + Math.max(10, Math.round(3.1 * s)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KALA FIELD', hx - 5 * s, hy - 21 * s);
  }

  function drawRefuelDepot() {
    const ap = WORLD.airports.refuel;
    if (worldToScreenX(ap.x2 + 160) < 0 || worldToScreenX(ap.x1 - 160) > viewW) return;
    const s = camera.scale;
    const y = worldToScreenY(ap.elev);

    for (let wx = ap.x1 - 75; wx < ap.x1; wx += 25) {
      const lx = worldToScreenX(wx);
      const groundY = worldToScreenY(terrainHeight(wx));
      ctx.strokeStyle = '#3b4247';
      ctx.lineWidth = Math.max(1, 0.45 * s);
      ctx.beginPath();
      ctx.moveTo(lx, groundY);
      ctx.lineTo(lx, y);
      ctx.stroke();

      ctx.fillStyle = '#efa931';
      ctx.beginPath();
      ctx.arc(lx, y - 0.8 * s, 1.1 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    const papiX = worldToScreenX(ap.x1 + 32);
    const dx = (ap.x1 + 75) - plane.x;
    const dy = plane.y - (ap.elev + 2.3);
    const angle = dx > 20 ? Math.atan2(dy, dx) : 0.084;
    const goodSlope = angle > 0.05 && angle < 0.135;
    ctx.fillStyle = goodSlope ? '#48bd75' : '#e45c34';
    ctx.fillRect(papiX - 2 * s, y - 2.2 * s, 4 * s, 2.0 * s);

    const tankX = worldToScreenX(ap.gantryX - 48);
    ctx.fillStyle = '#dfd8ca';
    ctx.fillRect(tankX - 18 * s, y - 11 * s, 15 * s, 11 * s);
    ctx.fillRect(tankX - 1 * s, y - 11 * s, 15 * s, 11 * s);
    ctx.fillStyle = '#e45c34';
    ctx.fillRect(tankX - 18 * s, y - 7 * s, 15 * s, 2.4 * s);
    ctx.fillRect(tankX - 1 * s, y - 7 * s, 15 * s, 2.4 * s);

    const gx = worldToScreenX(ap.gantryX);
    ctx.strokeStyle = '#efa931';
    ctx.lineWidth = Math.max(2, 1.1 * s);
    ctx.beginPath();
    ctx.moveTo(gx - 8 * s, y);
    ctx.lineTo(gx - 6 * s, y - 15 * s);
    ctx.lineTo(gx + 8 * s, y - 15 * s);
    ctx.lineTo(gx + 10 * s, y);
    ctx.stroke();

    if (plane.isRefueling) {
      const px = worldToScreenX(plane.x);
      const py = worldToScreenY(plane.y + 0.8);
      ctx.strokeStyle = '#48bd75';
      ctx.lineWidth = Math.max(2.2, 0.85 * s);
      ctx.beginPath();
      ctx.moveTo(gx + 1 * s, y - 14.5 * s);
      ctx.quadraticCurveTo((gx + px) * 0.5, y - 4 * s, px, py);
      ctx.stroke();
    }

    drawWindsock(ap.x2 - 35, ap.elev);

    ctx.fillStyle = '#efa931';
    ctx.font = '700 ' + Math.max(10, Math.round(3.1 * s)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MESA-4 FUEL DEPOT', gx, y - 18 * s);
  }

  function drawAirportDest() {
    const ap = WORLD.airports.dest;
    if (worldToScreenX(ap.x2 + 180) < 0 || worldToScreenX(ap.x1 - 160) > viewW) return;
    const s = camera.scale;
    const y = worldToScreenY(ap.elev);

    const tx = worldToScreenX(ap.terminalX);
    ctx.fillStyle = '#e5dfd2';
    ctx.fillRect(tx - 26 * s, y - 12 * s, 52 * s, 12 * s);
    ctx.fillStyle = '#294859';
    ctx.fillRect(tx - 22 * s, y - 9 * s, 44 * s, 5.5 * s);
    ctx.fillStyle = '#3a4247';
    ctx.beginPath();
    ctx.moveTo(tx - 30 * s, y - 12 * s);
    ctx.lineTo(tx + 30 * s, y - 14.5 * s);
    ctx.lineTo(tx + 28 * s, y - 12 * s);
    ctx.closePath();
    ctx.fill();

    const lx = worldToScreenX(8705);
    ctx.fillStyle = '#f4efe6';
    ctx.beginPath();
    ctx.moveTo(lx - 3.2 * s, y);
    ctx.lineTo(lx - 2.0 * s, y - 24 * s);
    ctx.lineTo(lx + 2.0 * s, y - 24 * s);
    ctx.lineTo(lx + 3.2 * s, y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#e45c34';
    ctx.fillRect(lx - 2.7 * s, y - 15 * s, 5.4 * s, 5 * s);
    ctx.fillStyle = '#efa931';
    ctx.fillRect(lx - 2.2 * s, y - 27.5 * s, 4.4 * s, 3.5 * s);

    drawWindsock(ap.x1 + 35, ap.elev);

    ctx.fillStyle = '#48bd75';
    ctx.font = '700 ' + Math.max(10, Math.round(3.2 * s)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SOLIS COASTAL INTL', tx, y - 17 * s);
  }

  function drawPlane() {
    const sx = worldToScreenX(plane.x);
    const sy = worldToScreenY(plane.y);
    const s = camera.scale;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-plane.pitch);

    if (plane.status === 'crashed') {
      ctx.globalAlpha = 0.7;
      ctx.rotate(0.28);
    }

    // 1. Thruster & WEP Afterburner Plume
    if (plane.throttle > 0.03 && plane.status !== 'crashed') {
      const flicker = 0.86 + Math.random() * 0.28;
      const wepBoost = plane.throttle > 0.8 ? 1.28 : 1.0;
      const flameLen = (4.2 + plane.throttle * 11.2 * wepBoost) * flicker * s;
      ctx.fillStyle = plane.throttle > 0.8 ? 'rgba(239, 128, 49, 0.92)' : 'rgba(228, 92, 52, 0.84)';
      ctx.beginPath();
      ctx.moveTo(-4.8 * s, -0.9 * s);
      ctx.lineTo(-4.8 * s - flameLen, 0);
      ctx.lineTo(-4.8 * s, 0.9 * s);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fff5d6';
      ctx.beginPath();
      ctx.moveTo(-4.8 * s, -0.45 * s);
      ctx.lineTo(-4.8 * s - flameLen * 0.54, 0);
      ctx.lineTo(-4.8 * s, 0.45 * s);
      ctx.closePath();
      ctx.fill();
    }

    // 2. Retractable Landing Gear
    if (plane.gear > 0.05) {
      const ext = plane.gear;
      const wheelY = PLANE_CFG.gearHeight * ext * s;
      ctx.strokeStyle = '#c8c2b6';
      ctx.lineWidth = Math.max(1.4, 0.48 * s);
      ctx.beginPath();
      ctx.moveTo(-0.8 * s, 0.6 * s);
      ctx.lineTo(-1.3 * s, wheelY - 0.55 * s);
      ctx.moveTo(2.8 * s, 0.5 * s);
      ctx.lineTo(3.1 * s, wheelY - 0.45 * s);
      ctx.stroke();

      ctx.fillStyle = '#191c1e';
      ctx.beginPath();
      ctx.arc(-1.3 * s, wheelY - 0.45 * s, 0.72 * s, 0, Math.PI * 2);
      ctx.arc(3.1 * s, wheelY - 0.40 * s, 0.56 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Dorsal Spoiler / Airbrake Panel
    if (plane.brake > 0.04) {
      ctx.save();
      ctx.translate(-0.6 * s, -1.05 * s);
      ctx.rotate(-plane.brake * 0.95);
      ctx.fillStyle = '#e45c34';
      ctx.fillRect(0, -0.35 * s, -2.4 * s, 0.42 * s);
      ctx.restore();
    }

    // 4. Tail Fin & Elevator
    ctx.fillStyle = '#e45c34';
    ctx.beginPath();
    ctx.moveTo(-4.8 * s, -0.4 * s);
    ctx.lineTo(-5.8 * s, -3.4 * s);
    ctx.lineTo(-3.9 * s, -3.4 * s);
    ctx.lineTo(-2.4 * s, -0.7 * s);
    ctx.closePath();
    ctx.fill();

    const elevDeflect = Math.max(-0.35, Math.min(0.35, (plane.targetPitch - plane.pitch) * 1.4));
    ctx.save();
    ctx.translate(-4.6 * s, -0.7 * s);
    ctx.rotate(elevDeflect);
    ctx.fillStyle = '#d8d0c1';
    ctx.fillRect(-1.5 * s, -0.22 * s, 1.8 * s, 0.44 * s);
    ctx.restore();

    // 5. Fuselage Body
    ctx.fillStyle = '#f4efe6';
    ctx.beginPath();
    ctx.moveTo(5.6 * s, 0.15 * s);
    ctx.quadraticCurveTo(4.4 * s, -1.35 * s, 1.4 * s, -1.35 * s);
    ctx.lineTo(-4.8 * s, -0.95 * s);
    ctx.lineTo(-5.0 * s, 0.45 * s);
    ctx.lineTo(1.8 * s, 0.95 * s);
    ctx.quadraticCurveTo(4.6 * s, 0.90 * s, 5.6 * s, 0.15 * s);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#e45c34';
    ctx.beginPath();
    ctx.moveTo(5.6 * s, 0.15 * s);
    ctx.lineTo(3.4 * s, -0.35 * s);
    ctx.lineTo(3.4 * s, 0.42 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-4.8 * s, -0.15 * s, 8.3 * s, 0.36 * s);

    // Cockpit Canopy
    ctx.fillStyle = '#22313b';
    ctx.beginPath();
    ctx.moveTo(3.2 * s, -0.45 * s);
    ctx.quadraticCurveTo(2.2 * s, -1.32 * s, 0.6 * s, -1.25 * s);
    ctx.lineTo(0.6 * s, -0.42 * s);
    ctx.closePath();
    ctx.fill();

    // High Wing & Animated Trailing-Edge Flap
    ctx.fillStyle = '#dfd8c8';
    ctx.fillRect(-1.4 * s, -1.48 * s, 3.3 * s, 0.52 * s);
    if (plane.flapPos > 0.04) {
      ctx.save();
      ctx.translate(-1.3 * s, -1.05 * s);
      ctx.rotate(plane.flapPos * 0.62);
      ctx.fillStyle = '#efa931';
      ctx.fillRect(-1.5 * s, -0.18 * s, 1.5 * s, 0.36 * s);
      ctx.restore();
    }

    // Exhaust Nozzle Collar
    ctx.fillStyle = '#2e3438';
    ctx.fillRect(-5.2 * s, -0.78 * s, 0.55 * s, 1.32 * s);

    ctx.restore();
  }

  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  resize();
  resetFlight();
  requestAnimationFrame(frame);
})();
