/** IDs stored alongside sheet rows, independent of their position. */
export function newEntryId(): string {
  return `e-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}

export function ensureEntryIds<T>(list: unknown): (T & { id: string })[] {
  if (!Array.isArray(list)) return [];
  const used = new Set<string>();
  let changed = false;
  const result = list.map((entry) => {
    if (entry === null || typeof entry !== 'object' ||
      (Object.getPrototypeOf(entry) !== null &&
        Object.getPrototypeOf(Object.getPrototypeOf(entry)) !== null)) return entry;
    let id = entry.id;
    if (typeof id === 'string' && id.trim().length > 0 && id.length <= 100 && !used.has(id)) {
      used.add(id);
      return entry;
    }
    do { id = newEntryId(); } while (used.has(id));
    used.add(id);
    changed = true;
    return { ...entry, id };
  });
  return (changed ? result : list) as (T & { id: string })[];
}
