export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActiveAdapter } from '@/lib/media/factory';

export async function POST(req: NextRequest) {
  try {
    const result = await getActiveAdapter();
    if (!result) {
      return NextResponse.json({ error: 'No media server configured' }, { status: 400 });
    }
    const { adapter } = result;

    const body = await req.json();
    const { playlistIds } = body ?? {};
    if (!Array.isArray(playlistIds) || playlistIds.length === 0) {
      return NextResponse.json({ error: 'playlistIds required' }, { status: 400 });
    }

    // Fetch all playlists to get names
    const allPlaylists = await adapter.getPlaylists();
    const playlistMap = new Map(allPlaylists.map(p => [p.id, p]));

    const createdMixes: any[] = [];

    for (const plId of playlistIds) {
      const playlist = playlistMap.get(plId);
      if (!playlist) continue;

      // Fetch tracks from the media server playlist
      const tracks = await adapter.getPlaylistTracks(plId);
      if (tracks.length === 0) continue;

      // Match track IDs against CachedTrack table to find tracks we know about
      const trackIds = tracks.map(t => t.id);
      const cachedTracks = await prisma.cachedTrack.findMany({
        where: { id: { in: trackIds } },
        select: { id: true, artistId: true },
      });

      // Extract unique artist IDs from matched tracks
      const artistIds = [...new Set(cachedTracks.map(t => t.artistId))];

      if (artistIds.length === 0) {
        // No matching tracks in cache — skip
        continue;
      }

      // Create a Mix with those artist IDs
      const mix = await prisma.mix.create({
        data: {
          name: playlist.title,
          stationIds: [],
          artistIds,
          popularOnly: false,
          imageUrl: null,
        },
      });
      createdMixes.push(mix);
    }

    return NextResponse.json({
      imported: createdMixes.length,
      mixes: createdMixes,
    });
  } catch (e: any) {
    console.error('Playlist import error:', e?.message);
    return NextResponse.json({ error: 'Failed to import playlists' }, { status: 500 });
  }
}
