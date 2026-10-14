// Game feel: timings and speeds. Damage numbers live in combat-rules.ts.
export const TUNING = {
  move: {
    walkSpeed: 3.6,
    sprintSpeed: 6.2,
    turnSpeed: 12,
    arenaRadius: 11,
  },
  dodge: {
    durationS: 0.45,
    speed: 9,
    invulnerableFromS: 0.05,
    invulnerableToS: 0.35,
    cooldownS: 0.1,
    // A second press this soon after the dash starts is a double tap: roll on after the dash.
    rollWindowS: 0.22,
    // A later press throws a fresh dash from this point, so dashes can be chained quickly.
    chainAtS: 0.25,
  },
  // Roll that follows a double-tapped dash.
  roll: {
    durationS: 0.6,
    speed: 6.5,
    invulnerableToS: 0.45,
  },
  jump: {
    speed: 7,
    gravity: 22,
  },
  // Greatsword slash.
  light: {
    durationS: 0.48,
    hitAtS: 0.2,
    // From here another slash (the return cut) or a dodge can cut the recovery short.
    cancelAtS: 0.32,
    // A slash started this soon after the last one swings back the other way.
    comboWindowS: 0.3,
    range: 2.6,
    // cos of half the swing arc in front of him (~65 degrees each side).
    arcCos: 0.42,
    moveFactor: 0.9,
    turnSpeed: 9,
  },
  // Crossbow volley.
  heavy: {
    durationS: 0.95,
    firstBoltAtS: 0.1,
    moveFactor: 0.5,
    boltSpeed: 30,
    boltRange: 32,
  },
  // Arm cannon.
  special: {
    durationS: 1.15,
    fireAtS: 0.45,
    shotSpeed: 22,
    shotRange: 30,
    blastRadius: 1.7,
  },
  camera: {
    distance: 4.4,
    height: 1.55,
    shoulder: 0.65,
    mouseSensitivity: 0.0025,
    stickSensitivity: 2.6,
    minPitch: -0.35,
    maxPitch: 0.9,
    // How far the reticle looks for something to aim at.
    aimRange: 40,
  },
} as const;
