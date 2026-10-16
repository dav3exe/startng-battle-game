// Talks to start.ng through its hidden connect page (https://start.ng/docs.md, "Talk to start.ng").
// It only answers games served from *.start.ng; anywhere else every call resolves to null.
const START_NG = 'https://start.ng';
let frame: Promise<HTMLIFrameElement> | undefined;

function connectFrame(): Promise<HTMLIFrameElement> {
  frame ??= new Promise((resolve, reject) => {
    const el = document.createElement('iframe');
    el.src = `${START_NG}/connect`;
    el.hidden = true;
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('start.ng connect page did not load'));
    document.body.append(el);
  });
  return frame;
}

// Sends a message and resolves to start.ng's reply, or null if it didn't answer in time.
export function askStartNg<T extends object>(
  message: Record<string, unknown>,
  replyType: string,
  timeoutMs = 5000,
): Promise<T | null> {
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    let el: HTMLIFrameElement | null = null;
    let settled = false;

    const onMessage = (event: MessageEvent<unknown>): void => {
      // The origin and source checks are what make the reply trustworthy.
      if (!el || event.origin !== START_NG || event.source !== el.contentWindow) return;
      const data = event.data;
      if (typeof data !== 'object' || data === null) return;
      const reply = data as { type?: unknown; requestId?: unknown };
      if (reply.type === replyType && reply.requestId === requestId) finish(data as T);
    };
    const finish = (reply: T | null): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(reply);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);

    window.addEventListener('message', onMessage);
    connectFrame().then(
      (frameEl) => {
        el = frameEl;
        frameEl.contentWindow?.postMessage({ ...message, requestId }, START_NG);
      },
      () => finish(null),
    );
  });
}

export function signInUrl(): string {
  return `${START_NG}/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;
}

// After sign-in start.ng sends the player back with a game session in the address. This game
// talks through the connect page instead, so it only tidies the address.
export function cleanSessionFromAddress(): void {
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.get('startng_session')) history.replaceState(null, '', location.pathname + location.search);
}
