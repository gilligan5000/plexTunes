export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActiveAdapter } from '@/lib/media/factory';
import { stripIdPrefix } from '@/lib/media/types';
import { mapGenreToStation, getDecadeFromYear } from '@/lib/stations';

/** Collect ALL tracks that a mix resolves to (no shuffle, high limit). */
async function resolveMixTracks(mix: any): Promise<{ id: string; duration: number }[]> {
  const include = {
    artist: { select: { name: true, thumb: true } },
    album: { select: { title: true, thumb: true, year: true, genre: true } },
  };
  let allTracks: any[] = [];

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

  // Artist tracks (optionally restricted to specific albums)
  if (mix.artistIds?.length > 0) {
    const albumIds: string[] = mix.albumIds ?? [];
    let orConditions: any[];
    if (albumIds.length > 0) {
      const selAlbums = await prisma.cachedAlbum.findMany({
        where: { id: { in: albumIds } },
        select: { id: true, artistId: true },
      });
      const albumsByArtist: Record<string, string[]> = {};
      for (const a of selAlbums) (albumsByArtist[a.artistId] ??= []).push(a.id);
      orConditions = mix.artistIds.map((id: string) =>
        albumsByArtist[id]?.length
          ? { artistId: id, albumId: { in: albumsByArtist[id] } }
          : { artistId: id }
      );
    } else {
      orConditions = mix.artistIds.map((id: string) => ({ artistId: id }));
    }
    const artistWhere: any = { OR: orConditions, banned: false };
    if (mix.popularOnly) artistWhere.popularity = { gte: 1 };
    const artistTracks = await prisma.cachedTrack.findMany({ where: artistWhere, include, take: 500 });
    allTracks.push(...artistTracks);
  }

  // Deduplicate by cachedTrack.id
  const seen = new Set<string>();
  const unique = allTracks.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  // Return raw media-server IDs (strip the track- prefix) with durations (ms)
  return unique.map((t: any) => ({ id: stripIdPrefix(t.id), duration: t?.duration ?? 0 }));
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
    // When targeting a subset, shuffle first so the playlist varies instead of
    // always taking the same front-loaded tracks.
    const pool = applyTarget ? [...resolved].sort(() => Math.random() - 0.5) : resolved;
    if (!isNaN(limitParam) && limitParam > 0) {
      selected = pool.slice(0, limitParam);
    } else if (!isNaN(minutesParam) && minutesParam > 0) {
      const targetMs = minutesParam * 60 * 1000;
      const acc: { id: string; duration: number }[] = [];
      let total = 0;
      for (const t of pool) {
        acc.push(t);
        total += t.duration > 0 ? t.duration : 210000; // assume ~3.5min when duration unknown
        if (total >= targetMs) break;
      }
      selected = acc;
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
