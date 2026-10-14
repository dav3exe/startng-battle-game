import type { CharacterSpec } from '../character/character-spec';
import { COMBAT_RULES } from '../game/combat-rules';

interface OverlayHandlers {
  onToggleRotate: () => void;
  onToggleCannon: () => void;
}

export function createOverlay(spec: CharacterSpec, handlers: OverlayHandlers): void {
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed',
    'left:24px',
    'top:24px',
    'max-width:320px',
    'padding:18px 20px',
    'background:rgba(6,8,7,0.72)',
    'border:1px solid rgba(160,40,30,0.35)',
    'letter-spacing:0.02em',
    'line-height:1.5',
    'font-size:13px',
  ].join(';');

  const { light, heavy, special } = COMBAT_RULES;
  panel.innerHTML = `
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.25em;color:#8a2a22">Character preview</div>
    <div style="font-size:20px;color:#e6e0d8;margin:4px 0 12px">${spec.name}</div>
    <div style="color:#8f8a83;margin-bottom:10px">Health ${COMBAT_RULES.maxHealth}</div>
    <div><span style="color:#e6e0d8">Light</span> &middot; ${spec.attacks.light}<br>
      <span style="color:#8f8a83">${light.damagePerHit} per bolt, ${light.hits} bolts</span></div>
    <div style="margin-top:8px"><span style="color:#e6e0d8">Heavy</span> &middot; ${spec.attacks.heavy}<br>
      <span style="color:#8f8a83">${heavy.damage} damage</span></div>
    <div style="margin-top:8px"><span style="color:#e6e0d8">Special</span> &middot; ${spec.attacks.special}<br>
      <span style="color:#8f8a83">${special.damage} damage, ${special.cooldownMs / 1000}s cooldown</span></div>
  `;
  document.body.appendChild(panel);

  const hint = document.createElement('div');
  hint.style.cssText =
    'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);font-size:12px;color:#77726c;letter-spacing:0.08em';
  hint.textContent = 'Drag to rotate  ·  Scroll to zoom  ·  R auto-rotate  ·  C open the arm cannon';
  document.body.appendChild(hint);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'r' || event.key === 'R') handlers.onToggleRotate();
    if (event.key === 'c' || event.key === 'C') handlers.onToggleCannon();
  });
}
