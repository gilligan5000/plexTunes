"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { HexColorPicker } from 'react-colorful';
import {
  Lightbulb, Plus, Trash2, Loader2, XCircle,
  RefreshCw, ChevronDown, ChevronUp, Play, Save, AlertCircle,
} from 'lucide-react';

// Preset colour swatches - popular WLED colours
const COLOR_PRESETS = [
  '#ff0000', '#ff4500', '#ff8c00', '#ffd700', '#ffff00',
  '#adff2f', '#00ff00', '#00fa9a', '#00ffff', '#00bfff',
  '#0000ff', '#8a2be2', '#ff00ff', '#ff1493', '#ffffff',
  '#ff6b35', '#f7c948', '#2ec4b6', '#e71d36', '#011627',
];

type Instance = {
  id: string;
  name: string;
  host: string;
  enabled: boolean;
  brightnessCap: number;

  matrixEnabled: boolean;
  matrixSegmentId: number;
  matrixOutputType: 'matrix' | 'strip' | string;
  matrixTextFormat: string;
  matrixColorMode: 'fixed' | 'random' | string;
  matrixColor: string;
  matrixEffectId: number;
  matrixPaletteId: number;
  matrixSpeed: number;
  matrixIntensity: number;
  matrixCustom1: number;
  matrixCustom2: number;
  matrixCustom3: number;
  matrixOption1: boolean;

  perimeterEnabled: boolean;
  perimeterSegmentId: number;
  perimeterOutputType: 'matrix' | 'strip' | string;
  perimeterTextFormat: string;
  perimeterColorMode: 'fixed' | 'random' | string;
  perimeterEffectId: number;
  perimeterColor: string;
  perimeterPaletteId: number;
  perimeterSpeed: number;
  perimeterIntensity: number;
  perimeterCustom1: number;
  perimeterCustom2: number;
  perimeterCustom3: number;
  perimeterOption1: boolean;

  matrixPlaylist: string;     // JSON
  perimeterPlaylist: string;  // JSON

  lastSeenAt?: string | null;
  lastError?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type ProbeInfo = {
  online: boolean;
  host: string;
  version?: string | null;
  name?: string | null;
  ledCount?: number | null;
  is2d?: boolean;
  matrix?: any;
  effects?: string[];
  palettes?: string[];
  error?: string;
};

const DEFAULT_NEW: Partial<Instance> = {
  name: '',
  host: '',
  enabled: true,
  brightnessCap: 200,
  matrixEnabled: true,
  matrixSegmentId: 0,
  matrixOutputType: 'matrix',
  matrixTextFormat: '{title}',
  matrixColorMode: 'fixed',
  matrixColor: '#22c55e',
  matrixEffectId: 165,
  matrixPaletteId: 0,
  matrixSpeed: 128,
  matrixIntensity: 128,
  matrixCustom1: 0,     // c1 = Trail (0 = no trail)
  matrixCustom2: 128,   // c2 = Font Size (128 = default)
  matrixCustom3: 16,    // c3 = Y Offset (16 = normal / centered)
  matrixOption1: false,
  perimeterEnabled: true,
  perimeterSegmentId: 1,
  perimeterOutputType: 'strip',
  perimeterTextFormat: '{title}',
  perimeterColorMode: 'fixed',
  perimeterEffectId: 9,
  perimeterColor: '#06b6d4',
  perimeterPaletteId: 0,
  perimeterSpeed: 128,
  perimeterIntensity: 128,
  perimeterCustom1: 128,
  perimeterCustom2: 128,
  perimeterCustom3: 128,
  perimeterOption1: false,
  matrixPlaylist: '[]',
  perimeterPlaylist: '[]',
};

type PlaylistStep = {
  effectId: number;
  duration: number;
  text?: string;
  paletteId?: number;
  color?: string;
  speed?: number;
  intensity?: number;
  custom1?: number;
  custom2?: number;
  custom3?: number;
  option1?: boolean;
};

/**
 * Effect IDs that use the scrolling text renderer and support c1/c2/c3/o1.
 * WLED v16 shifted many effect IDs — we keep legacy fallbacks (122, 165) but
 * the primary detection is now name-based via findScrollingTextIds().
 */
const LEGACY_SCROLLING_TEXT_IDS = new Set([122, 165]);

/** Scan a probed effects list for entries whose name contains "Scrolling Text" or "Text" effect. */
function findScrollingTextIds(effectsList: string[]): Set<number> {
  const ids = new Set<number>();
  effectsList.forEach((name, idx) => {
    const lower = (name ?? '').toLowerCase();
    if (lower.includes('scrolling text') || lower === 'scroll text') ids.add(idx);
  });
  // If probe didn't find any (e.g. no probe yet), fall back to legacy IDs
  return ids.size > 0 ? ids : LEGACY_SCROLLING_TEXT_IDS;
}

function parsePlaylist(json: string | null | undefined): PlaylistStep[] {
  if (!json) return [];
  try { const a = JSON.parse(json); return Array.isArray(a) ? a : []; } catch { return []; }
}

const AUDIO_REACTIVE_HINTS: Array<{ id: number; label: string }> = [
  // Common audio-reactive effect IDs in WLED-MM / SR builds.
  { id: 128, label: 'Perlin Move (AR)' },
  { id: 140, label: 'Ripple Peak (AR)' },
  { id: 141, label: 'Gravimeter (AR)' },
  { id: 142, label: 'Pixels (AR)' },
  { id: 143, label: 'Plasmoid (AR)' },
  { id: 144, label: 'Puddles (AR)' },
  { id: 145, label: 'Matripix (AR)' },
  { id: 146, label: 'Midnoise (AR)' },
  { id: 147, label: 'Blurz (AR)' },
  { id: 148, label: 'Freqmap (AR)' },
  { id: 149, label: 'Gravcenter (AR)' },
  { id: 150, label: 'Noisefire (AR)' },
];

// WLED v16 Particle System effects (1D) — great for strips and ambient lighting
const PS_1D_EFFECTS: Array<{ id: number; label: string }> = [
  { id: 0, label: 'PS DripDrop' },
  { id: 0, label: 'PS Fireworks 1D' },
  { id: 0, label: 'PS Sparkler' },
  { id: 0, label: 'PS Fire 1D' },
  { id: 0, label: 'PS Sonic Stream (AR)' },
  { id: 0, label: 'PS Sonic Boom (AR)' },
  { id: 0, label: 'PS GEQ 1D (AR)' },
  { id: 0, label: 'PS Starburst' },
  { id: 0, label: 'PS Chase' },
  { id: 0, label: 'PS Spring' },
];

// WLED v16 Particle System effects (2D) — for matrix panels
const PS_2D_EFFECTS: Array<{ id: number; label: string }> = [
  { id: 0, label: 'PS Fire' },
  { id: 0, label: 'PS Waterfall' },
  { id: 0, label: 'PS Vortex' },
  { id: 0, label: 'PS Fireworks' },
  { id: 0, label: 'PS Volcano' },
  { id: 0, label: 'PS Galaxy' },
  { id: 0, label: 'PS Ghost Rider' },
  { id: 0, label: 'PS GEQ Nova (AR)' },
  { id: 0, label: 'PS GEQ 2D (AR)' },
  { id: 0, label: 'PS Blobs' },
];

/**
 * Resolve PS effect hints against an actual effects list from the device.
 * Since v16 PS IDs vary by build, we match by name. Falls back to the
 * static hint list (with id=0 indicating "not available") when no probe data.
 */
function resolvePSEffects(hints: Array<{ id: number; label: string }>, effectsList: string[]): Array<{ id: number; label: string }> {
  if (effectsList.length === 0) return [];
  return hints.map(h => {
    // Strip trailing " (AR)" for matching against the effects list
    const searchName = h.label.replace(/\s*\(AR\)$/, '').trim().toLowerCase();
    const idx = effectsList.findIndex(n => (n ?? '').toLowerCase().includes(searchName));
    return idx >= 0 ? { id: idx, label: `${effectsList[idx]}` } : null;
  }).filter(Boolean) as Array<{ id: number; label: string }>;
}

function StatusDot({ inst }: { inst: Instance }) {
  const now = Date.now();
  const seen = inst.lastSeenAt ? Date.parse(inst.lastSeenAt) : 0;
  const fresh = seen && now - seen < 10 * 60 * 1000;
  if (inst.lastError && !fresh) {
    return <span title={inst.lastError} className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />;
  }
  if (fresh) {
    return <span title="Online" className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />;
  }
  return <span title="Unknown" className="inline-block w-2.5 h-2.5 rounded-full bg-muted-foreground/60" />;
}

export default function WledPanelsSection() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-instance expansion state + probe cache.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [probes, setProbes] = useState<Record<string, ProbeInfo | null>>({});
  const [probing, setProbing] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string | null>>({});

  // Local edits (drafts) per instance so we can debounce saves.
  const [drafts, setDrafts] = useState<Record<string, Partial<Instance>>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newDraft, setNewDraft] = useState<Partial<Instance>>(DEFAULT_NEW);
  const [creating, setCreating] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/wled/instances', { cache: 'no-store' });
      const j = await r.json();
      setInstances(j.instances ?? []);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const probe = useCallback(async (id: string, hostOverride?: string) => {
    setProbing(p => ({ ...p, [id]: true }));
    try {
      const url = hostOverride
        ? `/api/wled/instances/${id}/info?host=${encodeURIComponent(hostOverride)}`
        : `/api/wled/instances/${id}/info`;
      const r = await fetch(url, { cache: 'no-store' });
      const j = await r.json();
      setProbes(p => ({ ...p, [id]: j }));
    } catch (e: any) {
      setProbes(p => ({ ...p, [id]: { online: false, host: hostOverride ?? '', error: e?.message } }));
    } finally {
      setProbing(p => ({ ...p, [id]: false }));
    }
  }, []);

  const toggleExpand = useCallback(async (id: string) => {
    setExpanded(e => ({ ...e, [id]: !e[id] }));
    if (!probes[id]) probe(id);
  }, [probe, probes]);

  const getEffective = useCallback((id: string): Instance | null => {
    const base = instances.find(i => i.id === id);
    if (!base) return null;
    return { ...base, ...(drafts[id] ?? {}) } as Instance;
  }, [instances, drafts]);

  const updateDraft = useCallback((id: string, patch: Partial<Instance>) => {
    setDrafts(d => ({ ...d, [id]: { ...(d[id] ?? {}), ...patch } }));
  }, []);

  const save = useCallback(async (id: string) => {
    const d = drafts[id];
    if (!d || Object.keys(d).length === 0) return;
    setSavingId(id);
    try {
      const r = await fetch(`/api/wled/instances/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      });
      const j = await r.json();
      if (j.instance) {
        setInstances(prev => prev.map(i => i.id === id ? j.instance : i));
        setDrafts(prev => { const n = { ...prev }; delete n[id]; return n; });
      }
    } finally {
      setSavingId(null);
    }
  }, [drafts]);

  const test = useCallback(async (id: string) => {
    setTestingId(id);
    setTestResult(t => ({ ...t, [id]: null }));
    try {
      // Save any pending edits first so the test reflects current UI.
      if (drafts[id] && Object.keys(drafts[id]).length > 0) {
        await save(id);
      }
      const r = await fetch(`/api/wled/instances/${id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      setTestResult(t => ({ ...t, [id]: j.ok ? 'Pushed preview' : (j.error ?? 'Failed') }));
    } catch (e: any) {
      setTestResult(t => ({ ...t, [id]: e?.message ?? 'Failed' }));
    } finally {
      setTestingId(null);
      setTimeout(() => setTestResult(t => ({ ...t, [id]: null })), 4000);
    }
  }, [drafts, save]);

  const del = useCallback(async (id: string) => {
    if (!confirm('Delete this WLED panel?')) return;
    await fetch(`/api/wled/instances/${id}`, { method: 'DELETE' });
    setInstances(prev => prev.filter(i => i.id !== id));
  }, []);

  const add = useCallback(async () => {
    if (!newDraft.name || !newDraft.host) return;
    setCreating(true);
    try {
      const r = await fetch('/api/wled/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDraft),
      });
      const j = await r.json();
      if (j.instance) {
        setInstances(prev => [...prev, j.instance]);
        setNewDraft(DEFAULT_NEW);
        setShowAdd(false);
      }
    } finally {
      setCreating(false);
    }
  }, [newDraft]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.27 }}
      className="mb-8"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-display font-semibold flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-accent" />
          WLED Panels
        </h3>
        <button
          onClick={() => setShowAdd(s => !s)}
          className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Panel
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Configure WLED-powered light panels. Each unit has two outputs &#8212; a 2D matrix for the song title and a
        perimeter strip for ambient or audio-reactive effects. All panels update together when a new track plays.
      </p>

      {showAdd && (
        <div className="p-4 rounded-lg bg-secondary/40 border border-border/20 mb-3 space-y-3">
          <h4 className="text-sm font-semibold">New Panel</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="flex flex-col text-xs">
              <span className="text-muted-foreground mb-1">Name</span>
              <input
                type="text" value={newDraft.name ?? ''}
                onChange={(e) => setNewDraft(n => ({ ...n, name: e.target.value }))}
                placeholder="Living Room"
                className="px-2 py-1.5 rounded-lg bg-background border border-border/50 text-sm"
              />
            </label>
            <label className="flex flex-col text-xs">
              <span className="text-muted-foreground mb-1">Host (IP or hostname)</span>
              <input
                type="text" value={newDraft.host ?? ''}
                onChange={(e) => setNewDraft(n => ({ ...n, host: e.target.value }))}
                placeholder="192.168.1.42"
                className="px-2 py-1.5 rounded-lg bg-background border border-border/50 text-sm"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={add}
              disabled={creating || !newDraft.name || !newDraft.host}
              className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewDraft(DEFAULT_NEW); }}
              className="px-3 py-1.5 text-xs rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-6 rounded-lg bg-secondary/40 border border-border/20 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">{error}</div>
      ) : instances.length === 0 ? (
        <div className="p-4 rounded-lg bg-secondary/40 border border-border/20 text-sm text-muted-foreground">
          No WLED panels configured yet. Click <strong>Add Panel</strong> above to connect one.
        </div>
      ) : (
        <div className="space-y-3">
          {instances.map((raw) => {
            const inst = getEffective(raw.id);
            if (!inst) return null;
            const draft = drafts[raw.id];
            const dirty = !!(draft && Object.keys(draft).length > 0);
            const probeInfo = probes[raw.id];
            const isOpen = !!expanded[raw.id];
            const effectsList = probeInfo?.effects ?? [];
            const palettesList = probeInfo?.palettes ?? [];
            const anyMatrixMode =
              (inst.matrixEnabled && inst.matrixOutputType === 'matrix') ||
              (inst.perimeterEnabled && inst.perimeterOutputType === 'matrix');
            const needs2D = anyMatrixMode && probeInfo && probeInfo.online && !probeInfo.is2d;

            return (
              <div key={raw.id} className="rounded-lg bg-secondary/40 border border-border/20 overflow-hidden">
                <div className="flex items-center gap-2 p-3">
                  <StatusDot inst={raw} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={inst.name}
                        onChange={(e) => updateDraft(raw.id, { name: e.target.value })}
                        className="bg-transparent text-sm font-medium outline-none border-b border-transparent focus:border-border px-1 -ml-1 min-w-0 flex-1"
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <input
                        type="text"
                        value={inst.host}
                        onChange={(e) => updateDraft(raw.id, { host: e.target.value })}
                        className="bg-transparent outline-none border-b border-transparent focus:border-border px-1 -ml-1 font-mono"
                      />
                      {probeInfo?.version && <span>&bull; v{probeInfo.version}</span>}
                      {probeInfo?.ledCount != null && <span>&bull; {probeInfo.ledCount} LEDs</span>}
                    </div>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={inst.enabled}
                      onChange={(e) => updateDraft(raw.id, { enabled: e.target.checked })}
                      className="accent-primary"
                    />
                    <span className="text-muted-foreground">Enabled</span>
                  </label>
                  <button
                    onClick={() => probe(raw.id)}
                    disabled={probing[raw.id]}
                    title="Re-check status"
                    className="p-1.5 rounded-lg hover:bg-background/60 transition-colors text-muted-foreground disabled:opacity-50"
                  >
                    {probing[raw.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => toggleExpand(raw.id)}
                    className="p-1.5 rounded-lg hover:bg-background/60 transition-colors text-muted-foreground"
                  >
                    {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {isOpen && (
                  <div className="px-3 pb-3 space-y-3 border-t border-border/10">
                    {probeInfo && !probeInfo.online && (
                      <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-start gap-2">
                        <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>Cannot reach WLED at {inst.host}: {probeInfo.error ?? 'offline'}</span>
                      </div>
                    )}
                    {needs2D && (
                      <div className="mt-3 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-400 flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>Matrix output is enabled but this WLED isn&apos;t configured as a 2D matrix yet. Open the WLED UI &rarr; <em>2D Configuration</em> and set width/height, then come back.</span>
                      </div>
                    )}

                    {/* Brightness */}
                    <div className="flex items-center gap-3 mt-3">
                      <label className="text-xs text-muted-foreground w-28">Brightness cap</label>
                      <input
                        type="range" min={0} max={255}
                        value={inst.brightnessCap}
                        onChange={(e) => updateDraft(raw.id, { brightnessCap: parseInt(e.target.value) })}
                        className="flex-1 accent-primary h-2"
                      />
                      <span className="text-xs font-mono w-10 text-right">{inst.brightnessCap}</span>
                    </div>

                    {/* Output 1 */}
                    <OutputCard
                      title="Output 1"
                      outputType={inst.matrixOutputType}
                      enabled={inst.matrixEnabled}
                      segmentId={inst.matrixSegmentId}
                      textFormat={inst.matrixTextFormat}
                      colorMode={inst.matrixColorMode}
                      color={inst.matrixColor}
                      effectId={inst.matrixEffectId}
                      paletteId={inst.matrixPaletteId}
                      speed={inst.matrixSpeed}
                      intensity={inst.matrixIntensity}
                      custom1={inst.matrixCustom1}
                      custom2={inst.matrixCustom2}
                      custom3={inst.matrixCustom3}
                      option1={inst.matrixOption1}
                      playlist={parsePlaylist(inst.matrixPlaylist)}
                      effectsList={effectsList}
                      palettesList={palettesList}
                      onChange={(patch) => updateDraft(raw.id, {
                        ...(patch.outputType !== undefined ? { matrixOutputType: patch.outputType } : {}),
                        ...(patch.enabled !== undefined ? { matrixEnabled: patch.enabled } : {}),
                        ...(patch.segmentId !== undefined ? { matrixSegmentId: patch.segmentId } : {}),
                        ...(patch.textFormat !== undefined ? { matrixTextFormat: patch.textFormat } : {}),
                        ...(patch.colorMode !== undefined ? { matrixColorMode: patch.colorMode } : {}),
                        ...(patch.color !== undefined ? { matrixColor: patch.color } : {}),
                        ...(patch.effectId !== undefined ? { matrixEffectId: patch.effectId } : {}),
                        ...(patch.paletteId !== undefined ? { matrixPaletteId: patch.paletteId } : {}),
                        ...(patch.speed !== undefined ? { matrixSpeed: patch.speed } : {}),
                        ...(patch.intensity !== undefined ? { matrixIntensity: patch.intensity } : {}),
                        ...(patch.custom1 !== undefined ? { matrixCustom1: patch.custom1 } : {}),
                        ...(patch.custom2 !== undefined ? { matrixCustom2: patch.custom2 } : {}),
                        ...(patch.custom3 !== undefined ? { matrixCustom3: patch.custom3 } : {}),
                        ...(patch.option1 !== undefined ? { matrixOption1: patch.option1 } : {}),
                        ...(patch.playlist !== undefined ? { matrixPlaylist: JSON.stringify(patch.playlist) } as any : {}),
                      })}
                    />

                    {/* Output 2 */}
                    <OutputCard
                      title="Output 2"
                      outputType={inst.perimeterOutputType}
                      enabled={inst.perimeterEnabled}
                      segmentId={inst.perimeterSegmentId}
                      textFormat={inst.perimeterTextFormat}
                      colorMode={inst.perimeterColorMode}
                      color={inst.perimeterColor}
                      effectId={inst.perimeterEffectId}
                      paletteId={inst.perimeterPaletteId}
                      speed={inst.perimeterSpeed}
                      intensity={inst.perimeterIntensity}
                      custom1={inst.perimeterCustom1}
                      custom2={inst.perimeterCustom2}
                      custom3={inst.perimeterCustom3}
                      option1={inst.perimeterOption1}
                      playlist={parsePlaylist(inst.perimeterPlaylist)}
                      effectsList={effectsList}
                      palettesList={palettesList}
                      onChange={(patch) => updateDraft(raw.id, {
                        ...(patch.outputType !== undefined ? { perimeterOutputType: patch.outputType } : {}),
                        ...(patch.enabled !== undefined ? { perimeterEnabled: patch.enabled } : {}),
                        ...(patch.segmentId !== undefined ? { perimeterSegmentId: patch.segmentId } : {}),
                        ...(patch.textFormat !== undefined ? { perimeterTextFormat: patch.textFormat } : {}),
                        ...(patch.colorMode !== undefined ? { perimeterColorMode: patch.colorMode } : {}),
                        ...(patch.color !== undefined ? { perimeterColor: patch.color } : {}),
                        ...(patch.effectId !== undefined ? { perimeterEffectId: patch.effectId } : {}),
                        ...(patch.paletteId !== undefined ? { perimeterPaletteId: patch.paletteId } : {}),
                        ...(patch.speed !== undefined ? { perimeterSpeed: patch.speed } : {}),
                        ...(patch.intensity !== undefined ? { perimeterIntensity: patch.intensity } : {}),
                        ...(patch.custom1 !== undefined ? { perimeterCustom1: patch.custom1 } : {}),
                        ...(patch.custom2 !== undefined ? { perimeterCustom2: patch.custom2 } : {}),
                        ...(patch.custom3 !== undefined ? { perimeterCustom3: patch.custom3 } : {}),
                        ...(patch.option1 !== undefined ? { perimeterOption1: patch.option1 } : {}),
                        ...(patch.playlist !== undefined ? { perimeterPlaylist: JSON.stringify(patch.playlist) } as any : {}),
                      })}
                    />

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <button
                        onClick={() => save(raw.id)}
                        disabled={!dirty || savingId === raw.id}
                        className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {savingId === raw.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save{dirty ? ' *' : ''}
                      </button>
                      <button
                        onClick={() => test(raw.id)}
                        disabled={testingId === raw.id}
                        className="px-3 py-1.5 text-xs rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {testingId === raw.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        Test
                      </button>
                      {testResult[raw.id] && (
                        <span className={`text-xs ${testResult[raw.id]?.startsWith('Pushed') ? 'text-green-400' : 'text-red-400'}`}>
                          {testResult[raw.id]}
                        </span>
                      )}
                      <div className="flex-1" />
                      <button
                        onClick={() => del(raw.id)}
                        title="Delete panel"
                        className="px-2.5 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// OutputCard: one configurable WLED output. Each instance has two of these.
// ---------------------------------------------------------------------------

type OutputCardProps = {
  title: string;
  outputType: string;
  enabled: boolean;
  segmentId: number;
  textFormat: string;
  colorMode: string;
  color: string;
  effectId: number;
  paletteId: number;
  speed: number;
  intensity: number;
  custom1: number;
  custom2: number;
  custom3: number;
  option1: boolean;
  playlist: PlaylistStep[];
  effectsList: string[];
  palettesList: string[];
  onChange: (patch: Partial<{
    outputType: string;
    enabled: boolean;
    segmentId: number;
    textFormat: string;
    colorMode: string;
    color: string;
    effectId: number;
    paletteId: number;
    speed: number;
    intensity: number;
    custom1: number;
    custom2: number;
    custom3: number;
    option1: boolean;
    playlist: PlaylistStep[];
  }>) => void;
};

function OutputCard(props: OutputCardProps) {
  const isMatrix = props.outputType === 'matrix';
  const typeLabel = isMatrix ? '2D Text Matrix' : 'LED Strip';

  // Dynamically detect scrolling text effect IDs from the probed effects list
  const scrollingTextIds = findScrollingTextIds(props.effectsList);
  const isScrollingTextEffect = (effectId: number) => scrollingTextIds.has(effectId);

  // Resolve particle system effects from the probed effects list
  const ps1dResolved = resolvePSEffects(PS_1D_EFFECTS, props.effectsList);
  const ps2dResolved = resolvePSEffects(PS_2D_EFFECTS, props.effectsList);

  return (
    <div className="rounded-lg bg-background/40 border border-border/20 p-3">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h5 className="text-sm font-semibold">
          {props.title}
          <span className="ml-2 text-xs font-normal text-muted-foreground">({typeLabel})</span>
        </h5>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={props.enabled}
            onChange={(e) => props.onChange({ enabled: e.target.checked })}
            className="accent-primary"
          />
          <span className="text-muted-foreground">Enabled</span>
        </label>
      </div>

      {/* Type selector */}
      <label className="flex flex-col text-xs mb-2">
        <span className="text-muted-foreground mb-1">Output type</span>
        <select
          value={props.outputType}
          onChange={(e) => props.onChange({ outputType: e.target.value })}
          className="px-2 py-1 rounded-lg bg-background border border-border/50 text-sm"
        >
          <option value="matrix">2D Text Matrix (scrolls song title)</option>
          <option value="strip">LED Strip (ambient / audio-reactive)</option>
        </select>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="flex flex-col text-xs">
          <span className="text-muted-foreground mb-1">Segment ID</span>
          <input
            type="number" min={0} max={15}
            value={props.segmentId}
            onChange={(e) => props.onChange({ segmentId: parseInt(e.target.value) || 0 })}
            className="px-2 py-1 rounded-lg bg-background border border-border/50 text-sm"
          />
        </label>
        <label className="flex flex-col text-xs">
          <span className="text-muted-foreground mb-1">
            Effect{!isMatrix && <span className="opacity-60"> (&quot;AR&quot; effects use the built-in mic)</span>}
          </span>
          <select
            value={props.effectId}
            onChange={(e) => props.onChange({ effectId: parseInt(e.target.value) })}
            className="px-2 py-1 rounded-lg bg-background border border-border/50 text-sm"
          >
            {props.effectsList.length > 0
              ? props.effectsList.map((name, i) => <option key={i} value={i}>{i}: {name}</option>)
              : isMatrix
                ? <option value={165}>165: Scrolling Text</option>
                : (
                  <>
                    {AUDIO_REACTIVE_HINTS.map(o => <option key={`ar-${o.id}`} value={o.id}>{o.id}: {o.label}</option>)}
                    <optgroup label="── Particle System (v16+) ──">
                      {PS_1D_EFFECTS.filter(o => o.id > 0).map(o => <option key={`ps1d-${o.id}`} value={o.id}>{o.id}: {o.label}</option>)}
                    </optgroup>
                  </>
                )
            }
          </select>
        </label>
      </div>

      {isMatrix ? (
        <>
          <label className="flex flex-col text-xs mt-2">
            <span className="text-muted-foreground mb-1">
              Text template <span className="opacity-70">(tokens: {`{title}`} {`{artist}`} {`{album}`} {`{station}`})</span>
            </span>
            <input
              type="text"
              value={props.textFormat}
              onChange={(e) => props.onChange({ textFormat: e.target.value })}
              className="px-2 py-1 rounded-lg bg-background border border-border/50 text-sm font-mono"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            <label className="flex flex-col text-xs">
              <span className="text-muted-foreground mb-1">Colour mode</span>
              <select
                value={props.colorMode}
                onChange={(e) => props.onChange({ colorMode: e.target.value })}
                className="px-2 py-1 rounded-lg bg-background border border-border/50 text-sm"
              >
                <option value="fixed">Fixed colour</option>
                <option value="random">Random each song</option>
              </select>
            </label>
            <div className="flex flex-col text-xs">
              <span className="text-muted-foreground mb-1">Colour</span>
              <WledColorPicker
                color={props.color}
                onChange={(c) => props.onChange({ color: c })}
                disabled={props.colorMode === 'random'}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          <label className="flex flex-col text-xs">
            <span className="text-muted-foreground mb-1">Palette</span>
            <select
              value={props.paletteId}
              onChange={(e) => props.onChange({ paletteId: parseInt(e.target.value) })}
              className="px-2 py-1 rounded-lg bg-background border border-border/50 text-sm"
            >
              {props.palettesList.length > 0
                ? props.palettesList.map((name, i) => <option key={i} value={i}>{i}: {name}</option>)
                : <option value={0}>0: Default</option>
              }
            </select>
          </label>
          <div className="flex flex-col text-xs">
            <span className="text-muted-foreground mb-1">Accent colour</span>
            <WledColorPicker
              color={props.color}
              onChange={(c) => props.onChange({ color: c })}
            />
          </div>
        </div>
      )}

      {/* Default speed/intensity + custom sliders */}
      <div className="space-y-1.5 mt-2">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground w-16">Speed</label>
          <input type="range" min={0} max={255} value={props.speed}
            onChange={(e) => props.onChange({ speed: parseInt(e.target.value) })}
            className="flex-1 accent-primary h-2" />
          <span className="text-xs font-mono w-8 text-right">{props.speed}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground w-16">Intensity</label>
          <input type="range" min={0} max={255} value={props.intensity}
            onChange={(e) => props.onChange({ intensity: parseInt(e.target.value) })}
            className="flex-1 accent-primary h-2" />
          <span className="text-xs font-mono w-8 text-right">{props.intensity}</span>
        </div>
        {/* Extra sliders for Scrolling Text effects (122, 165) */}
        {/* WLED API mapping: c1=Trail, c2=Font Size, c3=Y Offset (0-31, 16=normal), o1=Rotate */}
        {isMatrix && isScrollingTextEffect(props.effectId) && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground w-16">Trail</label>
              <input type="range" min={0} max={255} value={props.custom1}
                onChange={(e) => props.onChange({ custom1: parseInt(e.target.value) })}
                className="flex-1 accent-cyan-400 h-2" />
              <span className="text-xs font-mono w-8 text-right">{props.custom1}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground w-16">Font Size</label>
              <input type="range" min={0} max={255} value={props.custom2}
                onChange={(e) => props.onChange({ custom2: parseInt(e.target.value) })}
                className="flex-1 accent-cyan-400 h-2" />
              <span className="text-xs font-mono w-8 text-right">{props.custom2}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground w-16">Y Offset</label>
              <input type="range" min={0} max={31} value={Math.min(props.custom3, 31)}
                onChange={(e) => props.onChange({ custom3: parseInt(e.target.value) })}
                className="flex-1 accent-cyan-400 h-2" />
              <span className="text-xs font-mono w-8 text-right">{Math.min(props.custom3, 31)}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground w-16">Rotate</label>
              <button
                onClick={() => props.onChange({ option1: !props.option1 })}
                className={`w-10 h-5 rounded-full transition-colors relative ${props.option1 ? 'bg-cyan-500' : 'bg-secondary'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${props.option1 ? 'left-5' : 'left-0.5'}`} />
              </button>
              <span className="text-xs text-muted-foreground">{props.option1 ? 'On' : 'Off'}</span>
            </div>
          </>
        )}
      </div>

      {/* v16 Particle System effects — shown when probed effects include PS entries */}
      {!isMatrix && (ps1dResolved.length > 0 || ps2dResolved.length > 0) && (
        <div className="mt-2 p-2 rounded-lg bg-purple-500/5 border border-purple-500/20">
          <p className="text-[10px] text-purple-300 mb-1 font-semibold">✨ Particle System effects detected (WLED v16+)</p>
          <p className="text-[10px] text-muted-foreground mb-1.5">
            Select one from the Effect dropdown above. PS effects are physics-based and look more organic.
            {ps1dResolved.length > 0 && ` 1D: ${ps1dResolved.map(e => e.label).join(', ')}.`}
          </p>
        </div>
      )}

      {/* Effect Playlist */}
      <EffectPlaylistEditor
        steps={props.playlist}
        effectsList={props.effectsList}
        isScrollingTextEffect={isScrollingTextEffect}
        onChange={(steps) => props.onChange({ playlist: steps })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// WledColorPicker: click-to-expand color picker with wheel + presets
// ---------------------------------------------------------------------------

function WledColorPicker(props: { color: string; onChange: (c: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={wrapRef} className={`relative ${props.disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg bg-background border border-border/50 text-sm w-full"
      >
        <span
          className="w-6 h-6 rounded-md border border-border/50 shrink-0"
          style={{ backgroundColor: props.color }}
        />
        <span className="font-mono text-xs">{props.color}</span>
      </button>

      {open && (
        <div className="absolute z-[60] mt-1 p-3 rounded-xl bg-card border border-border shadow-xl" style={{ width: 240 }}>
          <HexColorPicker color={props.color} onChange={props.onChange} style={{ width: '100%' }} />

          {/* Presets */}
          <div className="mt-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Presets</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {COLOR_PRESETS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => props.onChange(c)}
                  title={c}
                  className={`w-5 h-5 rounded-md border transition-transform hover:scale-125 ${
                    props.color.toLowerCase() === c.toLowerCase()
                      ? 'border-white ring-1 ring-white scale-110'
                      : 'border-border/40'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Manual hex input */}
          <div className="mt-2 flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Hex:</span>
            <input
              type="text"
              value={props.color}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) props.onChange(v);
              }}
              className="flex-1 px-1.5 py-0.5 rounded bg-background border border-border/50 text-xs font-mono"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EffectPlaylistEditor: build a sequence of effects that cycle on a timer
// ---------------------------------------------------------------------------

function EffectPlaylistEditor(props: {
  steps: PlaylistStep[];
  effectsList: string[];
  isScrollingTextEffect: (effectId: number) => boolean;
  onChange: (steps: PlaylistStep[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasSteps = props.steps.length > 0;

  function addStep() {
    // Find scrolling text effect ID from probed effects, or fall back to legacy 122
    const scrollTextIds = findScrollingTextIds(props.effectsList);
    const defaultEffectId = scrollTextIds.size > 0 ? [...scrollTextIds][0] : 122;
    props.onChange([...props.steps, { effectId: defaultEffectId, duration: 15, text: '{title}' }]);
  }

  function removeStep(i: number) {
    props.onChange(props.steps.filter((_, idx) => idx !== i));
  }

  function updateStep(i: number, patch: Partial<PlaylistStep>) {
    const next = [...props.steps];
    next[i] = { ...next[i], ...patch };
    props.onChange(next);
  }

  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= props.steps.length) return;
    const next = [...props.steps];
    [next[i], next[j]] = [next[j], next[i]];
    props.onChange(next);
  }

  function toggleTextStep(i: number) {
    const step = props.steps[i];
    const next = [...props.steps];
    if (step.text !== undefined) {
      // Remove text (convert to pure effect step)
      const { text: _t, ...rest } = step;
      next[i] = rest;
    } else {
      // Add text (convert to text step)
      next[i] = { ...step, text: '{title}' };
    }
    props.onChange(next);
  }

  const totalDuration = props.steps.reduce((s, p) => s + p.duration, 0);

  return (
    <div className="mt-3 rounded-lg border border-border/20 bg-background/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-secondary/30 transition-colors"
      >
        <span className="font-semibold">
          Effect Playlist
          {hasSteps && (
            <span className="ml-2 font-normal text-muted-foreground">
              ({props.steps.length} step{props.steps.length !== 1 ? 's' : ''}, {totalDuration}s cycle)
            </span>
          )}
        </span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Add steps that cycle automatically. Each step can be a scrolling text effect (set text to display)
            or a pure visual effect. Steps rotate on a timer while music plays. Leave empty to use the single-effect
            settings above.
          </p>

          {props.steps.map((step, i) => {
            const isText = step.text !== undefined;
            return (
              <div key={i} className="rounded-lg bg-secondary/30 border border-border/20 p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-muted-foreground w-5">{i + 1}.</span>

                  {/* Effect selector */}
                  <select
                    value={step.effectId}
                    onChange={(e) => updateStep(i, { effectId: parseInt(e.target.value) })}
                    className="flex-1 px-1.5 py-0.5 rounded bg-background border border-border/50 text-xs"
                  >
                    {props.effectsList.length > 0
                      ? props.effectsList.map((name, idx) => (
                          <option key={idx} value={idx}>{idx}: {name}</option>
                        ))
                      : <>
                          <option value={122}>122: Scrolling Text</option>
                          <option value={165}>165: Scrolling Text (alt)</option>
                          {AUDIO_REACTIVE_HINTS.map(o => (
                            <option key={o.id} value={o.id}>{o.id}: {o.label}</option>
                          ))}
                        </>
                    }
                  </select>

                  {/* Duration */}
                  <div className="flex items-center gap-0.5">
                    <input
                      type="number"
                      min={1} max={600}
                      value={step.duration}
                      onChange={(e) => updateStep(i, { duration: Math.max(1, parseInt(e.target.value) || 10) })}
                      className="w-12 px-1 py-0.5 rounded bg-background border border-border/50 text-xs text-center"
                    />
                    <span className="text-[10px] text-muted-foreground">s</span>
                  </div>

                  {/* Reorder + delete */}
                  <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0}
                    className="p-0.5 rounded hover:bg-secondary disabled:opacity-30" title="Move up">
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button type="button" onClick={() => moveStep(i, 1)} disabled={i === props.steps.length - 1}
                    className="p-0.5 rounded hover:bg-secondary disabled:opacity-30" title="Move down">
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <button type="button" onClick={() => removeStep(i)}
                    className="p-0.5 rounded hover:bg-red-500/20 text-red-400" title="Remove step">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {/* Text input — only for scrolling text effects */}
                {props.isScrollingTextEffect(step.effectId) && (
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-[10px] cursor-pointer select-none">
                      <input type="checkbox" checked={isText} onChange={() => toggleTextStep(i)} className="accent-primary" />
                      <span className="text-muted-foreground">Show text</span>
                    </label>
                    {isText && (
                      <input type="text" value={step.text ?? ''} onChange={(e) => updateStep(i, { text: e.target.value })}
                        placeholder="{title} - {artist}"
                        className="flex-1 px-1.5 py-0.5 rounded bg-background border border-border/50 text-xs font-mono" />
                    )}
                  </div>
                )}

                {/* Color picker (matches main section) */}
                <div className="flex items-center gap-2">
                  {step.color ? (
                    <div className="flex items-center gap-1 flex-1">
                      <span className="text-[10px] text-muted-foreground shrink-0">Color:</span>
                      <div className="flex-1 max-w-[180px]">
                        <WledColorPicker color={step.color} onChange={(c) => updateStep(i, { color: c })} />
                      </div>
                      <button type="button" onClick={() => { const { color: _c, ...rest } = step; const next = [...props.steps]; next[i] = rest; props.onChange(next); }}
                        className="text-[10px] text-red-400 hover:underline shrink-0">remove</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => updateStep(i, { color: '#ff0000' })}
                      className="text-[10px] text-primary hover:underline">+ color</button>
                  )}
                </div>

                {/* Per-step sliders */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground w-14">Speed</span>
                    <input type="range" min={0} max={255} value={step.speed ?? 128}
                      onChange={(e) => updateStep(i, { speed: parseInt(e.target.value) })}
                      className="flex-1 accent-primary h-1.5" />
                    <span className="text-[10px] font-mono w-7 text-right">{step.speed ?? 128}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground w-14">Intensity</span>
                    <input type="range" min={0} max={255} value={step.intensity ?? 128}
                      onChange={(e) => updateStep(i, { intensity: parseInt(e.target.value) })}
                      className="flex-1 accent-primary h-1.5" />
                    <span className="text-[10px] font-mono w-7 text-right">{step.intensity ?? 128}</span>
                  </div>
                  {/* Extra sliders for scrolling text effects */}
                  {/* WLED API: c1=Trail, c2=Font Size, c3=Y Offset (0-31), o1=Rotate */}
                  {props.isScrollingTextEffect(step.effectId) && (
                    <>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground w-14">Trail</span>
                        <input type="range" min={0} max={255} value={step.custom1 ?? 0}
                          onChange={(e) => updateStep(i, { custom1: parseInt(e.target.value) })}
                          className="flex-1 accent-cyan-400 h-1.5" />
                        <span className="text-[10px] font-mono w-7 text-right">{step.custom1 ?? 0}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground w-14">Font Size</span>
                        <input type="range" min={0} max={255} value={step.custom2 ?? 128}
                          onChange={(e) => updateStep(i, { custom2: parseInt(e.target.value) })}
                          className="flex-1 accent-cyan-400 h-1.5" />
                        <span className="text-[10px] font-mono w-7 text-right">{step.custom2 ?? 128}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground w-14">Y Offset</span>
                        <input type="range" min={0} max={31} value={Math.min(step.custom3 ?? 16, 31)}
                          onChange={(e) => updateStep(i, { custom3: parseInt(e.target.value) })}
                          className="flex-1 accent-cyan-400 h-1.5" />
                        <span className="text-[10px] font-mono w-7 text-right">{Math.min(step.custom3 ?? 16, 31)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground w-14">Rotate</span>
                        <button onClick={() => updateStep(i, { option1: !(step.option1 ?? false) })}
                          className={`w-8 h-4 rounded-full transition-colors relative ${step.option1 ? 'bg-cyan-500' : 'bg-secondary'}`}>
                          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${step.option1 ? 'left-4' : 'left-0.5'}`} />
                        </button>
                        <span className="text-[10px] text-muted-foreground">{step.option1 ? 'On' : 'Off'}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={addStep}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-secondary/50 hover:bg-secondary/80 transition-colors"
          >
            <Plus className="w-3 h-3" /> Add step
          </button>

          {hasSteps && (
            <button
              type="button"
              onClick={() => props.onChange([])}
              className="text-[10px] text-muted-foreground hover:text-red-400 transition-colors"
            >
              Clear all steps (revert to single effect)
            </button>
          )}
        </div>
      )}
    </div>
  );
}