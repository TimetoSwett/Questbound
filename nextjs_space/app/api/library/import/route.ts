export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { parseAonCatalogPage } from '@/lib/aon-catalog-parser';
import { parseCreateInput } from '@/lib/library';
import { readBoundedJson, requireActor } from '@/lib/library-api';
import { importRateLimited } from '@/lib/statblock-rate-limit';
import { fetchStatblockHtml } from '@/lib/statblock-fetch';

// POST /api/library/import { url } — one Archives of Nethys page, returned as a draft. Nothing is saved.
export async function POST(request: Request) {
  const a = await requireActor();
  if ('res' in a) return a.res;
  if (importRateLimited(a.actor.id)) return NextResponse.json({ error: 'Too many imports. Try again in a minute.' }, { status: 429 });
  const b = await readBoundedJson(request);
  if ('res' in b) return b.res;
  const url = (b.body as { url?: unknown })?.url;
  if (typeof url !== 'string' || !url.trim() || url.length > 2048) return NextResponse.json({ error: 'Provide one HTTPS Archives of Nethys link.' }, { status: 400 });
  try {
    const source = await fetchStatblockHtml(url.trim());
    const parsed = parseCreateInput(parseAonCatalogPage(source.html, url.trim()));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error, issues: parsed.issues }, { status: 400 });
    const v = parsed.value;
    return NextResponse.json({ draft: { kind: v.kind, system: v.system, name: v.name, summary: v.summary, sourceUrl: v.sourceUrl, data: v.data } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import failed.' }, { status: 400 });
  }
}
