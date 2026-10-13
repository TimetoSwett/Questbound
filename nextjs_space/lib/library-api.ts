import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { MAX_BODY_BYTES, type LibraryActor } from '@/lib/library';

/** Logged-in actor with isAdmin from the DB (not in the JWT), or a 401 response. */
export async function requireActor(): Promise<{ actor: NonNullable<LibraryActor> } | { res: NextResponse }> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, isAdmin: true } });
  if (!user) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { actor: { id: user.id, isAdmin: user.isAdmin } };
}

/** Parse a JSON body capped at MAX_BODY_BYTES. */
export async function readBoundedJson(request: Request): Promise<{ body: unknown } | { res: NextResponse }> {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY_BYTES) return { res: NextResponse.json({ error: 'Request too large' }, { status: 413 }) };
  // Count bytes while streaming so a chunked body (no content-length) can't
  // be buffered unbounded, and multi-byte UTF-8 can't exceed the cap.
  let raw = '';
  if (request.body) {
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BODY_BYTES) {
          await reader.cancel().catch(() => {});
          return { res: NextResponse.json({ error: 'Request too large' }, { status: 413 }) };
        }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } catch { raw = ''; }
  }
  try { return { body: JSON.parse(raw) }; } catch { return { res: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }; }
}

export const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002';
export const entryInclude = { spellLevels: { select: { cls: true, level: true } } } as const;
