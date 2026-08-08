export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { mapGenreToStation, getDecadeFromYear } from '@/lib/stations';
import { selectTracksWithBias } from '@/lib/mix-order';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function getStationTracks(station: any, perStationLimit: number): Promise<any[]> {
  const include = {
    artist: { select: { name: true, thumb: true } },
    album: { select: { title: true, thumb: true, year: true, genre: true } },
  };

  if (station.stationType === 'most-played') {
    const topPlayed = await prisma.cachedTrack.findMany({
      where: { playCount: { gt: 0 }, banned: false },
      orderBy: [{ playCount: 'desc' }, { lastPlayedAt: 'desc' }],
      take: 100,
      include,
    });
    const weighted = topPlayed.map((t: any) => ({
      ...t,
      weight: (t.playCount ?? 1) + Math.random() * 5,
    }));
    weighted.sort((a: any, b: any) => b.weight - a.weight);
    return weighted.slice(0, perStationLimit);
  }

  if (station.stationType === 'hits') {
    const minPop = station.minPopularity || 40;
    const where: any = { popularity: { gte: minPop }, banned: false };
    if (station.decade) {
      const decadeNum = parseInt(station.decade, 10);
      if (!isNaN(decadeNum)) {
        where.year = { gte: decadeNum, lt: decadeNum + 10 };
      }
    }
    const tracks = await prisma.cachedTrack.findMany({
      where,
      orderBy: { popularity: 'desc' },
      take: 500,
      include,
    });
    let filtered = tracks;
    if (station.genre) {
      filtered = tracks.filter((t: any) => {
        const stationGenres = mapGenreToStation(t?.genre, t?.album?.genre);
        return stationGenres.includes(station.genre ?? '');
      });
    }
    const sorted = filtered.sort((a: any, b: any) => {
      const popA = a?.popularity ?? 0;
      const popB = b?.popularity ?? 0;
      if (Math.abs(popA - popB) <= 5) return Math.random() - 0.5;
      return popB - popA;
    });
    return shuffle(sorted.slice(0, 50)).slice(0, perStationLimit);
  }

  // Standard station: match by decade AND genre
  const allTracks = await prisma.cachedTrack.findMany({
    where: { year: { not: null }, banned: false },
    include,
  });
  const matching = allTracks.filter((t: any) => {
    const trackDecade = getDecadeFromYear(t?.year);
    if (trackDecade !== station?.decade) return false;
    const trackGenres = mapGenreToStation(t?.genre, t?.album?.genre);
    return trackGenres?.includes?.(station?.genre ?? '') ?? false;
  });
  const sorted = matching.sort((a: any, b: any) => {
    const popA = a?.popularity ?? 0;
    const popB = b?.popularity ?? 0;
    if (Math.abs(popA - popB) <= 5) return Math.random() - 0.5;
    return popB - popA;
  });
  return shuffle(sorted.slice(0, 50)).slice(0, perStationLimit);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const mix = await prisma.mix.findUnique({ where: { id: params.id } });
    if (!mix) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') ?? '25', 10)));

    let allTracks: any[] = [];

    // Get tracks from each station using the same logic as station tracks route
    if (mix.stationIds?.length > 0) {
      const stations = await prisma.station.findMany({
        where: { id: { in: mix.stationIds }, isActive: true },
      });
      const perStation = Math.max(limit, 30);
      for (const station of stations) {
        const tracks = await getStationTracks(station, perStation);
        allTracks.push(...tracks);
      }
    }

    // "Popular tracks only" uses the same min-popularity threshold set on the
    // Settings page (Hits Station Min Popularity) so the mix builder toggle
    // reflects the desired popularity rating rather than a fixed cutoff.
    let hitsMinPop = 40;
    try {
      const s = await prisma.jukeboxSettings.findUnique({ where: { id: 'default' }, select: { hitsMinPopularity: true } });
      if (typeof s?.hitsMinPopularity === 'number') hitsMinPop = s.hitsMinPopularity;
    } catch { /* ignore */ }

    // Get tracks from emphasized artists (optionally restricted to specific albums).
    // Explicitly-selected albums bypass the "popular only" filter — hand-picking
    // an album is a direct request for those songs regardless of popularity.
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
      const artInclude = {
        artist: { select: { name: true, thumb: true } },
        album: { select: { title: true, thumb: true, year: true } },
      };
      const artistTracks: any[] = [];
      if (albumConds.length > 0) {
        const t = await prisma.cachedTrack.findMany({ where: { OR: albumConds, banned: false }, include: artInclude, orderBy: { popularity: 'desc' }, take: 400 });
        artistTracks.push(...t);
      }
      if (plainArtistIds.length > 0) {
        const where: any = { artistId: { in: plainArtistIds }, banned: false };
        if (mix.popularOnly) where.popularity = { gte: hitsMinPop };
        const t = await prisma.cachedTrack.findMany({ where, include: artInclude, orderBy: { popularity: 'desc' }, take: 400 });
        artistTracks.push(...t);
      }
      allTracks.push(...artistTracks);
    }

    // If no stations and no artists returned anything, return empty
    if (allTracks.length === 0) {
      return NextResponse.json({ mix, tracks: [] });
    }

    // Deduplicate
    const seen = new Set<string>();
    const unique = allTracks.filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    // Rank by popularity while spreading artists out, then select. This keeps
    // the most popular tracks up front, avoids clustering the same artist, and
    // removes the positional (alphabetical) bias the old plain shuffle inherited
    // from the database fetch order.
    const selected = selectTracksWithBias(unique, (mix as any).popularityBias ?? 0, limit);

    return NextResponse.json({ mix, tracks: selected });
  } catch (e: any) {
    console.error('Mix tracks error:', e?.message);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
