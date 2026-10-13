import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Fail closed on invalid addresses as well as non-public network destinations.
export function isBlockedImportAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0 && address.split('.')[2] === '0')
      || (a === 198 && (b === 18 || b === 19));
  }
  if (family !== 6 || address.includes('%')) return true;
  // Convert dotted IPv4 tails, then expand compressed IPv6 into eight words.
  const normalized = address.toLowerCase().replace(/\d+\.\d+\.\d+\.\d+$/, tail => {
    const octets = tail.split('.').map(Number);
    return `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  });
  const halves = normalized.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const words = (halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left).map(word => parseInt(word, 16));
  if (words.slice(0, 5).every(word => word === 0) && words[5] === 0xffff) {
    return isBlockedImportAddress(`${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`);
  }
  return words.slice(0, 6).every(word => word === 0)
    || (words[0] & 0xfe00) === 0xfc00 // Unique local.
    || (words[0] & 0xffc0) === 0xfe80 // Link local.
    || (words[0] & 0xffc0) === 0xfec0 // Deprecated site local.
    || (words[0] & 0xff00) === 0xff00; // Multicast.
}

// Called only by the server import endpoint. Dependency injection permits offline safety tests.
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export function validateImportUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Invalid URL. Enter a full HTTPS URL.'); }
  if (url.protocol !== 'https:' || !['aonprd.com', 'www.aonprd.com', 'd20pfsrd.com', 'www.d20pfsrd.com'].includes(url.hostname)
    || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Blocked host: only HTTPS URLs on aonprd.com and d20pfsrd.com are allowed.');
  }
  return url;
}
export async function fetchStatblockHtml(raw: string, fetcher: typeof fetch = fetch, timeoutMs = 10_000,
  resolver = (hostname: string) => lookup(hostname, { all: true }),
  { maxBytes = MAX_IMPORT_BYTES, userAgent = 'Mozilla/5.0 (compatible; Questbound/1.0; PF1e stat block importer)' }: { maxBytes?: number; userAgent?: string } = {},
): Promise<{ html: string; host: string }> {
  const url = validateImportUrl(raw);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const addresses = await Promise.race([
      resolver(url.hostname),
      new Promise<never>((_resolve, reject) => controller.signal.addEventListener('abort', () => reject(new Error('DNS lookup timed out')), { once: true })),
    ]);
    if (!addresses.length || addresses.some(({ address }) => isBlockedImportAddress(address))) {
      throw new Error('Blocked address: source hostname must resolve only to public IP addresses.');
    }
    // Native fetch resolves again; DNS validation does not pin the connection.
    const response = await fetcher(url, { redirect: 'manual', signal: controller.signal, headers: {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml;q=0.9',
    } });
    if (response.status >= 300 && response.status < 400) throw new Error('Redirect refused. Use the final HTTPS page URL or paste the stat block text.');
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}. Try pasting the stat block text.`);
    if (Number(response.headers.get('content-length')) > maxBytes) throw new Error(`Source exceeds the ${Math.round(maxBytes / 1048576)} MB size limit.`);
    if (!response.body) throw new Error('Source returned an empty response.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0, html = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) throw new Error(`Source exceeds the ${Math.round(maxBytes / 1048576)} MB size limit.`);
        html += decoder.decode(value, { stream: true });
      }
      html += decoder.decode();
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    return { html, host: url.hostname };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Import timed out after 10 seconds. Try pasting the stat block text.');
    throw error;
  } finally { clearTimeout(timer); controller.abort(); }
}
