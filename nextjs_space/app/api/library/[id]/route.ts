export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canDeleteEntry, canEditEntry, parsePatchInput, patchRequestsRuleKind, presentEntry } from '@/lib/library';
import { entryInclude, isUniqueViolation, readBoundedJson, requireActor } from '@/lib/library-api';

type Context = { params: Promise<{ id: string }> };
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

export async function GET(_request: Request, context: Context) {
  const a = await requireActor();
  if ('res' in a) return a.res;
  const { id } = await context.params;
  const row = await prisma.libraryEntry.findUnique({ where: { id }, include: entryInclude });
  return row ? NextResponse.json(presentEntry(row, a.actor)) : notFound();
}

// PATCH — creator or admin; source="aon" entries and all rules are admin-only; `kind` is never patchable (non-admins asking for 'rule' get 403).
export async function PATCH(request: Request, context: Context) {
  const a = await requireActor();
  if ('res' in a) return a.res;
  const { id } = await context.params;
  const existing = await prisma.libraryEntry.findUnique({ where: { id }, select: { id: true, kind: true, createdById: true, source: true } });
  if (!existing) return notFound();
  if (!canEditEntry(a.actor, existing)) return NextResponse.json({ error: existing.kind === 'rule' ? 'Only admins can edit rules' : 'You cannot edit this entry' }, { status: 403 });
  const b = await readBoundedJson(request);
  if ('res' in b) return b.res;
  if (!a.actor.isAdmin && patchRequestsRuleKind(b.body)) return NextResponse.json({ error: 'Only admins can change an entry into a rule' }, { status: 403 });
  const p = parsePatchInput(existing.kind, b.body);
  if (!p.ok) return NextResponse.json({ error: p.error, issues: p.issues }, { status: 400 });
  const { spellLevels, data, ...fields } = p.value;
  try {
    const row = await prisma.$transaction(async (tx) => {
      if (spellLevels) await tx.spellLevel.deleteMany({ where: { entryId: id } });
      return tx.libraryEntry.update({
        where: { id },
        data: { ...fields, ...(data ? { data: data as object } : {}), ...(spellLevels ? { spellLevels: { create: spellLevels } } : {}) },
        include: entryInclude,
      });
    });
    return NextResponse.json(presentEntry(row, a.actor));
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: 'An entry with that name already exists' }, { status: 409 });
    throw e;
  }
}

export async function DELETE(_request: Request, context: Context) {
  const a = await requireActor();
  if ('res' in a) return a.res;
  const { id } = await context.params;
  const existing = await prisma.libraryEntry.findUnique({ where: { id }, select: { kind: true, createdById: true, source: true } });
  if (!existing) return notFound();
  if (!canDeleteEntry(a.actor, existing)) return NextResponse.json({ error: existing.kind === 'rule' ? 'Only admins can delete rules' : 'You cannot delete this entry' }, { status: 403 });
  await prisma.libraryEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
