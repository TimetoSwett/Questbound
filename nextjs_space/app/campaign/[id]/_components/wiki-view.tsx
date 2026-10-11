'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Eye, EyeOff, Trash2, FileText, Search, Import, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { TipTapEditor } from '@/components/tiptap-editor';
import { parseObsidianMarkdown } from '@/lib/obsidian-parser';
import { FadeIn } from '@/components/ui/animate';

interface WikiPage {
  id: string;
  title: string;
  category: string;
  body: string;
  visibility: string;
}

const CATEGORIES = ['NPC', 'Location', 'Faction', 'Lore', 'Item'];

export function WikiView({ campaignId, isDM, initialPageId }: { campaignId: string; isDM: boolean; initialPageId?: string | null }) {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialPageId ?? null);
  const [previousInitialPageId, setPreviousInitialPageId] = useState(initialPageId);
  if (previousInitialPageId !== initialPageId) {
    setPreviousInitialPageId(initialPageId);
    if (initialPageId) setSelectedId(initialPageId);
  }
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [obsidianOpen, setObsidianOpen] = useState(false);
  const [obsidianText, setObsidianText] = useState('');

  const request = useCallback(async () => {
    const res = await fetch(`/api/wiki?campaignId=${campaignId}`);
    return res.ok ? (await res.json() ?? []) : null;
  }, [campaignId]);

  const applyResult = useCallback((result: WikiPage[] | null) => {
    if (result) setPages(result);
  }, []);

  const load = useCallback(async () => {
    applyResult(await request());
  }, [request, applyResult]);

  useEffect(() => {
    let active = true;
    request().then((result) => {
      if (active) applyResult(result);
    });
    return () => { active = false; };
  }, [request, applyResult]);

  const selected = (pages ?? []).find((p: WikiPage) => p.id === selectedId);
  const [draft, setDraft] = useState<{
    source: WikiPage | undefined;
    title: string;
    category: string;
    body: string;
    visibility: string;
  }>({ source: undefined, title: '', category: 'Lore', body: '', visibility: 'dm_only' });

  // A different article or a refreshed server result starts a fresh edit draft.
  if (draft.source !== selected) {
    setDraft({
      source: selected,
      title: selected ? (selected.title ?? '') : draft.title,
      category: selected ? (selected.category ?? 'Lore') : draft.category,
      body: selected ? (selected.body ?? '') : draft.body,
      visibility: selected ? (selected.visibility ?? 'dm_only') : draft.visibility,
    });
  }
  const { title: editTitle, category: editCategory, body: editBody, visibility: editVisibility } = draft;
  const setEditTitle = (title: string) => setDraft((prev) => ({ ...prev, title }));
  const setEditCategory = (category: string) => setDraft((prev) => ({ ...prev, category }));
  const setEditBody = (body: string) => setDraft((prev) => ({ ...prev, body }));
  const setEditVisibility = (visibility: string) => setDraft((prev) => ({ ...prev, visibility }));

  const savePage = async () => {
    if (!selectedId) return;
    await fetch('/api/wiki', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedId, title: editTitle, category: editCategory, body: editBody, visibility: editVisibility }),
    });
    toast.success('Saved!');
    load();
  };

  const createPage = async (title: string, category: string, body: string) => {
    const res = await fetch('/api/wiki', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, title, category, body, visibility: 'dm_only' }),
    });
    if (res.ok) {
      const page = await res.json();
      toast.success('Page created!');
      load();
      setSelectedId(page.id);
      setCreateOpen(false);
    }
  };

  const deletePage = async (id: string) => {
    if (!confirm('Delete this wiki page?')) return;
    await fetch(`/api/wiki?id=${id}`, { method: 'DELETE' });
    toast.success('Deleted');
    if (selectedId === id) setSelectedId(null);
    load();
  };

  const importObsidian = () => {
    if (!obsidianText.trim()) return;
    const titles = (pages ?? []).map((p: WikiPage) => p?.title ?? '');
    const html = parseObsidianMarkdown(obsidianText, titles);
    // Try to extract title from first heading
    const titleMatch = obsidianText.match(/^#\s+(.+)/m);
    const title = titleMatch?.[1] ?? 'Imported Page';
    createPage(title, 'Lore', html);
    setObsidianOpen(false);
    setObsidianText('');
  };

  const handleWikiLinkClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement)?.closest?.('.wiki-link');
    if (target) {
      const wikiTarget = target.getAttribute('data-wiki-target');
      if (wikiTarget) {
        const page = (pages ?? []).find((p: WikiPage) => p?.title?.toLowerCase?.() === wikiTarget?.toLowerCase?.());
        if (page) setSelectedId(page.id);
      }
    }
  };

  // Group by category
  const grouped: Record<string, WikiPage[]> = {};
  for (const p of (pages ?? [])) {
    const cat = p?.category ?? 'Lore';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(p);
  }

  const filtered = search
    ? (pages ?? []).filter((p: WikiPage) => p?.title?.toLowerCase?.()?.includes?.(search?.toLowerCase?.()) ?? false)
    : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[250px_1fr] gap-4 min-h-[500px]">
      {/* Sidebar */}
      <div className="bg-card rounded-lg border border-border p-3 overflow-y-auto max-h-[70vh]" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} placeholder="Search..." className="pl-7 h-7 text-xs" />
          </div>
        </div>

        {isDM && (
          <div className="flex gap-1 mb-3">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild><Button size="sm" className="flex-1 text-xs"><Plus className="w-3 h-3 mr-1" /> New</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New Wiki Page</DialogTitle></DialogHeader>
                <div className="space-y-3 mt-2">
                  <div><Label>Title</Label><Input id="newTitle" placeholder="Page title" className="mt-1" /></div>
                  <div>
                    <Label>Category</Label>
                    <select id="newCat" className="mt-1 h-8 w-full rounded-md bg-card border border-input px-2 text-sm" defaultValue="Lore">
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <Button onClick={() => {
                    const t = (document.getElementById('newTitle') as HTMLInputElement)?.value ?? '';
                    const c = (document.getElementById('newCat') as HTMLSelectElement)?.value ?? 'Lore';
                    if (t) createPage(t, c, '');
                  }} className="w-full">Create</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={obsidianOpen} onOpenChange={setObsidianOpen}>
              <DialogTrigger asChild><Button size="sm" variant="secondary" className="text-xs"><Import className="w-3 h-3 mr-1" /> Obsidian</Button></DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>Import Obsidian Markdown</DialogTitle></DialogHeader>
                <p className="text-xs text-muted-foreground">Paste your Obsidian-style markdown below. [[WikiLinks]] will be parsed and linked.</p>
                <textarea value={obsidianText} onChange={(e) => setObsidianText(e.target.value)}
                  className="w-full h-60 bg-muted rounded-lg p-3 text-sm font-mono resize-none border border-border"
                  placeholder="# My Page Title\n\nSome content with [[WikiLink]]..." />
                <Button onClick={importObsidian} className="w-full">Import</Button>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Page list */}
        {search && filtered ? (
          <div className="space-y-0.5">
            {(filtered ?? []).map((p: WikiPage) => (
              <button key={p.id} onClick={() => setSelectedId(p.id)}
                className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${selectedId === p.id ? 'bg-primary/20 text-primary' : 'hover:bg-muted text-foreground'}`}>
                <div className="flex items-center gap-1.5">
                  <FileText className="w-3 h-3 shrink-0" />
                  <span className="truncate">{p?.title ?? 'Untitled'}</span>
                  {isDM && p?.visibility === 'dm_only' && <EyeOff className="w-3 h-3 text-muted-foreground shrink-0" />}
                </div>
              </button>
            ))}
          </div>
        ) : (
          Object.entries(grouped).map(([cat, catPages]) => (
            <div key={cat} className="mb-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 px-1">{cat}</p>
              <div className="space-y-0.5">
                {(catPages ?? []).map((p: WikiPage) => (
                  <button key={p.id} onClick={() => setSelectedId(p.id)}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${selectedId === p.id ? 'bg-primary/20 text-primary' : 'hover:bg-muted text-foreground'}`}>
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3 h-3 shrink-0" />
                      <span className="truncate">{p?.title ?? 'Untitled'}</span>
                      {isDM && p?.visibility === 'dm_only' && <EyeOff className="w-3 h-3 text-muted-foreground shrink-0" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Content */}
      <div className="bg-card rounded-lg border border-border p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
        {!selected ? (
          <div className="text-center py-16 text-muted-foreground">
            <BookOpen className="w-10 h-10 mx-auto mb-2" />
            <p>Select a page from the sidebar{isDM ? ' or create a new one' : ''}</p>
          </div>
        ) : (
          <FadeIn key={selectedId}>
            {isDM ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Input value={editTitle} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditTitle(e.target.value)} className="font-display text-lg font-semibold h-9" />
                  <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="h-9 rounded-md bg-card border border-input px-2 text-sm">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <Button variant={editVisibility === 'shared' ? 'default' : 'secondary'} size="sm"
                    onClick={() => setEditVisibility(editVisibility === 'shared' ? 'dm_only' : 'shared')}>
                    {editVisibility === 'shared' ? <Eye className="w-4 h-4 mr-1" /> : <EyeOff className="w-4 h-4 mr-1" />}
                    {editVisibility === 'shared' ? 'Shared' : 'DM Only'}
                  </Button>
                  <Button size="sm" onClick={savePage}>Save</Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => deletePage(selected.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
                <TipTapEditor content={editBody} onChange={setEditBody} placeholder="Write page content..." />
              </div>
            ) : (
              <div>
                <h2 className="font-display text-xl font-bold mb-1">{selected?.title ?? 'Untitled'}</h2>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{selected?.category ?? 'Lore'}</span>
                <div className="mt-4 tiptap-editor" onClick={handleWikiLinkClick} dangerouslySetInnerHTML={{ __html: selected?.body ?? '' }} />
              </div>
            )}
          </FadeIn>
        )}
      </div>
    </div>
  );
}
