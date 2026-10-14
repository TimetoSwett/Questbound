export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseCreateInput, presentEntry, searchLibraryPage, searchQuerySchema, canCreateEntry } from '@/lib/library';
import { entryInclude, isUniqueViolation, readBoundedJson, requireActor } from '@/lib/library-api';

// GET /api/library?kind=spell&system=pf1e&q=&cls=&level=&school=&subschool=&descriptor=&duration=&range=&limit=20&page=1
// limit is the page size (max 50). Any logged-in user. Prefix matches first, then other matches; alphabetical.
export async function GET(request: Request) {
  const a = await requireActor();
  if ('res' in a) return a.res;
  const parsed = searchQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query', issues: parsed.error.issues }, { status: 400 });
  const { results, total } = await searchLibraryPage(prisma, parsed.data);
  return NextResponse.json({ results: results.map((r) => presentEntry(r, a.actor, { includeData: false })), total, page: parsed.data.page, limit: parsed.data.limit });
}

// POST /api/library — any logged-in user creates a source="user" spell; rules are admin-only.
export async function POST(request: Request) {
  const a = await requireActor();
  if ('res' in a) return a.res;
  const b = await readBoundedJson(request);
  if ('res' in b) return b.res;
  const p = parseCreateInput(b.body);
  if (!p.ok) return NextResponse.json({ error: p.error, issues: p.issues }, { status: 400 });
  const v = p.value;
  if (!canCreateEntry(a.actor, v.kind)) return NextResponse.json({ error: 'Only admins can create rules' }, { status: 403 });
  try {
    const row = await prisma.libraryEntry.create({
      data: {
        kind: v.kind, system: v.system, name: v.name, nameKey: v.nameKey, source: 'user', sourceUrl: v.sourceUrl,
        summary: v.summary, data: v.data as object, createdById: a.actor.id,
        spellLevels: { create: v.spellLevels },
      },
      include: entryInclude,
    });
    return NextResponse.json(presentEntry(row, a.actor), { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: 'An entry with that name already exists' }, { status: 409 });
    throw e;
  }
}
