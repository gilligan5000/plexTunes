export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { mapGenreToStation, getDecadeFromYear } from '@/lib/stations';

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

/**
 * Builds an OR list of per-artist track filters. If a mix has albums selected
 * for a given artist, that artist's tracks are restricted to those albums;
 * artists with no album selection contribute all their tracks.
 */
async function buildArtistConditions(artistIds: string[], albumIds: string[]): Promise<any[]> {
  if (!albumIds || albumIds.length === 0) {
    return artistIds.map(id => ({ artistId: id }));
  }
  const selAlbums = await prisma.cachedAlbum.findMany({
    where: { id: { in: albumIds } },
    select: { id: true, artistId: true },
  });
  const albumsByArtist: Record<string, string[]> = {};
  for (const a of selAlbums) {
    (albumsByArtist[a.artistId] ??= []).push(a.id);
  }
  return artistIds.map(id =>
    albumsByArtist[id]?.length
      ? { artistId: id, albumId: { in: albumsByArtist[id] } }
      : { artistId: id }
  );
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

    // Get tracks from emphasized artists (optionally restricted to specific albums)
    if (mix.artistIds?.length > 0) {
      const orConditions = await buildArtistConditions(mix.artistIds, mix.albumIds ?? []);
      const artistWhere: any = { OR: orConditions, banned: false };
      if (mix.popularOnly) {
        artistWhere.popularity = { gte: 1 };
      }
      const artistTracks = await prisma.cachedTrack.findMany({
        where: artistWhere,
        include: {
          artist: { select: { name: true, thumb: true } },
          album: { select: { title: true, thumb: true, year: true } },
        },
        take: 200,
      });
      // Double-add for emphasis weighting (dedup will keep unique, but shuffle position is better)
      allTracks.push(...artistTracks);
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

    // Shuffle and select
    const selected = shuffle(unique).slice(0, limit);

    return NextResponse.json({ mix, tracks: selected });
  } catch (e: any) {
    console.error('Mix tracks error:', e?.message);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
