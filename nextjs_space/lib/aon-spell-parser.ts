// Parser for Archives of Nethys (aonprd.com, PF1e) spell pages and the spell
// index. Pure string functions (no DOM dependency) so it runs in scripts/tests.

export const AON_BASE = 'https://aonprd.com/';
export const AON_SPELL_INDEX_URL = `${AON_BASE}Spells.aspx?Class=All`;

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', times: '×', frac12: '½', deg: '°' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** HTML fragment -> plain text (<br> and block ends become newlines). */
export function htmlToText(html: string): string {
  const t = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(t)
    .split('\n').map((l) => l.replace(/[ \t\r\f\v\u00a0]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}
const oneLine = (html: string) => htmlToText(html).replace(/\s+/g, ' ').trim();

export type AonIndexItem = { name: string; url: string; summary: string };

/** All spell links from the AoN spell index (deduped by URL, in page order). */
export function parseSpellIndex(html: string): AonIndexItem[] {
  const out: AonIndexItem[] = [];
  const seen = new Set<string>();
  const re = /<span id="MainContent_DataListTypes_LabelName_\d+">([\s\S]*?)<\/span>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const block = m[1];
    const href = /href="(SpellDisplay\.aspx\?ItemName=[^"]+)"/.exec(block)?.[1];
    if (!href) continue;
    const url = spellUrl(decodeEntities(href));
    if (seen.has(url)) continue;
    seen.add(url);
    const name = oneLine((/<a [^>]*>([\s\S]*?)<\/a>/.exec(block)?.[1] ?? '').replace(/<sup>[\s\S]*?<\/sup>/gi, ''));
    const summary = oneLine(block.replace(/^[\s\S]*?<\/a>(<\/b>)?/, '')).replace(/^:\s*/, '');
    out.push({ name, url, summary });
  }
  return out;
}

/** Canonical absolute spell URL with a properly encoded ItemName. */
export function spellUrl(href: string): string {
  const u = new URL(href, AON_BASE);
  const item = u.searchParams.get('ItemName') ?? '';
  return `${AON_BASE}SpellDisplay.aspx?ItemName=${encodeURIComponent(item).replace(/'/g, '%27')}`;
}

export type ParsedAonSpell = {
  name: string;
  source: string;
  data: {
    school: string; subschool: string; descriptors: string[]; castingTime: string; components: string; range: string;
    areaTargetEffect: string; duration: string; savingThrow: string; spellResistance: string; description: string;
  };
  spellLevels: Array<{ cls: string; level: number }>;
};

/** "arcanist 3, sorcerer/wizard 3, summoner (unchained) 0" -> [{cls, level}] (lowercase, min level per class). */
export function parseLevels(text: string): Array<{ cls: string; level: number }> {
  const best = new Map<string, number>();
  for (const part of text.split(/[,;]/)) {
    const m = /^\s*(.+?)\s+(\d)\s*$/.exec(part);
    if (!m) continue;
    const level = Number(m[2]);
    for (const raw of m[1].split('/')) {
      const cls = raw.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!cls || cls.length > 40 || !/^[a-z0-9][a-z0-9 /'()-]*$/.test(cls)) continue;
      if (!best.has(cls) || level < best.get(cls)!) best.set(cls, level);
    }
  }
  return [...best].map(([cls, level]) => ({ cls, level }));
}

/** "evocation [fire, ruse]" / "conjuration (healing)" -> school, subschool, descriptors. */
export function parseSchool(text: string): { school: string; subschool: string; descriptors: string[] } {
  const descriptors = [...text.matchAll(/\[([^\]]*)\]/g)].flatMap((m) => m[1].split(/,|\bor\b/)).map((d) => d.trim().toLowerCase()).filter(Boolean);
  const subs = [...text.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim()).filter(Boolean);
  const school = text.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  return { school, subschool: subs.join(', ').toLowerCase(), descriptors: [...new Set(descriptors)].slice(0, 20) };
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/**
 * Parse one spell on a SpellDisplay page: the block titled `wantedName`, or
 * the first one. Related spells and mythic versions after it are ignored.
 * Throws on unexpected layout.
 */
export function parseSpellPage(html: string, wantedName?: string): ParsedAonSpell {
  // Some pages hold a family of spells (e.g. Absorb Rune I/II/III all render on
  // each page). With wantedName, pick the block whose title matches it.
  const titles: Array<{ start: number; end: number; name: string }> = [];
  for (const m of html.matchAll(/<h1 class="title">/g)) {
    const end = html.indexOf('</h1>', m.index!);
    if (end < 0) break;
    titles.push({ start: m.index!, end, name: oneLine(html.slice(m.index!, end)) });
  }
  if (!titles.length) throw new Error('No spell title found');
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
  const pick = wantedName ? titles.find((t) => norm(t.name) === norm(wantedName)) : titles[0];
  if (!pick) throw new Error(`Spell "${wantedName}" not found on page (titles: ${titles.map((t) => t.name).join(', ').slice(0, 300)})`);
  const titleEnd = pick.end;
  const name = pick.name;
  if (!name) throw new Error('Empty spell name');
  // The first spell ends at the next spell title / mythic block / end of span.
  const rest = html.slice(titleEnd + 5);
  const endIdx = [rest.search(/<h1 class="title">/), rest.search(/<h2 class="title">/), rest.indexOf('</span>')].filter((i) => i >= 0);
  const body = rest.slice(0, endIdx.length ? Math.min(...endIdx) : rest.length);

  const descAt = body.search(/<h3 class="framing">\s*Description\s*<\/h3>/i);
  const statsHtml = descAt >= 0 ? body.slice(0, descAt) : body;
  const descHtml = descAt >= 0 ? body.slice(descAt).replace(/^<h3[^>]*>[\s\S]*?<\/h3>/i, '') : '';

  // Label/value pairs: each <b>Label</b> runs until the next <b> or section header.
  const fields = new Map<string, string>();
  const order: string[] = [];
  const re = /<b>([\s\S]*?)<\/b>([\s\S]*?)(?=<b>|<h3|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(statsHtml))) {
    const label = oneLine(m[1]);
    const value = oneLine(m[2]).replace(/^[:\s]+/, '').replace(/[;\s]+$/, '');
    if (!label || fields.has(label.toLowerCase())) continue;
    fields.set(label.toLowerCase(), value);
    order.push(label);
  }
  const f = (k: string) => fields.get(k.toLowerCase()) ?? '';
  if (!fields.has('school')) throw new Error('No School line');
  const { school, subschool, descriptors } = parseSchool(f('School'));
  if (!school) throw new Error('Empty school');

  const ateLabels = order.filter((l) => /^(area|target|targets|effect)\b/i.test(l) || /^target,|^target or|^area or|^effect or/i.test(l));
  const areaTargetEffect = ateLabels.map((l) => `${l}: ${f(l)}`).join('; ');

  const description = htmlToText(descHtml);
  if (!description) throw new Error('Empty description');

  return {
    name: clip(name, 120),
    source: clip(f('Source'), 200),
    data: {
      school: clip(school, 40),
      subschool: clip(subschool, 60),
      descriptors: descriptors.map((d) => clip(d, 40)),
      castingTime: clip(f('Casting Time'), 100),
      components: clip(f('Components'), 300),
      range: clip(f('Range'), 150),
      areaTargetEffect: clip(areaTargetEffect, 400),
      duration: clip(f('Duration'), 150),
      savingThrow: clip(f('Saving Throw'), 200),
      spellResistance: clip(f('Spell Resistance'), 100),
      description: clip(description, 20_000),
    },
    spellLevels: parseLevels(f('Level')).slice(0, 40),
  };
}
