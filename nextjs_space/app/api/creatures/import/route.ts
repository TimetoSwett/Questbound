import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserRole } from '@/lib/campaign-helpers';
import { creatureInputSchema } from '@/lib/creatures';
import { extractStatblockText, parseStatblockText } from '@/lib/statblock-import';
import { fetchStatblockHtml } from '@/lib/statblock-fetch';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.campaignId !== 'string' || !body.campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  if (await getUserRole(session.user.id, body.campaignId) !== 'dm') return NextResponse.json({ error: 'Only the campaign GM can import creatures' }, { status: 403 });
  const hasUrl = typeof body.url === 'string' && body.url.trim();
  const hasText = typeof body.text === 'string' && body.text.trim();
  if (!!hasUrl === !!hasText || (body.url !== undefined && typeof body.url !== 'string') || (body.text !== undefined && typeof body.text !== 'string')) {
    return NextResponse.json({ error: 'Provide either a URL or pasted stat block text' }, { status: 400 });
  }
  if ((body.text?.length ?? 0) > 90_000 || (body.url?.length ?? 0) > 2048) return NextResponse.json({ error: 'Input is too large' }, { status: 400 });
  try {
    let text = body.text;
    if (hasUrl) {
      const source = await fetchStatblockHtml(body.url);
      text = extractStatblockText(source.html, source.host);
    }
    const draft = parseStatblockText(text);
    if (!creatureInputSchema.safeParse(draft).success) throw new Error('Parse failure: stat block fields are too large. Paste only the creature stat block.');
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import failed. Try pasting the stat block text.' }, { status: 400 });
  }
}
