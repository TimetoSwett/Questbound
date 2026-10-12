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
export async function fetchStatblockHtml(raw: string, fetcher: typeof fetch = fetch, timeoutMs = 10_000): Promise<{ html: string; host: string }> {
  const url = validateImportUrl(raw);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { redirect: 'manual', signal: controller.signal, headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Questbound/1.0; PF1e stat block importer)',
      Accept: 'text/html,application/xhtml+xml;q=0.9',
    } });
    if (response.status >= 300 && response.status < 400) throw new Error('Redirect refused. Use the final HTTPS page URL or paste the stat block text.');
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}. Try pasting the stat block text.`);
    if (Number(response.headers.get('content-length')) > MAX_IMPORT_BYTES) throw new Error('Source exceeds the 2 MB size limit.');
    if (!response.body) throw new Error('Source returned an empty response.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0, html = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_IMPORT_BYTES) throw new Error('Source exceeds the 2 MB size limit.');
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
