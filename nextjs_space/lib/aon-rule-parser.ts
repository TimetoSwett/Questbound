// Parser for Archives of Nethys (aonprd.com, PF1e) Universal Monster Rules.
// Index: UMR.aspx?ItemName=All (every rule, with text). Page: UMR.aspx?ItemName=<Name>.
// Pure string functions, plain text output.
import { AON_BASE, decodeEntities, htmlToText } from './aon-spell-parser';
import { ALIAS_MAX, ALIASES_MAX_COUNT, normalizeNameKey, summaryFromDescription } from './library';

export const AON_UMR_INDEX_URL = `${AON_BASE}UMR.aspx?ItemName=All`;

export type AonRuleIndexItem = { name: string; url: string; summary: string };
export type ParsedAonRule = { name: string; abilityType: string; data: { category: 'universal-monster-rule'; format: string; text: string; aliases: string[] } };

/** Canonical absolute rule URL with an encoded ItemName. */
export function ruleUrl(href: string): string {
  const u = new URL(decodeEntities(href), AON_BASE);
  const item = u.searchParams.get('ItemName') ?? '';
  return `${AON_BASE}UMR.aspx?ItemName=${encodeURIComponent(item).replace(/'/g, '%27')}`;
}

type Block = { itemName: string; title: string; html: string };
function blocks(html: string): Block[] {
  const parts = html.split(/<span id="MainContent_DataListUMR_LabelName_\d+">/).slice(1);
  const out: Block[] = [];
  for (const p of parts) {
    const body = p.split(/<\/span>\s*<\/td>/)[0];
    const m = /<h[12] class="title">\s*<a href="(UMR\.aspx\?ItemName=[^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h[12]>/.exec(body);
    if (!m) continue;
    const item = new URL(decodeEntities(m[1]), AON_BASE).searchParams.get('ItemName') ?? '';
    if (!item || item === 'All') continue;
    out.push({ itemName: item.trim(), title: htmlToText(m[2]).replace(/\s+/g, ' ').trim(), html: body.slice(m.index + m[0].length) });
  }
  return out;
}

// Short forms players type for a rule, found at the start of the Format line.
const FORMAT_SHORT_FORMS = ['fear aura', 'mental static', 'dr', 'sr', 'fly', 'resist', 'immune', 'vulnerable'];
// Well-known rules whose usual short names are not derivable from the Format line.
const NAME_ALIASES: Record<string, string[]> = {
  'damage reduction': ['dr'],
  'spell resistance': ['sr'],
  'low-light vision': ['low light vision'],
  'ability damage and drain': ['ability damage', 'ability drain'],
};

/** Conservative aliases: explicit per-name map plus the first Format segment's lead word when it is a known short form (e.g. "DR 5/silver" -> "dr"). */
export function aliasesFromFormat(name: string, format: string): string[] {
  const key = normalizeNameKey(name);
  const out = new Set<string>(NAME_ALIASES[key] ?? []);
  const lead = normalizeNameKey(format.split(';')[0].replace(/[([{].*$/, '').replace(/\s[+\-–]?\d.*$/, ''));
  const hit = FORMAT_SHORT_FORMS.find((w) => lead === w || lead.startsWith(`${w} `));
  if (hit && hit !== key && !hit.includes('name')) out.add(hit);
  return [...out].filter((a) => a !== key && a.length <= ALIAS_MAX).slice(0, ALIASES_MAX_COUNT);
}

function parseBlock(b: Block): ParsedAonRule {
  // Body = after "Source ..." line's first <br />; Format / Location lines split out.
  const afterSource = b.html.replace(/^[\s\S]*?<b>Source<\/b>[\s\S]*?<br\s*\/?>/, '');
  const fm = /<i>Format<\/i>\s*:?\s*([\s\S]*?)(?:<br\s*\/?>|$)/i.exec(afterSource);
  const format = fm ? htmlToText(fm[1]).replace(/\s+/g, ' ').replace(/[;.]\s*$/, '').trim() : '';
  const textHtml = afterSource.replace(/<i>(Format|Location)<\/i>\s*:?[\s\S]*?(<br\s*\/?>|$)/gi, '');
  const text = htmlToText(textHtml);
  if (!text) throw new Error(`No rule text for "${b.itemName}"`);
  const abilityType = /\(([^)]*)\)/.exec(b.title)?.[1] ?? '';
  return { name: b.itemName, abilityType, data: { category: 'universal-monster-rule', format: format.slice(0, 300), text: text.slice(0, 20_000), aliases: aliasesFromFormat(b.itemName, format) } };
}

/** All rules on the UMR "All" page, in page order (deduped by URL). Summary = first sentence. */
export function parseRuleIndex(html: string): AonRuleIndexItem[] {
  const seen = new Set<string>();
  const out: AonRuleIndexItem[] = [];
  for (const b of blocks(html)) {
    const url = ruleUrl(`UMR.aspx?ItemName=${b.itemName}`);
    if (seen.has(url)) continue;
    seen.add(url);
    let summary = '';
    try { summary = summaryFromDescription(parseBlock(b).data.text); } catch { /* page fetch will report */ }
    out.push({ name: b.itemName, url, summary });
  }
  return out;
}

/** One rule page (or the block named `name` on a multi-rule page). */
export function parseRulePage(html: string, name?: string): ParsedAonRule {
  const bs = blocks(html);
  if (!bs.length) throw new Error('No rule title found');
  const want = name ? normalizeNameKey(name) : '';
  const b = (want && bs.find((x) => normalizeNameKey(x.itemName) === want)) || bs[0];
  return parseBlock(b);
}
