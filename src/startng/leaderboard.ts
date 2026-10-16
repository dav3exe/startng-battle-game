import { askStartNg } from './connect';

// Must match the stats in public/startng.json exactly: start.ng refuses anything else.
export interface RunStats {
  waves: number;
  kills: number;
}

export interface BoardEntry {
  rank: number;
  playerId: number | null;
  name: string;
  color: string;
  waves: number;
  kills: number;
}

export interface SaveResult {
  ok: boolean;
  message: string;
}

interface ScoreReply {
  ok?: boolean;
  error?: string;
  result?: { improved?: boolean; rank?: number; stats?: Partial<RunStats> };
}

interface BoardReply {
  ok?: boolean;
  entries?: unknown;
}

const whole = (n: number): number => Math.max(0, Math.min(1_000_000_000, Math.floor(n)));
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

// Saves a run for the signed-in player. start.ng keeps only their best one.
export async function saveRun(stats: RunStats): Promise<SaveResult> {
  const reply = await askStartNg<ScoreReply>(
    { type: 'startng:score', stats: { waves: whole(stats.waves), kills: whole(stats.kills) } },
    'startng:scoreSaved',
    8000,
  );
  if (!reply) return { ok: false, message: "Couldn't reach start.ng, so this run wasn't saved" };
  if (!reply.ok) return { ok: false, message: reply.error ?? "start.ng didn't save this run" };
  const rank = reply.result?.rank;
  const rankText = typeof rank === 'number' ? ` · #${rank} on the board` : '';
  if (reply.result?.improved) return { ok: true, message: `New best!${rankText}` };
  const best = reply.result?.stats?.waves;
  return { ok: true, message: `Saved. Your best is still ${best ?? '?'} waves${rankText}` };
}

// The top runs. Works for guests too. Null if start.ng didn't answer.
export async function readBoard(limit = 10): Promise<BoardEntry[] | null> {
  const reply = await askStartNg<BoardReply>({ type: 'startng:leaderboard', limit }, 'startng:leaderboardData');
  if (!reply?.ok || !Array.isArray(reply.entries)) return null;
  return reply.entries.map((raw: unknown, i): BoardEntry => {
    const e = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    const stats = typeof e.stats === 'object' && e.stats !== null ? (e.stats as Record<string, unknown>) : {};
    return {
      rank: num(e.rank) || i + 1,
      playerId: typeof e.player_id === 'number' ? e.player_id : null,
      name: typeof e.name === 'string' ? e.name : 'Player',
      color: typeof e.color === 'string' && /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : '#8a2a22',
      waves: num(stats.waves),
      kills: num(stats.kills),
    };
  });
}
