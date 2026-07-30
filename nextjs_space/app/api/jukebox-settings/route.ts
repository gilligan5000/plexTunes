export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const SETTINGS_ID = 'default';

export async function GET() {
  try {
    let settings = await prisma.jukeboxSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!settings) {
      settings = await prisma.jukeboxSettings.create({ data: { id: SETTINGS_ID } });
    }
    return NextResponse.json(settings);
  } catch (e: any) {
    console.error('GET jukebox-settings error:', e?.message);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    // Only allow known fields
    const allowed = [
      'idleTimeout', 'eqBands', 'eqColorScheme', 'previousTrackCount',
      'keyboardSize', 'columnLayout', 'artistRows', 'stationRows',
      'lyricsZoom', 'jukeboxTitle', 'stationQueueSize', 'eqBarHeight',
      'artistBioHeight', 'artistAlbumHeight', 'artistSimilarHeight', 'artistTrackWidth',
      'stationFillPct', 'artistFillPct', 'mixFillPct', 'mixEditorFillPct',
      'hitsMinPopularity',
    ];
    const data: Record<string, any> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    const settings = await prisma.jukeboxSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });
    return NextResponse.json(settings);
  } catch (e: any) {
    console.error('PUT jukebox-settings error:', e?.message);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
