// Pure extraction/parser: imported content is plain text, never rendered as HTML.
export type ImportDraft = {
  name: string; cr: string; alignment: string; size: string; type: string; subtype: string;
  acTotal: number; acTouch: number; acFlatFooted: number; hpMax: number; hpCurrent: number;
  hitDice: string; fort: number; ref: number; will: number; speed: number;
  str: number | null; dex: number | null; con: number | null; int: number | null; wis: number | null; cha: number | null;
  attacks: Record<string, string>[]; skills: Record<string, string>[]; feats: Record<string, string>[];
  specialAbilities: Record<string, string>[]; gmNotes: string; revealLevel: 'hidden'; unlockedSections: string[];
};

function decode(text: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', minus: '-', times: '×' };
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (raw, key: string) => {
    if (key.startsWith('#')) {
      const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : raw;
    }
    return entities[key.toLowerCase()] ?? raw;
  });
}

export function extractStatblockText(html: string, host: string): string {
  const clean = html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const selector = host.endsWith('aonprd.com')
    ? /<span\b[^>]*id=["']MainContent_DataList[^"']*Label[^"']*["'][^>]*>/i
    : /<(div|article)\b[^>]*class=["'][^"']*\bstatblock\b[^"']*["'][^>]*>/i;
  const start = selector.exec(clean) ?? /<(article|div|main)\b[^>]*(?:id=["']article-content["']|class=["'][^"']*article-content[^"']*["'])[^>]*>/i.exec(clean);
  if (!start) throw new Error('Parse failure: no stat block content found. Try pasting the stat block text.');
  const tag = /^<(\w+)/.exec(start[0])![1];
  const rest = clean.slice(start.index + start[0].length);
  const tags = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  let depth = 1, end = rest.length;
  for (const match of rest.matchAll(tags)) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (!depth) { end = match.index!; break; }
  }
  return decode(rest.slice(0, end).replace(/<\/?(?:br|p|div|h[1-6]|tr|li)\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, ''))
    .replace(/[\u2013\u2014\u2212]/g, '-').replace(/[^\S\n]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
}

// Split lists only outside parentheses (skills and attacks often contain commas).
function splitList(value: string): string[] {
  let depth = 0, start = 0;
  const result: string[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (value[i] === ',' && depth === 0) { result.push(value.slice(start, i).trim()); start = i + 1; }
  }
  result.push(value.slice(start).trim());
  return result.filter(Boolean);
}

export function parseStatblockText(source: string): ImportDraft {
  const text = source.replace(/\r/g, '').replace(/[\u2013\u2014\u2212]/g, '-').replace(/\u00a0/g, ' ').trim();
  const header = /^\s*(.+?)\s+CR\s+(\d+(?:\/\d+)?(?:\s*\/\s*MR\s*\d+)?)/im.exec(text);
  const ac = /\bAC\s+(\d+).*?touch\s+(\d+).*?flat-footed\s+(\d+)/i.exec(text);
  const hp = /\bhp\s+(\d+)\s*\(([^)]+)\)/i.exec(text);
  if (!header || !ac || !hp) throw new Error('Parse failure: expected a name with CR, AC/touch/flat-footed, and hp with hit dice.');
  const identity = /\b(LG|NG|CG|LN|N|CN|LE|NE|CE)\s+(Fine|Diminutive|Tiny|Small|Medium|Large|Huge|Gargantuan|Colossal)\s+([^\n(]+)(?:\(([^)]+)\))?/i.exec(text);
  const line = (label: string) => new RegExp(`(?:^|\\n|;)\\s*${label}\\s+([^\\n]+)`, 'i').exec(text)?.[1]?.trim() ?? '';
  const number = (label: string, fallback = 0) => Number(new RegExp(`\\b${label}\\s+([+-]?\\d+)`, 'i').exec(text)?.[1] ?? fallback);
  const score = (label: string) => {
    const raw = new RegExp(`\\b${label}\\s+(\\d+|-)`, 'i').exec(text)?.[1];
    return raw && raw !== '-' ? Number(raw) : null;
  };
  const attacks = ['Melee', 'Ranged'].flatMap(type => splitList(line(type)).map(raw => {
    const match = /^(.*?)\s+([+-]\d+(?:\/[+-]?\d+)*)\s*\((.*)\)(.*)$/.exec(raw);
    const [damage, ...critical] = (match?.[3] ?? '').split('/');
    return { name: match?.[1] ?? raw, bonus: match?.[2] ?? '', damage, critical: critical.join('/'), type: type.toLowerCase(), notes: match?.[4]?.trim() ?? raw };
  }));
  const special = /(?:^|\n)SPECIAL ABILITIES\s*\n([\s\S]*?)(?=\n(?:ECOLOGY|DESCRIPTION)\b|$)/i.exec(text)?.[1] ?? '';
  const abilities = special.split(/\n(?=[^\n]+\((?:Ex|Su|Sp)\))/).filter(Boolean).map(raw => {
    const match = /^(.+?)\s*\((Ex|Su|Sp)\)\s*([\s\S]*)$/i.exec(raw.trim());
    return { name: match?.[1] ?? 'Special Abilities', type: match?.[2] ?? '', description: match?.[3] ?? raw.trim() };
  });
  for (const label of ['Special Attacks', 'SQ']) {
    const value = line(label);
    if (value) abilities.push({ name: label, type: '', description: value });
  }
  const additional = ['XP', 'Init', 'Senses', 'Space', 'Reach', 'Base Atk', 'CMB', 'CMD', 'Languages']
    .map(label => {
      const value = line(label).split(';')[0];
      return value ? `${label}: ${value}` : '';
    }).filter(Boolean).join('\n');
  return {
    name: header[1].trim(), cr: header[2].trim(), alignment: identity?.[1]?.toUpperCase() ?? '',
    size: identity?.[2] ?? 'Medium', type: identity?.[3]?.trim() ?? '', subtype: identity?.[4] ?? '',
    acTotal: Number(ac[1]), acTouch: Number(ac[2]), acFlatFooted: Number(ac[3]),
    hpMax: Number(hp[1]), hpCurrent: Number(hp[1]), hitDice: hp[2],
    fort: number('Fort'), ref: number('Ref'), will: number('Will'), speed: number('Speed', 30),
    str: score('Str'), dex: score('Dex'), con: score('Con'), int: score('Int'), wis: score('Wis'), cha: score('Cha'),
    attacks, skills: splitList(line('Skills').split(';')[0]).map(raw => {
      const match = /^(.*?)\s+([+-]\d+)(.*)$/.exec(raw);
      return { name: match?.[1] ?? raw, bonus: match?.[2] ?? '', notes: match?.[3]?.trim() ?? '' };
    }), feats: splitList(line('Feats')).map(name => ({ name, description: '' })), specialAbilities: abilities,
    // Preserve all source details, including unsupported fields and conditional modifiers.
    gmNotes: `Additional statistics:\n${additional}\n\nImported PF1e stat block (review before saving):\n\n${text}`, revealLevel: 'hidden', unlockedSections: [],
  };
}
