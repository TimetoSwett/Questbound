/**
 * Parse Obsidian-style markdown to HTML.
 * Handles [[wikilinks]] by converting to clickable links.
 */
export function parseObsidianMarkdown(text: string, existingPageTitles: string[]): string {
  if (!text) return '';
  
  // Simple markdown to HTML conversion
  let html = text;
  
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  
  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  
  // Wiki links [[PageTitle]] or [[PageTitle|Display Text]]
  html = html.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (match: string, target: string, display: string) => {
    const title = target?.trim() ?? '';
    const label = display?.trim() ?? title;
    const exists = (existingPageTitles ?? []).some((t: string) => t?.toLowerCase() === title?.toLowerCase());
    if (exists) {
      return `<span class="wiki-link" data-wiki-target="${title}">${label}</span>`;
    }
    return `<span class="wiki-link" style="opacity:0.5;text-decoration:line-through dotted" title="Page not found">${label}</span>`;
  });
  
  // Paragraphs (lines not already wrapped in HTML)
  html = html.split('\n').map((line: string) => {
    const trimmed = line?.trim() ?? '';
    if (!trimmed) return '';
    if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<ol') || trimmed.startsWith('<li') || trimmed.startsWith('<blockquote')) return trimmed;
    return `<p>${trimmed}</p>`;
  }).join('\n');
  
  // Bullet lists (basic)
  html = html.replace(/(<p>- (.+?)<\/p>\n?)+/g, (match: string) => {
    const items = (match?.match?.(/- (.+?)(?:<\/p>)/g) ?? []).map((i: string) => `<li>${i?.replace?.(/^- /, '')?.replace?.(/<\/p>$/, '') ?? ''}</li>`);
    return `<ul>${items.join('')}</ul>`;
  });
  
  return html;
}
