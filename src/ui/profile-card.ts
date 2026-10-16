import type { StartNgPlayer } from '../startng/player-style';

// Who's playing on start.ng: face, character name and @account, with a sign-in button for guests.
export class ProfileCard {
  private readonly root: HTMLDivElement;
  private readonly face: HTMLImageElement;
  private readonly name: HTMLElement;
  private readonly account: HTMLSpanElement;
  private readonly signIn: HTMLButtonElement;

  constructor(onSignIn: () => void) {
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;left:50%;top:16px;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:5px 14px 5px 5px;border-radius:999px;background:rgba(6,8,7,0.82);border:1px solid rgba(160,40,30,0.35);max-width:calc(100vw - 32px);box-sizing:border-box';
    this.face = document.createElement('img');
    this.face.alt = '';
    this.face.style.cssText = 'width:36px;height:36px;border-radius:50%;background:#1a1f1b;object-fit:cover;flex:none';
    const text = document.createElement('div');
    text.style.cssText = 'min-width:0;line-height:1.2';
    this.name = document.createElement('b');
    this.name.style.cssText = 'display:block;font-size:14px;color:#e6e0d8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    this.account = document.createElement('span');
    this.account.style.cssText = 'font-size:11px;color:#8f8a83';
    text.append(this.name, this.account);
    this.signIn = document.createElement('button');
    this.signIn.textContent = 'Sign in';
    this.signIn.style.cssText =
      'margin-left:6px;border:0;border-radius:999px;padding:6px 12px;background:#b0261c;color:#fffefa;font-weight:700;font-size:12px;cursor:pointer;flex:none';
    this.signIn.addEventListener('click', onSignIn);
    this.root.append(this.face, text, this.signIn);
    document.body.appendChild(this.root);
    this.set(null);
  }

  // null: start.ng didn't answer (the game isn't on *.start.ng, or it's offline).
  set(player: StartNgPlayer | null): void {
    this.face.hidden = !player?.face;
    if (player?.face) this.face.src = player.face;
    this.name.textContent = player?.name ?? 'Guest';
    if (!player) this.account.textContent = 'start.ng not connected';
    else this.account.textContent = player.signedIn && player.account ? `@${player.account}` : 'Not signed in';
    this.signIn.hidden = !player || player.signedIn;
  }
}
