import { askStartNg } from './connect';

// The start.ng character look (https://start.ng/docs.md, "Character style fields").
export const BODIES = ['female', 'male'] as const;
export const HAIRS = ['short', 'afro', 'braids', 'bun', 'ponytail', 'dreads', 'bald'] as const;
export const HATS = ['none', 'cap', 'beanie', 'tophat', 'crown'] as const;
export const ACCESSORIES = ['none', 'glasses', 'earrings', 'beard', 'scarf', 'backpack'] as const;

export interface CharacterStyle {
  body: (typeof BODIES)[number];
  primaryColor: string;
  secondaryColor: string;
  skinColor: string;
  hairColor: string;
  hair: (typeof HAIRS)[number];
  hat: (typeof HATS)[number];
  accessory: (typeof ACCESSORIES)[number];
}

export interface StartNgPlayer {
  id: number | null;
  name: string;
  account: string | null;
  face: string | null;
  style: CharacterStyle;
  signedIn: boolean;
}

// Used when start.ng doesn't answer (opened locally) or sends nothing usable.
export const FALLBACK_STYLE: CharacterStyle = {
  body: 'male',
  primaryColor: '#4b7bec',
  secondaryColor: '#2b2f4a',
  skinColor: '#8d5524',
  hairColor: '#17120f',
  hair: 'short',
  hat: 'none',
  accessory: 'none',
};

const HEX = /^#[0-9a-f]{6}$/i;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((option) => option === value) ?? fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX.test(value) ? value : fallback;
}

// start.ng may add options later: anything missing or unknown falls back to something sensible.
export function normalizeStyle(raw: unknown): CharacterStyle {
  const s = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const f = FALLBACK_STYLE;
  return {
    body: oneOf(s.body, BODIES, f.body),
    primaryColor: color(s.primaryColor, f.primaryColor),
    secondaryColor: color(s.secondaryColor, f.secondaryColor),
    skinColor: color(s.skinColor, f.skinColor),
    hairColor: color(s.hairColor, f.hairColor),
    hair: oneOf(s.hair, HAIRS, f.hair),
    hat: oneOf(s.hat, HATS, f.hat),
    accessory: oneOf(s.accessory, ACCESSORIES, f.accessory),
  };
}

interface RawPlayer {
  id?: unknown;
  name?: unknown;
  account?: unknown;
  style?: unknown;
  face?: unknown;
}

interface WhoAmIReply {
  user?: RawPlayer | null;
  guest?: RawPlayer;
}

function toPlayer(raw: RawPlayer, signedIn: boolean): StartNgPlayer {
  return {
    id: typeof raw.id === 'number' ? raw.id : null,
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'Guest',
    account: typeof raw.account === 'string' && raw.account ? raw.account : null,
    face: typeof raw.face === 'string' && raw.face.startsWith('data:image/') ? raw.face : null,
    style: normalizeStyle(raw.style),
    signedIn,
  };
}

// Who's playing: the signed-in player, start.ng's guest, or null if start.ng didn't answer.
export async function fetchPlayer(): Promise<StartNgPlayer | null> {
  const reply = await askStartNg<WhoAmIReply>({ type: 'startng:whoami' }, 'startng:user');
  if (!reply) return null;
  if (reply.user) return toPlayer(reply.user, true);
  if (reply.guest) return toPlayer(reply.guest, false);
  return null;
}
