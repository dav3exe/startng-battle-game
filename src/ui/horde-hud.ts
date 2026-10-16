import type * as THREE from 'three';
import type { Horde } from '../horde/horde';
import type { BoardEntry } from '../startng/leaderboard';
import type { StartNgPlayer } from '../startng/player-style';

export interface HordeHudState {
  camera: THREE.Camera;
  horde: Horde;
  playing: boolean;
}

interface HordeHudHandlers {
  start: () => void;
  signIn: () => void;
}

type WaveMark = 'fighting' | 'survived' | 'fell';

const RED = '#b0261c';
const MAX_TRACKER_ROWS = 8;
const PANEL =
  'background:rgba(6,8,7,0.86);border:1px solid rgba(160,40,30,0.4);color:#c9c4bd;box-sizing:border-box';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, parent: HTMLElement = document.body): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.style.cssText = css;
  parent.appendChild(node);
  return node;
}

// Everything the horde puts on screen: wave status, the wave tracker, announcements, zombie
// health bars, the hurt flash, and the start / game-over panel with the start.ng leaderboard.
export class HordeHud {
  private readonly status: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly tracker: HTMLDivElement;
  private readonly announcer: HTMLDivElement;
  private readonly vignette: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly panelTitle: HTMLDivElement;
  private readonly panelText: HTMLDivElement;
  private readonly saveText: HTMLDivElement;
  private readonly startButton: HTMLButtonElement;
  private readonly signInButton: HTMLButtonElement;
  private readonly boardList: HTMLOListElement;
  private readonly bars: HTMLDivElement[] = [];
  private readonly marks: Array<{ wave: number; mark: WaveMark }> = [];
  private player: StartNgPlayer | null = null;
  private board: BoardEntry[] | null = null;
  private announceLeft = 0;
  private hurt = 0;
  private lastRun: { waves: number; kills: number; fellOn: number } | null = null;

  constructor(handlers: HordeHudHandlers) {
    this.status = el(
      'div',
      'position:fixed;left:50%;top:66px;transform:translateX(-50%);font-size:13px;letter-spacing:0.08em;color:#e6e0d8;text-shadow:0 0 6px rgba(0,0,0,0.9);pointer-events:none;white-space:nowrap;display:none',
    );
    this.hint = el(
      'div',
      `position:fixed;left:50%;top:66px;transform:translateX(-50%);padding:6px 14px;font-size:12px;letter-spacing:0.08em;pointer-events:none;white-space:nowrap;display:none;${PANEL}`,
    );
    this.hint.textContent = 'Enter / Options · face the horde';
    this.tracker = el(
      'div',
      `position:fixed;right:24px;bottom:28px;min-width:170px;padding:10px 14px;font-size:12px;line-height:1.8;pointer-events:none;display:none;${PANEL}`,
    );
    this.announcer = el(
      'div',
      'position:fixed;left:50%;top:26%;transform:translate(-50%,-50%);text-align:center;font-size:42px;letter-spacing:0.2em;text-transform:uppercase;color:#e6e0d8;text-shadow:0 0 18px rgba(176,38,28,0.9),0 0 4px #000;pointer-events:none;opacity:0;white-space:nowrap',
    );
    this.vignette = el(
      'div',
      'position:fixed;inset:0;pointer-events:none;box-shadow:inset 0 0 160px 40px rgba(176,20,10,0.85);opacity:0',
    );

    // Sits above the "Click to play" prompt in the middle of the screen.
    this.panel = el(
      'div',
      `position:fixed;left:50%;top:50%;transform:translate(-50%,calc(-100% - 36px));width:min(420px,calc(100vw - 32px));max-height:calc(50vh - 60px);overflow:auto;padding:16px 18px;display:none;${PANEL}`,
    );
    this.panelTitle = el('div', 'font-size:20px;letter-spacing:0.12em;text-transform:uppercase;color:#e6e0d8', this.panel);
    this.panelText = el('div', 'font-size:13px;line-height:1.5;margin-top:6px', this.panel);
    this.saveText = el('div', 'font-size:12px;color:#d8b46a;margin-top:6px', this.panel);
    const buttons = el('div', 'display:flex;flex-wrap:wrap;gap:8px;margin-top:12px', this.panel);
    const button = (label: string, primary: boolean): HTMLButtonElement => {
      const b = el(
        'button',
        `border:1px solid ${RED};padding:8px 14px;font-size:13px;letter-spacing:0.06em;cursor:pointer;color:#fffefa;background:${primary ? RED : 'transparent'}`,
        buttons,
      );
      b.textContent = label;
      return b;
    };
    this.startButton = button('Face the horde · Enter', true);
    this.startButton.addEventListener('click', handlers.start);
    this.signInButton = button('Sign in to save runs', false);
    this.signInButton.addEventListener('click', handlers.signIn);
    el('div', 'font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#8a2a22;margin-top:14px', this.panel).textContent =
      'Leaderboard';
    this.boardList = el('ol', 'list-style:none;margin:6px 0 0;padding:0;font-size:13px', this.panel);
    this.setPlayer(null);
  }

  setPlayer(player: StartNgPlayer | null): void {
    this.player = player;
    this.signInButton.hidden = !player || player.signedIn;
    this.renderBoard();
  }

  setBoard(board: BoardEntry[] | null): void {
    this.board = board;
    this.renderBoard();
  }

  setSaveMessage(text: string): void {
    this.saveText.textContent = text;
  }

  runStarted(): void {
    this.marks.length = 0;
    this.lastRun = null;
    this.saveText.textContent = '';
  }

  waveStarted(wave: number): void {
    this.marks.push({ wave, mark: 'fighting' });
    this.renderTracker();
    this.announce(`Wave ${wave}`);
  }

  waveCleared(wave: number): void {
    const row = this.marks.find((m) => m.wave === wave);
    if (row) row.mark = 'survived';
    this.renderTracker();
    this.announce(`Wave ${wave} survived`);
  }

  runEnded(waves: number, kills: number, fellOn: number): void {
    const row = this.marks.find((m) => m.wave === fellOn);
    if (row) row.mark = 'fell';
    this.renderTracker();
    this.lastRun = { waves, kills, fellOn };
    this.announce('You fell');
    this.saveText.textContent = this.player?.signedIn ? 'Saving your run to start.ng…' : 'Sign in on start.ng to put your runs on the board.';
  }

  playerHit(): void {
    this.hurt = 1;
  }

  update(dt: number, state: HordeHudState): void {
    const { horde, playing } = state;

    this.status.style.display = horde.running ? 'block' : 'none';
    if (horde.running) {
      const doing = horde.phase === 'cleared' ? 'survived · next wave soon' : `${horde.remaining} left`;
      this.status.textContent = `WAVE ${horde.wave} · ${doing} · ${horde.kills} slain`;
    }
    this.hint.style.display = horde.phase === 'idle' && playing ? 'block' : 'none';
    this.tracker.style.display = this.marks.length > 0 ? 'block' : 'none';

    const showPanel = horde.canStart && (!playing || horde.phase === 'over');
    this.panel.style.display = showPanel ? 'block' : 'none';
    if (showPanel) this.renderPanelText(horde);

    this.announceLeft = Math.max(0, this.announceLeft - dt);
    this.announcer.style.opacity = `${Math.min(1, this.announceLeft / 0.5)}`;
    this.hurt = Math.max(0, this.hurt - dt * 2.5);
    const down = horde.playerDown ? 0.9 : 0;
    this.vignette.style.opacity = `${Math.max(this.hurt * 0.8, down)}`;

    this.updateBars(state);
  }

  private announce(text: string): void {
    this.announcer.textContent = text;
    this.announceLeft = 2.2;
  }

  private renderPanelText(horde: Horde): void {
    const run = this.lastRun;
    if (horde.phase === 'over' && run) {
      this.panelTitle.textContent = `You fell on wave ${run.fellOn}`;
      this.panelText.textContent = `Waves survived: ${run.waves} · Zombies slain: ${run.kills}`;
      this.startButton.textContent = 'Try again · Enter';
    } else {
      this.panelTitle.textContent = 'The horde';
      this.panelText.textContent =
        'Your start.ng character has risen, again and again: walkers, crawlers, leapers and flyers. Every wave is bigger. Survive as many as you can.';
      this.startButton.textContent = 'Face the horde · Enter';
    }
  }

  private renderTracker(): void {
    this.tracker.replaceChildren();
    const title = el('div', 'font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#8a2a22', this.tracker);
    title.textContent = 'Waves';
    const hidden = this.marks.length - MAX_TRACKER_ROWS;
    if (hidden > 0) el('div', 'color:#77726c', this.tracker).textContent = `+ ${hidden} earlier survived`;
    for (const { wave, mark } of this.marks.slice(-MAX_TRACKER_ROWS)) {
      const row = el('div', 'display:flex;justify-content:space-between;gap:16px', this.tracker);
      el('span', 'color:#e6e0d8', row).textContent = `Wave ${wave}`;
      const tag = el('span', '', row);
      if (mark === 'survived') {
        tag.textContent = '✓ survived';
        tag.style.color = '#8fd06a';
      } else if (mark === 'fell') {
        tag.textContent = '✗ fell';
        tag.style.color = '#ff5a3a';
      } else {
        tag.textContent = 'fighting…';
        tag.style.color = '#d8b46a';
      }
    }
  }

  // Names come from other players, so they only ever go in as text.
  private renderBoard(): void {
    this.boardList.replaceChildren();
    if (this.board === null) {
      el('li', 'color:#77726c', this.boardList).textContent = this.player
        ? 'Loading the leaderboard…'
        : 'The leaderboard shows once the game is played on start.ng.';
      return;
    }
    if (this.board.length === 0) {
      el('li', 'color:#77726c', this.boardList).textContent = 'No runs yet. Be the first.';
      return;
    }
    for (const entry of this.board) {
      const mine = this.player?.signedIn && entry.playerId !== null && entry.playerId === this.player.id;
      const row = el(
        'li',
        `display:flex;align-items:center;gap:8px;padding:3px 6px;${mine ? 'background:rgba(176,38,28,0.25)' : ''}`,
        this.boardList,
      );
      el('span', 'width:26px;color:#8f8a83', row).textContent = `#${entry.rank}`;
      el('span', `width:8px;height:8px;border-radius:50%;flex:none;background:${entry.color}`, row);
      el('span', 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e6e0d8', row).textContent =
        entry.name;
      el('span', 'white-space:nowrap', row).textContent = `${entry.waves} waves · ${entry.kills} slain`;
    }
  }

  private updateBars(state: HordeHudState): void {
    const live = state.horde.zombies.filter((z) => z.alive);
    while (this.bars.length < live.length) {
      const bar = el(
        'div',
        'position:fixed;width:56px;height:5px;transform:translate(-50%,-100%);background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);pointer-events:none',
      );
      el('div', `height:100%;background:${RED}`, bar);
      this.bars.push(bar);
    }
    this.bars.forEach((bar, i) => {
      const z = live[i];
      const top = z?.position.clone().setY(z.position.y + z.height + 0.3).project(state.camera);
      if (!z || !top || top.z > 1 || z.health >= z.maxHealth) {
        bar.style.display = 'none';
        return;
      }
      bar.style.display = 'block';
      bar.style.left = `${(top.x * 0.5 + 0.5) * window.innerWidth}px`;
      bar.style.top = `${(-top.y * 0.5 + 0.5) * window.innerHeight}px`;
      const fill = bar.firstElementChild;
      if (fill instanceof HTMLElement) fill.style.width = `${(z.health / z.maxHealth) * 100}%`;
    });
  }
}
