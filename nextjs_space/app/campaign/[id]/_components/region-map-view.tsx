'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Eye, EyeOff, Link as LinkIcon, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface RegionNode { id: string; campaignId: string; name: string; description: string; nodeType: string; x: number; y: number; visibility: string; }
interface RegionEdge { id: string; campaignId: string; fromNodeId: string; toNodeId: string; label: string; }

const NODE_TYPES = ['city', 'dungeon', 'wilderness', 'town', 'fort', 'poi'];
const NODE_COLORS: Record<string, string> = {
  city: '#D4A547', dungeon: '#E04040', wilderness: '#40A040', town: '#C080D0', fort: '#FF9149', poi: '#60B5FF',
};
const NODE_ICONS: Record<string, string> = {
  city: '🏰', dungeon: '🕳️', wilderness: '🌲', town: '🏠', fort: '⚔️', poi: '⭐',
};

export function RegionMapView({ campaignId, isDM }: { campaignId: string; isDM: boolean }) {
  const [nodes, setNodes] = useState<RegionNode[]>([]);
  const [edges, setEdges] = useState<RegionEdge[]>([]);
  const [editNode, setEditNode] = useState<RegionNode | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [newNode, setNewNode] = useState({ name: '', description: '', nodeType: 'city', visibility: 'dm_only' });
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef<string | null>(null);

  const loadRequest = useCallback(async () => {
    const [nRes, eRes] = await Promise.all([
      fetch(`/api/maps/region-nodes?campaignId=${campaignId}`),
      fetch(`/api/maps/region-edges?campaignId=${campaignId}`),
    ]);
    return { nodes: nRes.ok ? (await nRes.json() ?? []) : null, edges: eRes.ok ? (await eRes.json() ?? []) : null };
  }, [campaignId]);

  const loadResult = useCallback((result: Awaited<ReturnType<typeof loadRequest>>) => {
    if (result.nodes) setNodes(result.nodes);
    if (result.edges) setEdges(result.edges);
  }, []);

  const load = useCallback(async () => {
    loadResult(await loadRequest());
  }, [loadRequest, loadResult]);

  useEffect(() => {
    let active = true;
    loadRequest().then((result) => { if (active) loadResult(result); });
    return () => { active = false; };
  }, [loadRequest, loadResult]);

  const addNode = async () => {
    if (!newNode.name) { toast.error('Enter a name'); return; }
    await fetch('/api/maps/region-nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, ...newNode, x: 100 + Math.random() * 400, y: 100 + Math.random() * 300 }),
    });
    toast.success('Node added!');
    setAddOpen(false);
    setNewNode({ name: '', description: '', nodeType: 'city', visibility: 'dm_only' });
    load();
  };

  const updateNode = async () => {
    if (!editNode) return;
    await fetch('/api/maps/region-nodes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editNode.id, name: editNode.name, description: editNode.description, nodeType: editNode.nodeType, visibility: editNode.visibility }),
    });
    toast.success('Updated!');
    setEditNode(null);
    load();
  };

  const deleteNode = async (id: string) => {
    await fetch(`/api/maps/region-nodes?id=${id}`, { method: 'DELETE' });
    setEditNode(null);
    load();
  };

  const handleNodeClick = (node: RegionNode) => {
    if (linkMode && isDM) {
      if (!linkFrom) {
        setLinkFrom(node.id);
        toast.info(`Select destination node for edge from "${node?.name ?? ''}"`);
      } else if (linkFrom !== node.id) {
        // Create edge
        fetch('/api/maps/region-edges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId, fromNodeId: linkFrom, toNodeId: node.id }),
        }).then(() => { load(); toast.success('Edge created!'); });
        setLinkFrom(null);
        setLinkMode(false);
      }
    } else {
      setEditNode(node);
    }
  };

  const handleMouseDown = (id: string) => {
    if (!isDM || linkMode) return;
    draggingRef.current = id;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingRef.current || !svgRef.current) return;
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const svgPt = pt.matrixTransform(ctm.inverse());
    setNodes((prev) => (prev ?? []).map((n: RegionNode) => n.id === draggingRef.current ? { ...n, x: svgPt.x, y: svgPt.y } : n));
  };

  const handleMouseUp = async () => {
    if (!draggingRef.current) return;
    const node = (nodes ?? []).find((n: RegionNode) => n.id === draggingRef.current);
    if (node) {
      await fetch('/api/maps/region-nodes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: node.id, x: node.x, y: node.y }),
      });
    }
    draggingRef.current = null;
  };

  const deleteEdge = async (id: string) => {
    await fetch(`/api/maps/region-edges?id=${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-3">
      {isDM && (
        <div className="flex items-center gap-2">
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Location</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Region Node</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                <div><Label>Name</Label><Input value={newNode.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewNode({ ...newNode, name: e.target.value })} className="mt-1" /></div>
                <div><Label>Description</Label><textarea value={newNode.description} onChange={(e) => setNewNode({ ...newNode, description: e.target.value })} className="w-full mt-1 bg-muted rounded-md p-2 text-sm border border-border min-h-[60px]" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Type</Label><select value={newNode.nodeType} onChange={(e) => setNewNode({ ...newNode, nodeType: e.target.value })} className="mt-1 h-8 w-full rounded-md bg-card border border-input px-2 text-sm">{NODE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
                  <div><Label>Visibility</Label><select value={newNode.visibility} onChange={(e) => setNewNode({ ...newNode, visibility: e.target.value })} className="mt-1 h-8 w-full rounded-md bg-card border border-input px-2 text-sm"><option value="dm_only">DM Only</option><option value="shared">Shared</option></select></div>
                </div>
                <Button onClick={addNode} className="w-full">Add</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant={linkMode ? 'default' : 'secondary'} size="sm" onClick={() => { setLinkMode(!linkMode); setLinkFrom(null); }}>
            <LinkIcon className="w-4 h-4 mr-1" /> {linkMode ? 'Linking... (click two nodes)' : 'Connect Nodes'}
          </Button>
        </div>
      )}

      {(nodes?.length ?? 0) === 0 ? (
        <div className="text-center py-20 text-muted-foreground border-2 border-dashed border-border rounded-lg">
          <GitBranch className="w-10 h-10 mx-auto mb-2" />
          <p>{isDM ? 'Add locations to build your region map' : 'No region map available yet'}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden" style={{ boxShadow: 'var(--shadow-md)' }}>
          <svg ref={svgRef} viewBox="0 0 800 500" className="w-full" style={{ minHeight: 400 }}
            onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
            {/* Background */}
            <rect width="800" height="500" fill="hsl(38, 42%, 80%)" />
            {/* Edges */}
            {(edges ?? []).map((edge: RegionEdge) => {
              const from = (nodes ?? []).find((n: RegionNode) => n.id === edge.fromNodeId);
              const to = (nodes ?? []).find((n: RegionNode) => n.id === edge.toNodeId);
              if (!from || !to) return null;
              return (
                <g key={edge.id}>
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="hsl(28, 35%, 42%)" strokeWidth="2" strokeDasharray="6,3" />
                  {isDM && (
                    <circle cx={(from.x + to.x) / 2} cy={(from.y + to.y) / 2} r="8" fill="hsl(0, 63%, 50%)" opacity="0" className="hover:opacity-100 cursor-pointer" onClick={() => deleteEdge(edge.id)}>
                      <title>Click to remove edge</title>
                    </circle>
                  )}
                </g>
              );
            })}
            {/* Nodes */}
            {(nodes ?? []).map((node: RegionNode) => (
              <g key={node.id} transform={`translate(${node.x}, ${node.y})`}
                onClick={() => handleNodeClick(node)}
                onMouseDown={() => handleMouseDown(node.id)}
                className={isDM ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}>
                <circle r="20" fill={NODE_COLORS[node?.nodeType ?? 'poi'] ?? '#60B5FF'} opacity="0.2" />
                <circle r="14" fill={NODE_COLORS[node?.nodeType ?? 'poi'] ?? '#60B5FF'} stroke="hsl(28, 30%, 35%)" strokeWidth="2" />
                <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize="14">
                  {NODE_ICONS[node?.nodeType ?? 'poi'] ?? '⭐'}
                </text>
                <text y="28" textAnchor="middle" fill="hsl(25, 40%, 22%)" fontSize="10" fontWeight="600">
                  {node?.name ?? 'Unknown'}
                </text>
                {isDM && node?.visibility === 'dm_only' && (
                  <text y="-22" textAnchor="middle" fill="hsl(28, 24%, 40%)" fontSize="8">👁️‍🗨️ DM</text>
                )}
                {linkFrom === node.id && (
                  <circle r="22" fill="none" stroke="#D4A547" strokeWidth="3" strokeDasharray="4,2">
                    <animate attributeName="stroke-dashoffset" from="0" to="12" dur="0.5s" repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            ))}
          </svg>
        </div>
      )}

      {/* Edit node dialog */}
      <Dialog open={!!editNode} onOpenChange={() => setEditNode(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Location Details</DialogTitle></DialogHeader>
          {editNode && (
            <div className="space-y-3 mt-2">
              <div><Label>Name</Label><Input value={editNode.name ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditNode({ ...editNode, name: e.target.value })} disabled={!isDM} className="mt-1" /></div>
              <div><Label>Description</Label><textarea value={editNode.description ?? ''} onChange={(e) => setEditNode({ ...editNode, description: e.target.value })} disabled={!isDM} className="w-full mt-1 bg-muted rounded-md p-2 text-sm border border-border min-h-[60px]" /></div>
              {isDM && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Type</Label><select value={editNode.nodeType ?? 'city'} onChange={(e) => setEditNode({ ...editNode, nodeType: e.target.value })} className="mt-1 h-8 w-full rounded-md bg-card border border-input px-2 text-sm">{NODE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
                    <div><Label>Visibility</Label><select value={editNode.visibility ?? 'dm_only'} onChange={(e) => setEditNode({ ...editNode, visibility: e.target.value })} className="mt-1 h-8 w-full rounded-md bg-card border border-input px-2 text-sm"><option value="dm_only">DM Only</option><option value="shared">Shared</option></select></div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={updateNode} className="flex-1">Save</Button>
                    <Button variant="destructive" onClick={() => deleteNode(editNode.id)}>Delete</Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
