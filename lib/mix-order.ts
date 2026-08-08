// Shared ordering logic for mix playback + export.
//
// Goals (per user request):
//   1. Popularity first  - each artist's most popular tracks surface earliest.
//   2. Spread artists out - avoid clusters/repeats from the same artist.
//   3. No positional bias - never favor a slice of the library (e.g. artists
//      early in the alphabet). Prior code fetched with a `take` cap and no
//      `orderBy`, so Postgres returned rows in insertion order (synced A->Z),
//      truncating late-alphabet artists out of the pool before shuffling.

export type OrderableTrack = { id?: string; artistId?: string; popularity?: number | null };

function shuffleInPlace<T>(a: T[]): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

/**
 * Arrange tracks popularity-first, then round-robin across artists so no single
 * artist clusters. Round N contains each artist's Nth most popular track, and
 * the artist order within every round is randomized to remove positional bias.
 */
export function arrangeByPopularityAndSpread<T extends OrderableTrack>(tracks: T[]): T[] {
  // Group by artist (fall back to a per-track key when artistId is missing so
  // such tracks are treated as their own "artist" rather than lumped together).
  const groups = new Map<string, T[]>();
  for (const t of tracks) {
    const key = t.artistId || `__solo_${t.id ?? Math.random().toString(36)}`;
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }

  // Within each artist: most popular first, with a random tiebreak so equally
  // popular tracks don't always appear in the same order.
  const lists: T[][] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => ((b.popularity ?? 0) - (a.popularity ?? 0)) || (Math.random() - 0.5));
    lists.push(g);
  }

  const result: T[] = [];
  let round = 0;
  let added = true;
  while (added) {
    added = false;
    const order = lists.map((_, i) => i);
    shuffleInPlace(order); // randomize artist order every round
    for (const idx of order) {
      const g = lists[idx];
      if (round < g.length) {
        result.push(g[round]);
        added = true;
      }
    }
    round++;
  }
  return result;
}
