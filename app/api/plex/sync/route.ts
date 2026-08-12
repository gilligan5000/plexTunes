export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActiveAdapter } from '@/lib/media/factory';
import { mapGenreToStation, getDecadeFromYear, STATION_TEMPLATES } from '@/lib/stations';

/**
 * Backend-agnostic library sync.
 *   - Asks the active adapter (Plex / Jellyfin / Subsonic) for the full library.
 *   - Upserts CachedArtist / CachedAlbum / CachedTrack rows.
 *   - Generates the usual template stations.
 *   - Kicks off background popularity scoring.
 */

export async function POST(req: NextRequest) {
  try {
    const ctx = await getActiveAdapter();
    if (!ctx) {
      return NextResponse.json({ error: 'Media server not configured' }, { status: 400 });
    }

    const body = await req?.json?.().catch(() => ({}));
    // Accept either an explicit sectionId or fall back to the libraryId persisted
    // during initial setup. If even that is missing, auto-detect the first music
    // library section so the "Resync Library" button always works.
    let sectionId: string = body?.sectionId ?? '';
    if (!sectionId) {
      sectionId = ctx.config.libraryId ?? '';
    }
    if (!sectionId) {
      // Auto-detect: ask adapter for available library sections, pick the first one
      try {
        const sections = await ctx.adapter.getLibrarySections();
        if (sections?.length > 0) {
          sectionId = sections[0].id ?? '';
          console.log(`[sync] Auto-detected library section: ${sectionId} (${sections[0].title})`);
        }
      } catch (e: any) {
        console.error('[sync] Failed to auto-detect library section:', e?.message);
      }
    }
    if (!sectionId) {
      return NextResponse.json(
        { error: 'No music library found. Open the setup wizard to configure your server.' },
        { status: 400 },
      );
    }

    // Persist the selected library so subsequent calls know which scope we're in.
    await prisma.plexConfig.update({
      where: { id: 'default' },
      data: { libraryId: sectionId },
    }).catch(() => {});

    // Mark sync in progress
    await prisma.librarySyncStatus.upsert({
      where: { id: 'default' },
      update: { syncInProgress: true, syncProgress: 0, syncMessage: 'Starting sync...' },
      create: { id: 'default', syncInProgress: true, syncProgress: 0, syncMessage: 'Starting sync...' },
    });

    // Fetch full library via adapter
    const bundle = await ctx.adapter.getFullLibrary(sectionId, async (pct, message) => {
      await prisma.librarySyncStatus.update({
        where: { id: 'default' },
        data: { syncProgress: pct, syncMessage: message },
      }).catch(() => {});
    });

    const { artists, albums, tracks } = bundle;

    // Save artists
    const artistIdSet = new Set<string>();
    for (const a of artists) {
      artistIdSet.add(a.id);
      // ratingKey must be unique; derive from our normalized id (strip 'artist-' prefix for consistency with legacy behavior)
      const rk = a.id.replace(/^artist-/, '');
      await prisma.cachedArtist.upsert({
        where: { ratingKey: rk },
        update: {
          name: a.name,
          thumb: a.thumb,
          addedAt: a.addedAt,
        },
        create: {
          id: a.id,
          ratingKey: rk,
          name: a.name,
          thumb: a.thumb,
          addedAt: a.addedAt,
        },
      });
    }

    await prisma.librarySyncStatus.update({
      where: { id: 'default' },
      data: { syncProgress: 70, syncMessage: 'Saving albums...' },
    });

    // Save albums (skip if artist is missing)
    const albumIdSet = new Set<string>();
    for (const al of albums) {
      if (!al.artistId || !artistIdSet.has(al.artistId)) continue;
      albumIdSet.add(al.id);
      const rk = al.id.replace(/^album-/, '');
      await prisma.cachedAlbum.upsert({
        where: { ratingKey: rk },
        update: {
          title: al.title,
          year: al.year,
          thumb: al.thumb,
          genre: al.genre,
        },
        create: {
          id: al.id,
          ratingKey: rk,
          title: al.title,
          year: al.year,
          thumb: al.thumb,
          artistId: al.artistId,
          genre: al.genre,
        },
      });
    }

    await prisma.librarySyncStatus.update({
      where: { id: 'default' },
      data: { syncProgress: 80, syncMessage: 'Saving tracks...' },
    });

    // Save tracks (skip if album or artist is missing)
    let savedTracks = 0;
    for (const t of tracks) {
      if (!t.albumId || !albumIdSet.has(t.albumId)) continue;
      if (!t.artistId || !artistIdSet.has(t.artistId)) continue;
      const rk = t.id.replace(/^track-/, '');
      await prisma.cachedTrack.upsert({
        where: { ratingKey: rk },
        update: {
          title: t.title,
          duration: t.duration,
          trackNumber: t.trackNumber,
          year: t.year,
          genre: t.genre,
          artistName: t.artistName,
          albumTitle: t.albumTitle,
          thumb: t.thumb,
          mediaKey: t.mediaKey,
          ...(typeof (t as any).ratingCount === 'number' ? { plexRatingCount: (t as any).ratingCount } : {}),
        },
        create: {
          id: t.id,
          ratingKey: rk,
          title: t.title,
          duration: t.duration,
          trackNumber: t.trackNumber,
          year: t.year,
          genre: t.genre,
          artistId: t.artistId,
          artistName: t.artistName,
          albumId: t.albumId,
          albumTitle: t.albumTitle,
          thumb: t.thumb,
          mediaKey: t.mediaKey,
          plexRatingCount: typeof (t as any).ratingCount === 'number' ? (t as any).ratingCount : null,
        },
      });
      savedTracks += 1;
    }

    await prisma.librarySyncStatus.update({
      where: { id: 'default' },
      data: { syncProgress: 90, syncMessage: 'Generating stations...' },
    });

    // Generate stations based on what's in the library (with album genre fallback)
    const allCachedTracks = await prisma.cachedTrack.findMany({
      select: { year: true, genre: true, popularity: true, album: { select: { genre: true } } },
    });

    for (const template of STATION_TEMPLATES) {
      const matchingTracks = allCachedTracks?.filter?.((tt: any) => {
        const trackDecade = getDecadeFromYear(tt?.year);
        if (trackDecade !== template.decade) return false;
        const trackGenres = mapGenreToStation(tt?.genre, tt?.album?.genre);
        return trackGenres?.includes?.(template.genre) ?? false;
      }) ?? [];

      if (matchingTracks.length >= 5) {
        await prisma.station.upsert({
          where: { decade_genre: { decade: template.decade, genre: template.genre } },
          update: {
            name: template.name,
            description: template.description,
            trackCount: matchingTracks.length,
            isActive: true,
          },
          create: {
            name: template.name,
            description: template.description,
            decade: template.decade,
            genre: template.genre,
            trackCount: matchingTracks.length,
            isActive: true,
          },
        });
      }
    }

    // Auto-create genre hits stations (cross-decade)
    const HITS_STATIONS = [
      { name: 'Country Hits', genre: 'Country', description: 'The biggest country hits across all decades' },
      { name: 'Hip-Hop Hits', genre: 'Hip-Hop', description: 'Top hip-hop and rap tracks from every era' },
      { name: 'Rock Hits', genre: 'Rock', description: 'The greatest rock anthems of all time' },
      { name: 'Pop Hits', genre: 'Pop', description: 'Chart-topping pop from every decade' },
      { name: 'R&B Hits', genre: 'R&B', description: 'The smoothest R&B jams across the years' },
      { name: 'Dance Hits', genre: 'Dance', description: 'The hottest dance and electronic tracks' },
    ];
    for (const hits of HITS_STATIONS) {
      const genreTracks = allCachedTracks.filter((tt: any) => {
        const mapped = mapGenreToStation(tt?.genre, tt?.album?.genre);
        return mapped.includes(hits.genre);
      });
      if (genreTracks.length >= 10) {
        const existing = await prisma.station.findFirst({
          where: { stationType: 'hits', genre: hits.genre, decade: null },
        });
        if (!existing) {
          await prisma.station.create({
            data: {
              name: hits.name,
              description: hits.description,
              genre: hits.genre,
              decade: null,
              stationType: 'hits',
              minPopularity: 40,
              trackCount: genreTracks.length,
              isActive: true,
            },
          });
        } else {
          await prisma.station.update({
            where: { id: existing.id },
            data: { trackCount: genreTracks.length },
          });
        }
      }
    }

    // Auto-create "All the Hits" station (cross-genre, cross-decade)
    const allHitsExisting = await prisma.station.findFirst({
      where: { stationType: 'hits', genre: null, decade: null },
    });
    if (!allHitsExisting) {
      await prisma.station.create({
        data: {
          name: 'All the Hits',
          description: 'The most popular tracks from your entire library',
          genre: null,
          decade: null,
          stationType: 'hits',
          minPopularity: 50,
          isActive: true,
        },
      });
    }

    // Auto-create "Most Played" station
    const mostPlayedExisting = await prisma.station.findFirst({
      where: { stationType: 'most-played' },
    });
    if (!mostPlayedExisting) {
      await prisma.station.create({
        data: {
          name: 'Most Played',
          description: 'Your personal favorites based on play history',
          stationType: 'most-played',
          isActive: true,
        },
      });
    }

    await prisma.librarySyncStatus.update({
      where: { id: 'default' },
      data: {
        syncInProgress: false,
        syncProgress: 100,
        syncMessage: 'Sync complete!',
        lastSyncAt: new Date(),
        totalArtists: artists.length,
        totalAlbums: albums.length,
        totalTracks: savedTracks,
      },
    });

    // Auto-trigger popularity check in the background
    try {
      const uncheckedCount = await prisma.cachedTrack.count({ where: { spotifyChecked: false } });
      if (uncheckedCount > 0) {
        (async () => {
          try {
            const { getBatchPopularity } = await import('@/lib/spotify');
            let processed = 0;
            let done = false;
            while (!done && processed < 5000) {
              const unchecked = await prisma.cachedTrack.findMany({
                where: { spotifyChecked: false },
                take: 50,
                select: { id: true, title: true, artistName: true },
              });
              if (unchecked.length === 0) { done = true; break; }
              const trackInputs = unchecked.map((t: any) => ({
                artistName: t?.artistName ?? '',
                title: t?.title ?? '',
              }));
              const popularityMap = await getBatchPopularity(trackInputs);
              for (const t of unchecked) {
                const key = `${t?.artistName ?? ''}::${t?.title ?? ''}`;
                const pop = popularityMap?.get?.(key) ?? null;
                await prisma.cachedTrack.update({
                  where: { id: t.id },
                  data: { popularity: pop, spotifyChecked: true },
                });
              }
              processed += unchecked.length;
            }
            console.log(`Auto-popularity: checked ${processed} tracks after sync`);
          } catch (popErr: any) {
            console.error('Auto-popularity error:', popErr?.message);
          }
        })();
      }
    } catch { /* ignore popularity trigger errors */ }

    return NextResponse.json({
      success: true,
      artists: artists.length,
      albums: albums.length,
      tracks: savedTracks,
    });
  } catch (e: any) {
    console.error('Sync error:', e?.message);
    await prisma.librarySyncStatus.update({
      where: { id: 'default' },
      data: { syncInProgress: false, syncMessage: `Error: ${e?.message ?? 'Unknown'}` },
    }).catch(() => {});
    return NextResponse.json({ error: e?.message ?? 'Sync failed' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const status = await prisma.librarySyncStatus.findUnique({ where: { id: 'default' } });
    return NextResponse.json(status ?? { syncInProgress: false, syncProgress: 0 });
  } catch {
    return NextResponse.json({ syncInProgress: false, syncProgress: 0 });
  }
}
