export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActiveAdapter } from '@/lib/media/factory';
import { stripIdPrefix } from '@/lib/media/types';
import { mapGenreToStation, getDecadeFromYear } from '@/lib/stations';

/** Collect ALL tracks that a mix resolves to (no shuffle, high limit). */
type ResolvedTrack = { id: string; duration: number; emphasized: boolean };

async function resolveMixTracks(mix: any): Promise<ResolvedTrack[]> {
  const include = {
    artist: { select: { name: true, thumb: true } },
    album: { select: { title: true, thumb: true, year: true, genre: true } },
  };
  let allTracks: any[] = [];
  // Track which tracks came from emphasized artists/albums so they are never
  // diluted away in a size-targeted export.
  const emphasizedIds = new Set<string>();

  // Station tracks
  if (mix.stationIds?.length > 0) {
    const stations = await prisma.station.findMany({
      where: { id: { in: mix.stationIds }, isActive: true },
    });
    for (const station of stations) {
      if ((station as any).stationType === 'most-played') {
        const topPlayed = await prisma.cachedTrack.findMany({
          where: { playCount: { gt: 0 }, banned: false },
          orderBy: [{ playCount: 'desc' }, { lastPlayedAt: 'desc' }],
          take: 200,
          include,
        });
        allTracks.push(...topPlayed);
      } else if ((station as any).stationType === 'hits') {
        const minPop = (station as any).minPopularity || 40;
        const where: any = { popularity: { gte: minPop }, banned: false };
        if ((station as any).decade) {
          const d = parseInt((station as any).decade, 10);
          if (!isNaN(d)) where.year = { gte: d, lt: d + 10 };
        }
        const tracks = await prisma.cachedTrack.findMany({ where, orderBy: { popularity: 'desc' }, take: 500, include });
        let filtered = tracks;
        if ((station as any).genre) {
          filtered = tracks.filter((t: any) => {
            const sg = mapGenreToStation(t?.genre, t?.album?.genre);
            return sg.includes((station as any).genre ?? '');
          });
        }
        allTracks.push(...filtered.slice(0, 200));
      } else {
        // Standard genre/decade station
        const tracks = await prisma.cachedTrack.findMany({ where: { year: { not: null }, banned: false }, include });
        const matching = tracks.filter((t: any) => {
          const td = getDecadeFromYear(t?.year);
          if (td !== (station as any)?.decade) return false;
          const tg = mapGenreToStation(t?.genre, t?.album?.genre);
          return tg?.includes?.((station as any)?.genre ?? '') ?? false;
        });
        allTracks.push(...matching.slice(0, 200));
      }
    }
  }

  // Artist tracks (optionally restricted to specific albums).
  // IMPORTANT: when a specific album is explicitly selected for an artist, ALL
  // of that album's tracks are included regardless of the "popular only" toggle
  // — hand-picking an album is an explicit request for those songs.
  if (mix.artistIds?.length > 0) {
    const albumIds: string[] = mix.albumIds ?? [];
    const albumsByArtist: Record<string, string[]> = {};
    if (albumIds.length > 0) {
      const selAlbums = await prisma.cachedAlbum.findMany({
        where: { id: { in: albumIds } },
        select: { id: true, artistId: true },
      });
      for (const a of selAlbums) (albumsByArtist[a.artistId] ??= []).push(a.id);
    }

    const albumConds: any[] = [];
    const plainArtistIds: string[] = [];
    for (const id of mix.artistIds as string[]) {
      if (albumsByArtist[id]?.length) albumConds.push({ artistId: id, albumId: { in: albumsByArtist[id] } });
      else plainArtistIds.push(id);
    }

    // Selected-album tracks: no popularity filter.
    if (albumConds.length > 0) {
      const albumTracks = await prisma.cachedTrack.findMany({ where: { OR: albumConds, banned: false }, include, take: 500 });
      for (const t of albumTracks) emphasizedIds.add(t.id);
      allTracks.push(...albumTracks);
    }
    // Whole-artist tracks: honor the popular-only toggle.
    if (plainArtistIds.length > 0) {
      const artistWhere: any = { artistId: { in: plainArtistIds }, banned: false };
      if (mix.popularOnly) artistWhere.popularity = { gte: 1 };
      const artistTracks = await prisma.cachedTrack.findMany({ where: artistWhere, include, take: 500 });
      for (const t of artistTracks) emphasizedIds.add(t.id);
      allTracks.push(...artistTracks);
    }
  }

  // Deduplicate by cachedTrack.id
  const seen = new Set<string>();
  const unique = allTracks.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  // Return raw media-server IDs (strip the track- prefix) with durations (ms)
  return unique.map((t: any) => ({ id: stripIdPrefix(t.id), duration: t?.duration ?? 0, emphasized: emphasizedIds.has(t.id) }));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const mix = await prisma.mix.findUnique({ where: { id: params.id } });
    if (!mix) return NextResponse.json({ error: 'Mix not found' }, { status: 404 });

    const result = await getActiveAdapter();
    if (!result) return NextResponse.json({ error: 'No media server configured' }, { status: 400 });

    const resolved = await resolveMixTracks(mix);
    if (resolved.length === 0) {
      return NextResponse.json({ error: 'Mix has no tracks to export' }, { status: 400 });
    }

    // Optional target sizing: ?limit=<songs> or ?minutes=<total minutes>
    const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '', 10);
    const minutesParam = parseInt(req.nextUrl.searchParams.get('minutes') ?? '', 10);
    let selected = resolved;
    const applyTarget = (!isNaN(limitParam) && limitParam > 0) || (!isNaN(minutesParam) && minutesParam > 0);

    if (applyTarget) {
      const shuffle = <T,>(a: T[]) => a.map(v => [Math.random(), v] as [number, T]).sort((x, y) => x[0] - y[0]).map(([, v]) => v);
      // Split emphasized (artist/album) tracks from station fill, shuffle each,
      // then weave emphasized tracks evenly through the result so hand-picked
      // artists/albums are guaranteed representation instead of being diluted.
      const emphasized = shuffle(resolved.filter(t => t.emphasized));
      const fill = shuffle(resolved.filter(t => !t.emphasized));
      const woven: ResolvedTrack[] = [];
      let ei = 0, fi = 0;
      const total = emphasized.length + fill.length;
      for (let i = 0; i < total; i++) {
        const emphBehind = emphasized.length > 0 && (fill.length === 0 || (ei / emphasized.length) <= (fi / fill.length));
        if (ei < emphasized.length && (emphBehind || fi >= fill.length)) woven.push(emphasized[ei++]);
        else if (fi < fill.length) woven.push(fill[fi++]);
        else if (ei < emphasized.length) woven.push(emphasized[ei++]);
      }

      if (!isNaN(limitParam) && limitParam > 0) {
        selected = woven.slice(0, limitParam);
      } else {
        const targetMs = minutesParam * 60 * 1000;
        const acc: ResolvedTrack[] = [];
        let elapsed = 0;
        for (const t of woven) {
          acc.push(t);
          elapsed += t.duration > 0 ? t.duration : 210000; // assume ~3.5min when duration unknown
          if (elapsed >= targetMs) break;
        }
        selected = acc;
      }
    }

    const trackIds = selected.map(t => t.id);
    const playlistId = await result.adapter.createPlaylist(mix.name, trackIds);
    console.log(`Exported mix "${mix.name}" → playlist ${playlistId} (${trackIds.length} tracks)`);

    return NextResponse.json({ ok: true, playlistId, trackCount: trackIds.length });
  } catch (e: any) {
    console.error('Export mix error:', e?.message);
    return NextResponse.json({ error: e?.message ?? 'Export failed' }, { status: 500 });
  }
}
