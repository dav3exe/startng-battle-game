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
    cooldownS: 0.6,
  },
  light: {
    durationS: 0.95,
    firstBoltAtS: 0.1,
    moveFactor: 0.5,
    boltSpeed: 30,
    boltRange: 32,
  },
  heavy: {
    durationS: 0.9,
    hitAtS: 0.42,
    range: 2.6,
    // cos of half the swing arc in front of him (~65 degrees each side).
    arcCos: 0.42,
    moveFactor: 0.15,
  },
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
  },
} as const;
