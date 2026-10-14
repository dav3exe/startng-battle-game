import * as THREE from 'three';
import type { CharacterSpec } from '../character/character-spec';
import { COMBAT_RULES } from '../game/combat-rules';

export interface HudState {
  camera: THREE.Camera;
  playerHealth: number;
  specialLeftS: number;
  usingGamepad: boolean;
  pointerLocked: boolean;
  dummy: { position: THREE.Vector3; height: number; health: number; alive: boolean };
}

interface Floater {
  el: HTMLDivElement;
  at: THREE.Vector3;
  age: number;
}

const FLOAT_LIFE_S = 0.9;
const RED = '#b0261c';

function el(css: string, html = ''): HTMLDivElement {
  const div = document.createElement('div');
  div.style.cssText = css;
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}

function bar(width: number): { root: HTMLDivElement; fill: HTMLDivElement } {
  const root = document.createElement('div');
  root.style.cssText = `width:${width}px;height:8px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12)`;
  const fill = document.createElement('div');
  fill.style.cssText = `height:100%;width:100%;background:${RED};transition:width 0.12s`;
  root.appendChild(fill);
  return { root, fill };
}

export class Hud {
  private readonly floaters: Floater[] = [];
  private readonly playerFill: HTMLDivElement;
  private readonly playerText: HTMLDivElement;
  private readonly dummyBar: HTMLDivElement;
  private readonly dummyFill: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly reticle: HTMLDivElement;
  private readonly help: HTMLDivElement;
  private readonly keyLabels: HTMLSpanElement[] = [];
  private readonly specialSlot: HTMLDivElement;
  private readonly specialShade: HTMLDivElement;
  private readonly specialTimer: HTMLDivElement;
  private gamepadLabels = false;

  constructor(spec: CharacterSpec) {
    el(
      'position:fixed;left:24px;top:20px;letter-spacing:0.04em;pointer-events:none',
      `<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.25em;color:#8a2a22">Training ground</div>
       <div style="font-size:18px;color:#e6e0d8">${spec.name}</div>
       <div style="font-size:12px;color:#77726c;margin-top:2px">H controls · M dummy moves on/off</div>`,
    );

    const healthBox = el('position:fixed;left:24px;bottom:28px;pointer-events:none');
    const label = document.createElement('div');
    label.style.cssText = 'font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#8f8a83;margin-bottom:6px';
    label.textContent = 'Health';
    const health = bar(240);
    this.playerFill = health.fill;
    this.playerText = document.createElement('div');
    this.playerText.style.cssText = 'font-size:12px;color:#c9c4bd;margin-top:4px';
    healthBox.append(label, health.root, this.playerText);

    const abilities = el(
      'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);display:flex;gap:10px;pointer-events:none',
    );
    const slot = (name: string, detail: string): HTMLDivElement => {
      const box = document.createElement('div');
      box.style.cssText =
        'position:relative;width:118px;padding:10px 12px;background:rgba(6,8,7,0.75);border:1px solid rgba(255,255,255,0.1);overflow:hidden';
      const key = document.createElement('span');
      key.style.cssText = 'font-size:11px;color:#8a2a22;letter-spacing:0.12em';
      this.keyLabels.push(key);
      box.innerHTML = `<div style="font-size:13px;color:#e6e0d8;margin-top:2px">${name}</div><div style="font-size:11px;color:#77726c">${detail}</div>`;
      box.prepend(key);
      abilities.appendChild(box);
      return box;
    };
    const { light, heavy, special } = COMBAT_RULES;
    slot('Greatsword', `${light.damage} dmg`);
    slot('Crossbow', `${heavy.hits} × ${heavy.damagePerHit} dmg`);
    this.specialSlot = slot('Arm cannon', `${special.damage} dmg · ${special.cooldownMs / 1000}s`);
    this.specialShade = document.createElement('div');
    this.specialShade.style.cssText = 'position:absolute;left:0;bottom:0;width:100%;height:0;background:rgba(0,0,0,0.6)';
    this.specialTimer = document.createElement('div');
    this.specialTimer.style.cssText =
      'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:20px;color:#e6e0d8';
    this.specialSlot.append(this.specialShade, this.specialTimer);

    this.dummyBar = el('position:fixed;transform:translate(-50%,-100%);pointer-events:none;display:none');
    const dummyHealth = bar(110);
    this.dummyFill = dummyHealth.fill;
    this.dummyBar.appendChild(dummyHealth.root);

    this.prompt = el(
      'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);padding:14px 22px;background:rgba(6,8,7,0.8);border:1px solid rgba(160,40,30,0.4);font-size:14px;letter-spacing:0.08em;color:#e6e0d8;pointer-events:none',
      'Click to play &nbsp;·&nbsp; or press any button on a controller',
    );

    this.help = el(
      'position:fixed;right:24px;top:20px;width:290px;padding:14px 16px;background:rgba(6,8,7,0.82);border:1px solid rgba(255,255,255,0.1);font-size:12px;line-height:1.7;color:#c9c4bd;display:none',
      `<div style="color:#e6e0d8;font-size:13px;margin-bottom:6px">Controls</div>
       <div><b>Keyboard and mouse</b><br>
       WASD move · Shift sprint · Mouse look<br>
       Left click / J greatsword · Right click / K crossbow<br>
       E cannon · Double-tap Space dodge · Esc release mouse</div>
       <div style="margin-top:8px"><b>Controller (PlayStation)</b><br>
       Left stick move · L3 sprint · Right stick look<br>
       Square greatsword · Triangle / R2 crossbow<br>
       R1 cannon · Circle / Cross dodge</div>`,
    );

    // Red dot in the screen centre; bolts and the cannon fly to whatever it is on.
    this.reticle = el(
      'position:fixed;left:50%;top:50%;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;border-radius:50%;background:#ff2a1a;box-shadow:0 0 4px rgba(255,40,20,0.8);pointer-events:none;display:none',
    );

    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyH') this.help.style.display = this.help.style.display === 'none' ? 'block' : 'none';
    });
    this.setKeyLabels(false);
  }

  spawnDamage(at: THREE.Vector3, amount: number): void {
    const div = el(
      'position:fixed;transform:translate(-50%,-50%);font-size:18px;font-weight:600;color:#ff5a3a;text-shadow:0 0 6px rgba(0,0,0,0.9);pointer-events:none',
      `${amount}`,
    );
    this.floaters.push({ el: div, at: at.clone(), age: 0 });
  }

  update(dt: number, state: HudState): void {
    const pct = Math.max(0, state.playerHealth / COMBAT_RULES.maxHealth) * 100;
    this.playerFill.style.width = `${pct}%`;
    this.playerText.textContent = `${Math.round(state.playerHealth)} / ${COMBAT_RULES.maxHealth}`;

    if (state.usingGamepad !== this.gamepadLabels) this.setKeyLabels(state.usingGamepad);

    const left = state.specialLeftS;
    const total = COMBAT_RULES.special.cooldownMs / 1000;
    this.specialShade.style.height = `${(left / total) * 100}%`;
    this.specialTimer.textContent = left > 0 ? `${Math.ceil(left)}` : '';

    const playing = state.pointerLocked || state.usingGamepad;
    this.prompt.style.display = playing ? 'none' : 'block';
    this.reticle.style.display = playing ? 'block' : 'none';

    const top = state.dummy.position.clone().setY(state.dummy.position.y + state.dummy.height + 0.35);
    const screen = this.toScreen(top, state.camera);
    if (screen && state.dummy.alive) {
      this.dummyBar.style.display = 'block';
      this.dummyBar.style.left = `${screen.x}px`;
      this.dummyBar.style.top = `${screen.y}px`;
      this.dummyFill.style.width = `${(state.dummy.health / COMBAT_RULES.maxHealth) * 100}%`;
    } else {
      this.dummyBar.style.display = 'none';
    }

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      if (!f) continue;
      f.age += dt;
      const p = this.toScreen(f.at.clone().setY(f.at.y + f.age * 0.9), state.camera);
      if (p) {
        f.el.style.left = `${p.x}px`;
        f.el.style.top = `${p.y}px`;
      }
      f.el.style.opacity = `${1 - f.age / FLOAT_LIFE_S}`;
      if (f.age >= FLOAT_LIFE_S) {
        f.el.remove();
        this.floaters.splice(i, 1);
      }
    }
  }

  private setKeyLabels(gamepad: boolean): void {
    this.gamepadLabels = gamepad;
    const labels = gamepad ? ['Square', 'Triangle / R2', 'R1'] : ['LMB / J', 'RMB / K', 'E'];
    this.keyLabels.forEach((span, i) => {
      span.textContent = labels[i] ?? '';
    });
  }

  private toScreen(point: THREE.Vector3, camera: THREE.Camera): { x: number; y: number } | null {
    const v = point.clone().project(camera);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }
}
