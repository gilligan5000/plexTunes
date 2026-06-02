export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getActiveAdapter } from '@/lib/media/factory';

export async function GET(req: NextRequest) {
  try {
    const result = await getActiveAdapter();
    if (!result) {
      return NextResponse.json({ error: 'No media server configured' }, { status: 400 });
    }
    const { adapter } = result;

    const playlistId = req.nextUrl.searchParams.get('id');

    if (playlistId) {
      // Return tracks for a specific playlist
      const tracks = await adapter.getPlaylistTracks(playlistId);
      return NextResponse.json({ tracks });
    }

    // Return all playlists
    const playlists = await adapter.getPlaylists();
    return NextResponse.json({ playlists });
  } catch (e: any) {
    console.error('Playlists API error:', e?.message);
    return NextResponse.json({ error: 'Failed to fetch playlists' }, { status: 500 });
  }
}
