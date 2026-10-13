import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { lookupInputSchema, lookupTerms } from '@/lib/library';
import { readBoundedJson, requireActor } from '@/lib/library-api';

// POST /api/library/lookup { terms: string[] (<=50, each <=80 chars), kind?, system? }
// -> [{ term, match: { id, name, kind, summary, sourceUrl } | null }] in input order.
// Matches nameKey or an alias (normalized). Two DB queries regardless of N. Login required.
export async function POST(request: Request) {
  const a = await requireActor();
  if ('res' in a) return a.res;
  const b = await readBoundedJson(request);
  if ('res' in b) return b.res;
  const p = lookupInputSchema.safeParse(b.body);
  if (!p.success) return NextResponse.json({ error: 'Invalid lookup', issues: p.error.issues }, { status: 400 });
  return NextResponse.json(await lookupTerms(prisma, p.data));
}
