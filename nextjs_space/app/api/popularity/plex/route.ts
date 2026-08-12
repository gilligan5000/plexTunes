export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { loadConfig } from '@/lib/media/factory';
import { plexFetch } from '@/lib/plex';

const PAGE_SIZE = 200;

// How many tracks per artist Plex-style "popular" (flame) flagging can cover.
const MAX_POPULAR_PER_ARTIST = 5;
// A track must have at least this share of the artist's best listener count to earn a flame.
const POPULAR_RELATIVE_FLOOR = 0.05;

/**
 * Imports Plex's native per-track popularity (ratingCount = Last.fm listener count,
 * the same data behind the little flame icon next to an artist's popular tracks).
 *
 * Unlike the Deezer/Spotify providers - which score by album/artist rank and end up
 * flagging entire albums as popular - ratingCount differs from track to track, so
 * only the actual hits float to the top.
 *
 * Listener counts span several orders of magnitude, so scores are normalized on a log
 * scale between the 5th and 99th percentile of your library. A genuine hit lands at 95-100
 * while an album cut by the same artist lands in the 40s-60s.
 */
export async function POST(_req: NextRequest) {
  try {
    const config = await loadConfig();
    if (!config) {
      return NextResponse.json({ error: 'No media server configured' }, { status: 400 });
    }
    if (config.serverType !== 'plex') {
      return NextResponse.json(
        { error: 'Plex-native popularity is only available when your media server is Plex.' },
        { status: 400 },
      );
    }
    if (!config.libraryId) {
      return NextResponse.json({ error: 'No music library selected. Run a library sync first.' }, { status: 400 });
    }

    // 1. Pull ratingCount for every track in the music library.
    const counts = new Map<string, number>();
    let start = 0;
    let total = Infinity;
    let fetched = 0;
    while (start < total) {
      const data = await plexFetch(
        config.serverUrl,
        config.token,
        `/library/sections/${config.libraryId}/all?type=10&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${PAGE_SIZE}`,
      );
      const container = data?.MediaContainer;
      total = container?.totalSize ?? container?.size ?? 0;
      const items: any[] = container?.Metadata ?? [];
      for (const t of items) {
        const rk = String(t?.ratingKey ?? '');
        if (!rk) continue;
        const rc = typeof t?.ratingCount === 'number' ? t.ratingCount : 0;
        counts.set(rk, rc);
      }
      fetched += items.length;
      start += PAGE_SIZE;
      if (items.length === 0) break;
    }

    if (counts.size === 0) {
      return NextResponse.json({ error: 'Plex returned no tracks for this library.' }, { status: 502 });
    }

    // 2. Match against the cached library.
    const cached = await prisma.cachedTrack.findMany({
      select: { id: true, ratingKey: true, artistId: true },
    });

    type Row = { id: string; artistId: string; rc: number };
    const rows: Row[] = [];
    for (const c of cached) {
      const rc = counts.get(c.ratingKey);
      if (rc === undefined) continue;
      rows.push({ id: c.id, artistId: c.artistId, rc });
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'None of your cached tracks matched the Plex library. Run a library sync first.' },
        { status: 409 },
      );
    }

    // 3. Normalize listener counts on a log scale, anchored to the library's own spread.
    //    Percentile ranking alone flattens the difference between a 5,000,000-listener hit
    //    and a 6,000-listener album cut; the log scale keeps that gap visible.
    const scored = rows.filter(r => r.rc > 0).sort((a, b) => a.rc - b.rc);
    const popularityById = new Map<string, number>();
    if (scored.length > 0) {
      const at = (p: number) => scored[Math.floor((scored.length - 1) * p)].rc;
      const lowAnchor = Math.log(1 + at(0.05));
      const highAnchor = Math.log(1 + at(0.99));
      const span = Math.max(0.0001, highAnchor - lowAnchor);
      for (const r of scored) {
        const v = (Math.log(1 + r.rc) - lowAnchor) / span;
        popularityById.set(r.id, Math.max(1, Math.min(100, Math.round(v * 100))));
      }
    }

    // 4. Flame flag: the artist's own top tracks, mirroring Plex's popular-tracks view.
    const byArtist = new Map<string, Row[]>();
    for (const r of rows) {
      if (r.rc <= 0) continue;
      const list = byArtist.get(r.artistId);
      if (list) list.push(r);
      else byArtist.set(r.artistId, [r]);
    }
    const popularIds = new Set<string>();
    byArtist.forEach((list) => {
      list.sort((a, b) => b.rc - a.rc);
      const best = list[0].rc;
      for (const r of list.slice(0, MAX_POPULAR_PER_ARTIST)) {
        if (r.rc >= best * POPULAR_RELATIVE_FLOOR) popularIds.add(r.id);
      }
    });

    // 5. Persist. Group identical values into as few updateMany calls as possible.
    await prisma.cachedTrack.updateMany({
      where: { id: { in: rows.map(r => r.id) } },
      data: { plexPopular: false },
    });

    const byValue = new Map<string, string[]>();
    for (const r of rows) {
      const pop = popularityById.get(r.id) ?? 0;
      const key = `${r.rc}|${pop}`;
      const list = byValue.get(key);
      if (list) list.push(r.id);
      else byValue.set(key, [r.id]);
    }

    let updated = 0;
    const entries = Array.from(byValue.entries());
    for (const [key, ids] of entries) {
      const [rcStr, popStr] = key.split('|');
      const rc = Number(rcStr);
      const pop = Number(popStr);
      // Chunk so the id list never gets long enough to blow the statement timeout.
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const res = await prisma.cachedTrack.updateMany({
          where: { id: { in: chunk } },
          data: rc > 0
            ? { plexRatingCount: rc, popularity: pop, spotifyChecked: true }
            : { plexRatingCount: 0 },
        });
        updated += res.count;
      }
    }

    const popularList = Array.from(popularIds);
    for (let i = 0; i < popularList.length; i += 500) {
      await prisma.cachedTrack.updateMany({
        where: { id: { in: popularList.slice(i, i + 500) } },
        data: { plexPopular: true },
      });
    }

    return NextResponse.json({
      done: true,
      plexTracks: fetched,
      matched: rows.length,
      withListeners: scored.length,
      scored: updated,
      flagged: popularIds.size,
      artists: byArtist.size,
    });
  } catch (e: any) {
    console.error('Plex popularity error:', e?.message);
    return NextResponse.json({ error: e?.message ?? 'Failed' }, { status: 500 });
  }
}

// Clear Plex-derived popularity so the provider-based check can run again.
export async function DELETE() {
  try {
    const result = await prisma.cachedTrack.updateMany({
      where: { plexRatingCount: { not: null } },
      data: { plexRatingCount: null, plexPopular: false, popularity: null, spotifyChecked: false },
    });
    return NextResponse.json({ reset: result.count });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed' }, { status: 500 });
  }
}
