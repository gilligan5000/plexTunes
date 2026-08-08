export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const mix = await prisma.mix.findUnique({ where: { id: params.id } });
    if (!mix) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ mix });
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const { name, stationIds, artistIds, albumIds, popularOnly, popularityBias, imageUrl } = body ?? {};
    const mix = await prisma.mix.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(stationIds !== undefined && { stationIds }),
        ...(artistIds !== undefined && { artistIds }),
        ...(albumIds !== undefined && { albumIds }),
        ...(popularOnly !== undefined && { popularOnly }),
        ...(popularityBias !== undefined && { popularityBias: Math.max(0, Math.min(1, Number(popularityBias) || 0)) }),
        ...(imageUrl !== undefined && { imageUrl }),
      },
    });
    return NextResponse.json({ mix });
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.mix.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
