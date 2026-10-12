'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { ImportDraft } from '@/lib/statblock-import';
import { CreatureDetail } from '../bestiary/[creatureId]/_components/creature-detail';

export function CreatureImportDialog({ campaignId, onCreated }: { campaignId: string; onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  async function importCreature() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/creatures/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, ...(mode === 'url' ? { url } : { text }) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Import failed');
      setDraft(result.draft);
    } catch (err) { setError(err instanceof Error ? err.message : 'Import failed. Try pasting the text.'); }
    finally { setBusy(false); }
  }
  return <>
    <Button variant="outline" onClick={() => { setDraft(null); setError(''); setOpen(true); }}>Import</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={draft ? 'max-w-5xl max-h-[90vh] overflow-y-auto' : 'max-w-xl'}>
        <DialogHeader><DialogTitle>{draft ? 'Review imported creature' : 'Import PF1e stat block'}</DialogTitle>
          <DialogDescription>{draft ? 'Review the draft, then create the creature. Reveal defaults to Hidden.' : 'Use an Archives of Nethys or d20pfsrd HTTPS URL, or paste a stat block.'}</DialogDescription>
        </DialogHeader>
        {draft ? <CreatureDetail campaignId={campaignId} creatureId="" role="dm" initialDraft={draft} onCancel={() => setDraft(null)} onCreated={(id) => { setOpen(false); onCreated(id); }} /> : <>
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList><TabsTrigger value="url">Import from URL</TabsTrigger><TabsTrigger value="text">Paste text</TabsTrigger></TabsList>
            <TabsContent value="url"><label htmlFor="import-url" className="text-sm">Stat block URL</label><Input id="import-url" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.aonprd.com/MonsterDisplay.aspx?ItemName=Goblin" /></TabsContent>
            <TabsContent value="text"><label htmlFor="import-text" className="text-sm">Stat block text</label><Textarea id="import-text" value={text} onChange={e => setText(e.target.value)} rows={14} maxLength={90000} placeholder="Goblin CR 1/3…" /></TabsContent>
          </Tabs>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button disabled={busy || !(mode === 'url' ? url.trim() : text.trim())} onClick={() => void importCreature()}>{busy ? 'Importing…' : 'Import draft'}</Button>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
