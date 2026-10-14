// Reads keyboard, mouse and the first connected controller into one frame of input.
export interface InputFrame {
  move: { x: number; y: number };
  look: { x: number; y: number };
  sprint: boolean;
  light: boolean;
  heavy: boolean;
  special: boolean;
  dodge: boolean;
  usingGamepad: boolean;
}

type Action = 'light' | 'heavy' | 'special' | 'dodge';

const KEY_ACTIONS: Record<string, Action> = {
  KeyJ: 'light',
  KeyK: 'heavy',
  KeyE: 'special',
  KeyL: 'special',
  Space: 'dodge',
};

// Standard gamepad layout (Xbox names; PlayStation in brackets).
const PAD = {
  a: 0, // A [Cross]
  b: 1, // B [Circle]
  x: 2, // X [Square]
  y: 3, // Y [Triangle]
  rb: 5, // RB [R1]
  rt: 7, // RT [R2]
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

      if (edge(PAD.rt) || edge(PAD.x)) this.pressed.add('light');
      if (edge(PAD.y)) this.pressed.add('heavy');
      if (edge(PAD.rb)) this.pressed.add('special');
      if (edge(PAD.b) || edge(PAD.a)) this.pressed.add('dodge');
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
      usingGamepad: this.lastDevice === 'gamepad',
    };
    this.pressed.clear();
    return frame;
  }
}
