/**
 * Thin WLED client. Everything here is server-side only — the Docker container
 * talks directly to the WLED units on the LAN, browsers never do. No auth
 * required by default (WLED has none), but we treat the host as a LAN-only
 * trust boundary and never proxy these endpoints through to clients.
 */

export type WledJsonState = Record<string, any>;
export type WledJsonInfo = {
  ver?: string;
  name?: string;
  leds?: {
    count?: number;
    matrix?: { w?: number; h?: number };
  };
  [k: string]: any;
};
export type WledFullJson = {
  state?: WledJsonState;
  info?: WledJsonInfo;
  effects?: string[];
  palettes?: string[];
};

function baseUrl(host: string): string {
  const clean = (host ?? '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!clean) throw new Error('WLED host is empty');
  return `http://${clean}`;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await p; } finally { clearTimeout(timer); }
}

export async function fetchJson(host: string, path: string, timeoutMs = 4000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl(host)}${path}`, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function postState(host: string, state: WledJsonState, timeoutMs = 4000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const payload = JSON.stringify(state);
    console.log(`[WLED] POST ${baseUrl(host)}/json/state`, payload.slice(0, 500));
    const res = await fetch(`${baseUrl(host)}/json/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json().catch(() => ({}));
  } finally {
    clearTimeout(timer);
  }
}

/** Full dump: state + info + effects + palettes in a single request. */
export async function getFullJson(host: string, timeoutMs = 4000): Promise<WledFullJson> {
  return (await fetchJson(host, '/json', timeoutMs)) as WledFullJson;
}

/* ─── Colour helpers ─── */

export function hexToRgb(hex: string): [number, number, number] {
  const clean = (hex ?? '').replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const n = parseInt(full, 16);
  if (isNaN(n) || full.length !== 6) return [168, 85, 247]; // fallback violet-500
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Random vibrant palette used when colorMode === 'random'. */
const RANDOM_PALETTE: string[] = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
];
export function randomVibrantHex(): string {
  return RANDOM_PALETTE[Math.floor(Math.random() * RANDOM_PALETTE.length)];
}

/* ─── Token formatting ─── */

export type TrackTokens = {
  title?: string;
  artist?: string;
  album?: string;
  station?: string;
};

export function formatTrackText(template: string, tokens: TrackTokens): string {
  const safe = (v: string | undefined) => (v ?? '').trim();
  return (template ?? '')
    .replace(/\{title\}/gi,   safe(tokens.title))
    .replace(/\{artist\}/gi,  safe(tokens.artist))
    .replace(/\{album\}/gi,   safe(tokens.album))
    .replace(/\{station\}/gi, safe(tokens.station))
    .replace(/\s+/g, ' ')
    .trim();
}

/* ─── Segment builders ─── */

/**
 * Build a WLED segment payload for a matrix / scrolling-text output.
 *
 * Compatibility notes (WLED v16):
 * • The `n` (segment name) field is the text source for the Scrolling Text effect.
 *   v16 raised the segment name limit; we cap at 64 chars for broad compat.
 * • Effect IDs shifted in v16 — the UI detects the correct ID by name from the
 *   probed effects list. The ID stored in the DB should always be valid for the
 *   firmware version running on that device.
 * • Custom sliders (c1/c2/c3/o1) remain the same for Scrolling Text in v16:
 *   c1=Trail, c2=Font Size, c3=Y Offset, o1=Rotate.
 * • v16 adds custom font support (configured in WLED UI), palette editor, and
 *   the PixelForge tool — these are device-side features that don't affect our API.
 */
export function buildMatrixSeg(opts: {
  segmentId: number;
  text: string;
  effectId: number;
  color: string;
  speed: number;
  intensity: number;
  custom1?: number;
  custom2?: number;
  custom3?: number;
  option1?: boolean;
}) {
  const [r, g, b] = hexToRgb(opts.color);
  const seg: Record<string, any> = {
    id: opts.segmentId,
    on: true,
    n: opts.text.slice(0, 64),   // WLED segment name (text source for Scrolling Text)
    fx: opts.effectId,
    sx: opts.speed,
    ix: opts.intensity,
    col: [[r, g, b], [0, 0, 0], [0, 0, 0]],
  };
  // Custom sliders & options (c1/c2/c3/o1) — used by scrolling text etc.
  if (opts.custom1 !== undefined) seg.c1 = opts.custom1;
  if (opts.custom2 !== undefined) seg.c2 = opts.custom2;
  if (opts.custom3 !== undefined) seg.c3 = opts.custom3;
  if (opts.option1 !== undefined) seg.o1 = opts.option1;
  return seg;
}

export function buildPerimeterSeg(opts: {
  segmentId: number;
  effectId: number;
  color: string;
  paletteId: number;
  speed: number;
  intensity: number;
}) {
  const [r, g, b] = hexToRgb(opts.color);
  return {
    id: opts.segmentId,
    on: true,
    fx: opts.effectId,
    sx: opts.speed,
    ix: opts.intensity,
    pal: opts.paletteId,
    col: [[r, g, b], [0, 0, 0], [0, 0, 0]],
  };
}

/** Validate hex colour string. */
export function isValidHex(hex: string): boolean {
  return /^#?[0-9a-fA-F]{6}$/.test((hex ?? '').trim()) ||
         /^#?[0-9a-fA-F]{3}$/.test((hex ?? '').trim());
}

/** Normalise host: strip protocol, trailing slash, whitespace. */
export function normalizeHost(raw: string): string {
  return (raw ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
}
