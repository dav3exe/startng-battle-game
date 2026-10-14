// Reads keyboard, mouse and the first connected controller into one frame of input.
export interface InputFrame {
  move: { x: number; y: number };
  look: { x: number; y: number };
  sprint: boolean;
  light: boolean;
  heavy: boolean;
  special: boolean;
  dodge: boolean;
  jump: boolean;
  usingGamepad: boolean;
}

type Action = 'light' | 'heavy' | 'special' | 'dodge' | 'jump';

const KEY_ACTIONS: Record<string, Action> = {
  KeyJ: 'light',
  KeyK: 'heavy',
  KeyE: 'special',
  KeyL: 'special',
  // Dash; press again mid-dash to roll on.
  KeyC: 'dodge',
  Space: 'jump',
};

// Standard gamepad layout (PlayStation names; Xbox in brackets).
const PAD = {
  cross: 0, // [A]
  circle: 1, // [B]
  square: 2, // [X]
  triangle: 3, // [Y]
  r1: 5, // [RB]
  r2: 7, // [RT]
  l3: 10, // left stick click
} as const;

const DEADZONE = 0.18;

function deadzone(value: number): number {
  return Math.abs(value) < DEADZONE ? 0 : value;
}

export class Input {
  private readonly keys = new Set<string>();
  private readonly pressed = new Set<Action>();
  private mouseDX = 0;
  private mouseDY = 0;
  private padPrev: boolean[] = [];
  private lastDevice: 'keyboard' | 'gamepad' = 'keyboard';

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keys.add(event.code);
      const action = KEY_ACTIONS[event.code];
      if (action) this.pressed.add(action);
      if (event.code === 'Space') event.preventDefault();
      this.lastDevice = 'keyboard';
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('mousedown', (event) => {
      if (document.pointerLockElement !== canvas) return;
      if (event.button === 0) this.pressed.add('light');
      if (event.button === 2) this.pressed.add('heavy');
      this.lastDevice = 'keyboard';
    });
    window.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement !== canvas) return;
      this.mouseDX += event.movementX;
      this.mouseDY += event.movementY;
    });
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  frame(dt: number, mouseSensitivity: number, stickSensitivity: number): InputFrame {
    const k = (code: string): number => (this.keys.has(code) ? 1 : 0);
    let moveX = k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft');
    let moveY = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown');
    let lookX = this.mouseDX * mouseSensitivity;
    let lookY = this.mouseDY * mouseSensitivity;
    let sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    this.mouseDX = 0;
    this.mouseDY = 0;

    const pad = navigator.getGamepads ? Array.from(navigator.getGamepads()).find((p) => p !== null) : undefined;
    if (pad) {
      const buttons = pad.buttons.map((b) => b.pressed);
      const edge = (index: number): boolean => (buttons[index] ?? false) && !(this.padPrev[index] ?? false);
      const lx = deadzone(pad.axes[0] ?? 0);
      const ly = deadzone(pad.axes[1] ?? 0);
      const rx = deadzone(pad.axes[2] ?? 0);
      const ry = deadzone(pad.axes[3] ?? 0);

      if (lx !== 0 || ly !== 0 || rx !== 0 || ry !== 0 || buttons.some(Boolean)) this.lastDevice = 'gamepad';
      moveX += lx;
      moveY -= ly;
      lookX += rx * stickSensitivity * dt;
      lookY += ry * stickSensitivity * dt;
      sprint = sprint || (buttons[PAD.l3] ?? false);

      if (edge(PAD.square)) this.pressed.add('light');
      if (edge(PAD.triangle) || edge(PAD.r2)) this.pressed.add('heavy');
      if (edge(PAD.r1)) this.pressed.add('special');
      if (edge(PAD.circle)) this.pressed.add('dodge');
      if (edge(PAD.cross)) this.pressed.add('jump');
      this.padPrev = buttons;
    }

    const length = Math.hypot(moveX, moveY);
    if (length > 1) {
      moveX /= length;
      moveY /= length;
    }

    const frame: InputFrame = {
      move: { x: moveX, y: moveY },
      look: { x: lookX, y: lookY },
      sprint,
      light: this.pressed.has('light'),
      heavy: this.pressed.has('heavy'),
      special: this.pressed.has('special'),
      dodge: this.pressed.has('dodge'),
      jump: this.pressed.has('jump'),
      usingGamepad: this.lastDevice === 'gamepad',
    };
    this.pressed.clear();
    return frame;
  }
}
