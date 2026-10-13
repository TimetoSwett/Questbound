import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { etagMatches, listTerms, termsQuerySchema } from '@/lib/library';
import { requireActor } from '@/lib/library-api';

// GET /api/library/terms?system=pf1e&kind=rule -> [{ term, entryId, kind }]
// One row per name and alias (normalized like nameKey), longest term first.
// ETag = count + max(updatedAt) for the filter; If-None-Match -> 304. Login required.
export async function GET(request: Request) {
  const a = await requireActor();
  if ('res' in a) return a.res;
  const parsed = termsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query', issues: parsed.error.issues }, { status: 400 });
  const { etag, load } = await listTerms(prisma, parsed.data);
  const headers = { ETag: etag, 'Cache-Control': 'private, no-cache' };
  if (etagMatches(request.headers.get('if-none-match'), etag)) return new Response(null, { status: 304, headers });
  return NextResponse.json(await load(), { headers });
}
