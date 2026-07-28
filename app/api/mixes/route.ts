export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const mixes = await prisma.mix.findMany({ orderBy: { updatedAt: 'desc' } });
    return NextResponse.json({ mixes });
  } catch (e: any) {
    console.error('Mixes list error:', e?.message);
    return NextResponse.json({ mixes: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, stationIds, artistIds, albumIds, popularOnly, imageUrl } = body ?? {};
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
    const mix = await prisma.mix.create({
      data: {
        name,
        stationIds: stationIds ?? [],
        artistIds: artistIds ?? [],
        albumIds: albumIds ?? [],
        popularOnly: popularOnly ?? true,
        imageUrl: imageUrl ?? null,
      },
    });
    return NextResponse.json({ mix });
  } catch (e: any) {
    console.error('Mix create error:', e?.message);
    return NextResponse.json({ error: 'Failed to create mix' }, { status: 500 });
  }
}
