"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Settings, CheckCircle2, XCircle, Loader2, AlertCircle, Database, RefreshCw, Music2, Gauge, Radio, Plus, Trash2, ChevronUp, ChevronDown, BarChart3, Zap, SlidersHorizontal, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import WledPanelsSection from './wled-panels-section';

interface SettingsViewProps {
  idleTimeout: number;
  onIdleTimeoutChange: (val: number) => void;
  eqBands: number;
  onEqBandsChange: (val: number) => void;
  eqColorScheme: string;
  onEqColorSchemeChange: (val: string) => void;
  previousTrackCount: number;
  onPreviousTrackCountChange: (val: number) => void;
  keyboardSize: 'small' | 'medium' | 'large' | 'xl' | 'xxl';
  onKeyboardSizeChange: (val: 'small' | 'medium' | 'large' | 'xl' | 'xxl') => void;
  columnLayout: string;
  onColumnLayoutChange: (val: string) => void;
  artistRows: number;
  onArtistRowsChange: (val: number) => void;
  stationRows: number;
  onStationRowsChange: (val: number) => void;
  lyricsZoom: number;
  onLyricsZoomChange: (val: number) => void;
  jukeboxTitle: string;
  onJukeboxTitleChange: (val: string) => void;
  stationQueueSize: number;
  onStationQueueSizeChange: (val: number) => void;
  eqBarHeight: number;
  onEqBarHeightChange: (val: number) => void;
  artistBioHeight: number;
  onArtistBioHeightChange: (val: number) => void;
  artistAlbumHeight: number;
  onArtistAlbumHeightChange: (val: number) => void;
  artistSimilarHeight: number;
  onArtistSimilarHeightChange: (val: number) => void;
  artistTrackWidth: number;
  onArtistTrackWidthChange: (val: number) => void;
  stationFillPct: number;
  onStationFillPctChange: (val: number) => void;
  artistFillPct: number;
  onArtistFillPctChange: (val: number) => void;
  mixFillPct: number;
  onMixFillPctChange: (val: number) => void;
  mixEditorFillPct: number;
  onMixEditorFillPctChange: (val: number) => void;
  bgStyle: string;
  onBgStyleChange: (val: any) => void;
  bgMusicReactive: boolean;
  onBgMusicReactiveChange: (val: boolean) => void;
}

function StatusBadge({ ok, label, detail }: { ok: boolean | null; label: string; detail?: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/40 border border-border/20">
      {ok === null ? (
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground flex-shrink-0" />
      ) : ok ? (
        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
      ) : (
        <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className="text-xs text-muted-foreground truncate">{detail}</p>}
      </div>
    </div>
  );
}

type PopProvider = { id: string; label: string; desc: string; requiresKey: boolean; keyName?: string };
type LyricsProvider = { id: string; label: string; desc: string; requiresKey: boolean; keyName?: string };

const POP_PROVIDERS: PopProvider[] = [
  { id: 'deezer', label: 'Deezer', desc: 'Free, no API key needed. Uses track rank (0-1M).', requiresKey: false },
  { id: 'lastfm', label: 'Last.fm', desc: 'Free with API key. Uses listener counts.', requiresKey: true, keyName: 'LASTFM_API_KEY' },
  { id: 'spotify', label: 'Spotify', desc: 'Requires Premium + API credentials.', requiresKey: true, keyName: 'SPOTIFY_CLIENT_ID' },
];

const LYRICS_PROVIDERS: LyricsProvider[] = [
  { id: 'lrclib', label: 'LRCLIB', desc: 'Free, no key. Synced + plain lyrics with timestamps.', requiresKey: false },
  { id: 'genius', label: 'Genius', desc: 'Requires access token. Plain text lyrics only.', requiresKey: true, keyName: 'GENIUS_ACCESS_TOKEN' },
];

// Dual-handle slider for 3-way column split
function TripleSlider({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef<'left' | 'right' | null>(null);

  // Parse current layout to percentages
  const parseLayout = (v: string): [number, number, number] => {
    if (v.startsWith('custom:')) {
      const parts = v.replace('custom:', '').split(',').map(Number);
      if (parts.length === 3) return parts as [number, number, number];
    }
    if (v === 'lyrics') return [25, 50, 25];
    if (v === 'art') return [40, 35, 25];
    if (v === 'compact-queue') return [42, 43, 15];
    return [30, 40, 30];
  };

  const [left, mid, right] = parseLayout(value);
  const divider1 = left; // left edge of middle section
  const divider2 = left + mid; // right edge of middle section

  const updateFromPointer = React.useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el || !draggingRef.current) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(10, Math.min(90, ((clientX - rect.left) / rect.width) * 100));
    let d1 = divider1, d2 = divider2;
    if (draggingRef.current === 'left') {
      d1 = Math.min(pct, d2 - 10);
    } else {
      d2 = Math.max(pct, d1 + 10);
    }
    const l = Math.round(d1);
    const r = Math.round(100 - d2);
    const m = 100 - l - r;
    onChange(`custom:${l},${m},${r}`);
  }, [divider1, divider2, onChange]);

  const handlePointerDown = (handle: 'left' | 'right') => (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = handle;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = React.useCallback((e: React.PointerEvent) => {
    if (draggingRef.current) updateFromPointer(e.clientX);
  }, [updateFromPointer]);

  const handlePointerUp = React.useCallback(() => {
    draggingRef.current = null;
  }, []);

  return (
    <div
      ref={trackRef}
      className="relative h-10 rounded-lg overflow-hidden cursor-pointer touch-none select-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Colored sections */}
      <div className="absolute inset-0 flex">
        <div className="h-full bg-violet-600/40 flex items-center justify-center" style={{ width: `${left}%` }}>
          <span className="text-[10px] font-mono text-white/80">Art {left}%</span>
        </div>
        <div className="h-full bg-cyan-600/40 flex items-center justify-center" style={{ width: `${mid}%` }}>
          <span className="text-[10px] font-mono text-white/80">Lyrics {mid}%</span>
        </div>
        <div className="h-full bg-amber-600/40 flex items-center justify-center" style={{ width: `${right}%` }}>
          <span className="text-[10px] font-mono text-white/80">Queue {right}%</span>
        </div>
      </div>
      {/* Drag handles */}
      <div
        className="absolute top-0 bottom-0 w-4 -ml-2 cursor-col-resize z-10 flex items-center justify-center"
        style={{ left: `${divider1}%` }}
        onPointerDown={handlePointerDown('left')}
      >
        <div className="w-1 h-6 rounded-full bg-white shadow-lg" />
      </div>
      <div
        className="absolute top-0 bottom-0 w-4 -ml-2 cursor-col-resize z-10 flex items-center justify-center"
        style={{ left: `${divider2}%` }}
        onPointerDown={handlePointerDown('right')}
      >
        <div className="w-1 h-6 rounded-full bg-white shadow-lg" />
      </div>
    </div>
  );
}

// Three-way slider for artist detail section heights (Bio / Albums / Similar)
function ArtistHeightSlider({ bio, albums, similar, onChange }: { bio: number; albums: number; similar: number; onChange: (bio: number, albums: number, similar: number) => void }) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef<'top' | 'bottom' | null>(null);

  // Normalize to 100%
  const total = bio + albums + similar;
  const nBio = Math.round((bio / total) * 100);
  const nSimilar = Math.round((similar / total) * 100);
  const nAlbums = 100 - nBio - nSimilar;

  const divider1 = nBio;
  const divider2 = nBio + nAlbums;

  const updateFromPointer = React.useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el || !draggingRef.current) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(10, Math.min(90, ((clientX - rect.left) / rect.width) * 100));
    let d1 = divider1, d2 = divider2;
    if (draggingRef.current === 'top') {
      d1 = Math.min(pct, d2 - 10);
    } else {
      d2 = Math.max(pct, d1 + 10);
    }
    const b = Math.round(d1);
    const s = Math.round(100 - d2);
    const a = 100 - b - s;
    onChange(b, a, s);
  }, [divider1, divider2, onChange]);

  const handlePointerDown = (handle: 'top' | 'bottom') => (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = handle;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = React.useCallback((e: React.PointerEvent) => {
    if (draggingRef.current) updateFromPointer(e.clientX);
  }, [updateFromPointer]);

  const handlePointerUp = React.useCallback(() => {
    draggingRef.current = null;
  }, []);

  return (
    <div
      ref={trackRef}
      className="relative h-10 rounded-lg overflow-hidden cursor-pointer touch-none select-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="absolute inset-0 flex">
        <div className="h-full bg-violet-600/40 flex items-center justify-center" style={{ width: `${nBio}%` }}>
          <span className="text-[10px] font-mono text-white/80">Bio {nBio}%</span>
        </div>
        <div className="h-full bg-cyan-600/40 flex items-center justify-center" style={{ width: `${nAlbums}%` }}>
          <span className="text-[10px] font-mono text-white/80">Albums {nAlbums}%</span>
        </div>
        <div className="h-full bg-amber-600/40 flex items-center justify-center" style={{ width: `${nSimilar}%` }}>
          <span className="text-[10px] font-mono text-white/80">Similar {nSimilar}%</span>
        </div>
      </div>
      <div
        className="absolute top-0 bottom-0 w-4 -ml-2 cursor-col-resize z-10 flex items-center justify-center"
        style={{ left: `${divider1}%` }}
        onPointerDown={handlePointerDown('top')}
      >
        <div className="w-1 h-6 rounded-full bg-white shadow-lg" />
      </div>
      <div
        className="absolute top-0 bottom-0 w-4 -ml-2 cursor-col-resize z-10 flex items-center justify-center"
        style={{ left: `${divider2}%` }}
        onPointerDown={handlePointerDown('bottom')}
      >
        <div className="w-1 h-6 rounded-full bg-white shadow-lg" />
      </div>
    </div>
  );
}

function MetadataDashboard() {
  const [metaStatus, setMetaStatus] = React.useState<any>(null);
  const [metaLoading, setMetaLoading] = React.useState(true);
  const [scanningType, setScanningType] = React.useState<string | null>(null);
  const [scrapeStatus, setScrapeStatus] = React.useState<any>(null);

  const loadStatus = React.useCallback(() => {
    setMetaLoading(true);
    Promise.all([
      fetch('/api/metadata/status').then(r => r?.json?.()).catch(() => null),
      fetch('/api/metadata/scrape').then(r => r?.json?.()).catch(() => null),
    ]).then(([meta, scrape]) => {
      setMetaStatus(meta);
      setScrapeStatus(scrape);
      setMetaLoading(false);
    });
  }, []);

  React.useEffect(() => { loadStatus(); }, [loadStatus]);

  const triggerScan = async (type: string) => {
    setScanningType(type);
    try {
      if (type === 'library') {
        // Fire-and-forget the long-running POST, then poll for progress
        fetch('/api/plex/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullSync: true }) })
          .then(async (res) => {
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              setScanningType(null);
              alert(`Sync error: ${data?.error ?? 'Unknown'}`);
            }
          })
          .catch(() => { setScanningType(null); });
        // Poll for completion
        const poll = async () => {
          for (let i = 0; i < 600; i++) {
            await new Promise(r => setTimeout(r, 1000));
            try {
              const sr = await fetch('/api/plex/sync');
              const status = await sr.json();
              if (!status?.syncInProgress) {
                loadStatus();
                setScanningType(null);
                return;
              }
            } catch { /* continue */ }
          }
          setScanningType(null);
        };
        setTimeout(poll, 500);
        return; // Don't fall through to setScanningType(null)
      } else if (type === 'popularity') {
        await fetch('/api/popularity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchSize: 50 }) });
      }
      setTimeout(loadStatus, 2000);
    } catch { /* ignore */ }
    setScanningType(null);
  };

  const metaItems = metaStatus?.metadata ? [
    { key: 'popularity', label: 'Track Popularity', ...metaStatus.metadata.popularity },
    { key: 'trackSummary', label: 'Track Summaries', ...metaStatus.metadata.trackSummary },
    { key: 'billboard', label: 'Billboard Data', ...metaStatus.metadata.billboard },
    { key: 'artistBio', label: 'Artist Bios', ...metaStatus.metadata.artistBio },
  ] : [];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
      <h3 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
        <Database className="w-5 h-5 text-accent" />
        Metadata Dashboard
      </h3>
      {metaLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading metadata status...
        </div>
      ) : metaStatus ? (
        <div className="space-y-4">
          {/* Library overview */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Tracks', value: metaStatus.library?.totalTracks ?? 0 },
              { label: 'Artists', value: metaStatus.library?.totalArtists ?? 0 },
              { label: 'Albums', value: metaStatus.library?.totalAlbums ?? 0 },
            ].map(item => (
              <div key={item.label} className="p-3 rounded-lg bg-secondary/40 border border-border/20 text-center">
                <p className="text-2xl font-bold font-display">{item.value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
          {metaStatus.library?.lastSync && (
            <p className="text-xs text-muted-foreground">
              Last sync: {new Date(metaStatus.library.lastSync).toLocaleString()}
              {metaStatus.library.syncInProgress && (
                <span className="ml-2 text-amber-400">(sync in progress)</span>
              )}
            </p>
          )}

          {/* Metadata fill rates */}
          <div className="space-y-3">
            {metaItems.map(item => (
              <div key={item.key} className="p-3 rounded-lg bg-secondary/40 border border-border/20">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.filled ?? 0} / {item.total ?? 0} ({item.pct ?? 0}%)</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${item.pct ?? 0}%`,
                      background: (item.pct ?? 0) > 70 ? '#22c55e' : (item.pct ?? 0) > 30 ? '#f59e0b' : '#ef4444',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Background scrape status */}
          {scrapeStatus?.inProgress && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-center gap-2 mb-1">
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span className="text-sm font-medium text-amber-400">Background Scrape Running</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Phase: <span className="capitalize">{scrapeStatus.phase}</span>
                {scrapeStatus.total > 0 && <> — {scrapeStatus.processed}/{scrapeStatus.total}</>}
                {scrapeStatus.current && <> — {scrapeStatus.current}</>}
              </p>
              {(scrapeStatus.phasesCompleted?.length ?? 0) > 0 && (
                <p className="text-xs text-green-400/70 mt-1">
                  ✓ Completed: {scrapeStatus.phasesCompleted.join(', ')}
                </p>
              )}
            </div>
          )}
          {!scrapeStatus?.inProgress && scrapeStatus?.phase === 'stopped' && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <p className="text-xs text-blue-400">
                Scrape stopped — all previously completed data has been saved.
                {(scrapeStatus.phasesCompleted?.length ?? 0) > 0 && (
                  <span> Completed phases: {scrapeStatus.phasesCompleted.join(', ')}.</span>
                )}
              </p>
            </div>
          )}

          {/* Scan triggers */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => triggerScan('library')}
              disabled={!!scanningType}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground active:bg-primary/80 transition-colors disabled:opacity-50"
            >
              {scanningType === 'library' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Re-sync Library
            </button>
            <button
              onClick={() => triggerScan('popularity')}
              disabled={!!scanningType}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-secondary text-secondary-foreground active:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              {scanningType === 'popularity' ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
              Refresh Popularity
            </button>
            <button
              onClick={async () => {
                if (scrapeStatus?.inProgress) {
                  await fetch('/api/metadata/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop' }) });
                } else {
                  await fetch('/api/metadata/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                }
                setTimeout(loadStatus, 1000);
              }}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors ${
                scrapeStatus?.inProgress
                  ? 'bg-red-600 text-white active:bg-red-700'
                  : 'bg-secondary text-secondary-foreground active:bg-secondary/80'
              }`}
            >
              {scrapeStatus?.inProgress ? (
                <><XCircle className="w-4 h-4" /> Stop Scrape</>
              ) : (
                <><Zap className="w-4 h-4" /> Background Scrape</>
              )}
            </button>
            <button
              onClick={loadStatus}
              disabled={metaLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-secondary text-secondary-foreground active:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" /> Refresh Status
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground p-4">Unable to load metadata status.</p>
      )}
    </motion.div>
  );
}

export default function SettingsView({
  idleTimeout, onIdleTimeoutChange,
  eqBands, onEqBandsChange,
  eqColorScheme, onEqColorSchemeChange,
  previousTrackCount, onPreviousTrackCountChange,
  keyboardSize, onKeyboardSizeChange,
  columnLayout, onColumnLayoutChange,
  artistRows, onArtistRowsChange,
  stationRows, onStationRowsChange,
  lyricsZoom, onLyricsZoomChange,
  jukeboxTitle, onJukeboxTitleChange,
  stationQueueSize, onStationQueueSizeChange,
  eqBarHeight, onEqBarHeightChange,
  artistBioHeight, onArtistBioHeightChange,
  artistAlbumHeight, onArtistAlbumHeightChange,
  artistSimilarHeight, onArtistSimilarHeightChange,
  artistTrackWidth, onArtistTrackWidthChange,
  stationFillPct, onStationFillPctChange,
  artistFillPct, onArtistFillPctChange,
  mixFillPct, onMixFillPctChange,
  mixEditorFillPct, onMixEditorFillPctChange,
  bgStyle, onBgStyleChange,
  bgMusicReactive, onBgMusicReactiveChange,
}: SettingsViewProps) {
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [resyncing, setResyncing] = useState(false);
  const [resyncProgress, setResyncProgress] = useState('');
  const [popularityRunning, setPopularityRunning] = useState(false);
  const [popularityProgress, setPopularityProgress] = useState('');
  const [bpmRunning, setBpmRunning] = useState(false);
  const [bpmProgress, setBpmProgress] = useState('');

  // Provider management state - initialized with defaults, loaded from localStorage in effect
  const [popOrder, setPopOrder] = useState<string[]>(['deezer', 'lastfm', 'spotify']);
  const [popDisabled, setPopDisabled] = useState<string[]>([]);
  const [lyricsOrder, setLyricsOrder] = useState<string[]>(['lrclib', 'genius']);
  const [lyricsDisabled, setLyricsDisabled] = useState<string[]>([]);
  const [providerConfigLoaded, setProviderConfigLoaded] = useState(false);

  // Load provider config from localStorage on mount
  useEffect(() => {
    try {
      const po = localStorage.getItem('popProviderOrder');
      if (po) { const parsed = JSON.parse(po); if (Array.isArray(parsed) && parsed.length > 0) setPopOrder(parsed); }
      const pd = localStorage.getItem('popProviderDisabled');
      if (pd) { const parsed = JSON.parse(pd); if (Array.isArray(parsed)) setPopDisabled(parsed); }
      const lo = localStorage.getItem('lyricsProviderOrder');
      if (lo) { const parsed = JSON.parse(lo); if (Array.isArray(parsed) && parsed.length > 0) setLyricsOrder(parsed); }
      const ld = localStorage.getItem('lyricsProviderDisabled');
      if (ld) { const parsed = JSON.parse(ld); if (Array.isArray(parsed)) setLyricsDisabled(parsed); }
    } catch { /* ignore */ }
    setProviderConfigLoaded(true);
  }, []);
  const [providerTests, setProviderTests] = useState<Record<string, any>>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  // Top tracks viewer state
  const [topTracks, setTopTracks] = useState<any[] | null>(null);
  const [topTracksStats, setTopTracksStats] = useState<any>(null);
  const [topTracksLoading, setTopTracksLoading] = useState(false);
  const [showTopTracks, setShowTopTracks] = useState(false);

  // Station management state
  const [stations, setStations] = useState<any[]>([]);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [newStationType, setNewStationType] = useState<'standard' | 'hits' | 'most-played'>('standard');
  const [newStationDecade, setNewStationDecade] = useState('1980s');
  const [newStationGenre, setNewStationGenre] = useState('Rock');
  const [newStationName, setNewStationName] = useState('');
  const [stationSaving, setStationSaving] = useState(false);

  // Station tuning state
  const [tuningMinPop, setTuningMinPop] = useState(40);
  const [tuningPreview, setTuningPreview] = useState<any>(null);
  const [tuningLoading, setTuningLoading] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [tuningStats, setTuningStats] = useState<any>(null);
  const tuningTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const DECADES = ['1950s','1960s','1970s','1980s','1990s','2000s','2010s','2020s'];
  const GENRES = ['Rock','Pop','Dance','Hip-Hop','R&B','Country','New Wave','Soul'];

  // Persist provider config after initial load
  useEffect(() => {
    if (!providerConfigLoaded) return;
    localStorage.setItem('popProviderOrder', JSON.stringify(popOrder));
    localStorage.setItem('popProviderDisabled', JSON.stringify(popDisabled));
    localStorage.setItem('lyricsProviderOrder', JSON.stringify(lyricsOrder));
    localStorage.setItem('lyricsProviderDisabled', JSON.stringify(lyricsDisabled));
  }, [popOrder, popDisabled, lyricsOrder, lyricsDisabled, providerConfigLoaded]);

  const moveProvider = (list: string[], setList: (v: string[]) => void, id: string, dir: 'up' | 'down') => {
    const idx = list.indexOf(id);
    if (idx < 0) return;
    const newIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= list.length) return;
    const copy = [...list];
    [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
    setList(copy);
  };

  const toggleDisabled = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  };

  const handleTestProvider = async (provider: string, type: 'popularity' | 'lyrics') => {
    setTestingProvider(provider);
    try {
      const res = await fetch('/api/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, type }),
      });
      const data = await res.json();
      setProviderTests(prev => ({ ...prev, [provider]: data }));
    } catch (e: any) {
      setProviderTests(prev => ({ ...prev, [provider]: { working: false, error: e?.message ?? 'Test failed' } }));
    }
    setTestingProvider(null);
  };

  const fetchTopTracks = async () => {
    setTopTracksLoading(true);
    try {
      const res = await fetch('/api/providers/top-tracks?limit=25');
      const data = await res.json();
      setTopTracks(data?.topTracks ?? []);
      setTopTracksStats(data?.stats ?? null);
    } catch { setTopTracks([]); }
    setTopTracksLoading(false);
  };

  const fetchStations = useCallback(async () => {
    setStationsLoading(true);
    try {
      const res = await fetch('/api/stations');
      const data = await res.json();
      setStations(data?.stations ?? []);
    } catch { setStations([]); }
    setStationsLoading(false);
  }, []);

  const fetchStationPreview = useCallback(async (minPop: number) => {
    setTuningLoading(true);
    try {
      const res = await fetch(`/api/stations/rescan?minPopularity=${minPop}`);
      const data = await res.json();
      setTuningPreview(data?.stations ?? []);
      setTuningStats(data?.stats ?? null);
    } catch { setTuningPreview(null); }
    setTuningLoading(false);
  }, []);

  const handleRescanStations = async () => {
    setRescanning(true);
    try {
      const res = await fetch('/api/stations/rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minPopularity: tuningMinPop }),
      });
      try { localStorage.setItem('hitsMinPopularity', String(tuningMinPop)); } catch { /* ignore */ }
      const data = await res.json();
      setTuningPreview(data?.stations ?? []);
      setTuningStats(data?.stats ?? null);
      fetchStations(); // refresh the main station list
    } catch { /* ignore */ }
    setRescanning(false);
  };

  // Load persisted min popularity from localStorage, then load preview on mount
  useEffect(() => {
    let initial = 40;
    try {
      const v = parseInt(localStorage.getItem('hitsMinPopularity') || '');
      if (!isNaN(v)) initial = Math.min(80, Math.max(0, v));
    } catch { /* ignore */ }
    setTuningMinPop(initial);
    fetchStationPreview(initial);
  }, []);

  const handleAddStation = async () => {
    if (stationSaving) return;
    setStationSaving(true);
    try {
      let payload: any = { stationType: newStationType };

      if (newStationType === 'most-played') {
        payload.name = newStationName.trim() || 'Most Played';
        payload.description = 'Your most played tracks, shuffled';
      } else if (newStationType === 'hits') {
        const genrePart = newStationGenre !== 'all' ? newStationGenre : null;
        const decadePart = newStationDecade !== 'all' ? newStationDecade : null;
        payload.genre = genrePart;
        payload.decade = decadePart;
        payload.name = newStationName.trim() || `${genrePart ? genrePart + ' ' : ''}${decadePart ? decadePart + ' ' : ''}Hits`.trim() || 'All the Hits';
        payload.minPopularity = 40;
      } else {
        payload.decade = newStationDecade;
        payload.genre = newStationGenre;
        payload.name = newStationName.trim() || `${newStationDecade} ${newStationGenre}`;
      }

      const res = await fetch('/api/stations/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.error) { alert(data.error); }
      else {
        setNewStationName('');
        fetchStations();
      }
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
    setStationSaving(false);
  };

  const handleRemoveStation = async (id: string) => {
    try {
      await fetch(`/api/stations/manage?id=${id}`, { method: 'DELETE' });
      fetchStations();
    } catch { /* ignore */ }
  };

  const fetchDiagnostics = () => {
    setLoading(true);
    fetch('/api/settings')
      .then(r => r?.json?.())
      .then(data => setDiagnostics(data))
      .catch(() => setDiagnostics(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDiagnostics();
    fetchStations();
  }, [fetchStations]);

  const handleResync = async () => {
    setResyncing(true);
    setResyncProgress('Starting sync...');
    try {
      // Fire the sync POST — this is a long-running operation.
      // Don't await it; instead poll GET /api/plex/sync for progress.
      fetch('/api/plex/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullSync: true }),
      }).then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setResyncProgress(`Error: ${data?.error ?? 'Sync failed'}`);
          setResyncing(false);
        }
      }).catch((err) => {
        setResyncProgress(`Error: ${err?.message ?? 'Network error'}`);
        setResyncing(false);
      });

      // Poll for progress
      const poll = async () => {
        for (let i = 0; i < 600; i++) { // max ~10 min
          await new Promise(r => setTimeout(r, 1000));
          try {
            const sr = await fetch('/api/plex/sync');
            const status = await sr.json();
            setResyncProgress(status?.syncMessage ?? 'Syncing...');
            if (!status?.syncInProgress) {
              // Done
              fetchDiagnostics();
              setResyncing(false);
              setResyncProgress(status?.syncMessage ?? 'Sync complete!');
              setTimeout(() => setResyncProgress(''), 5000);
              return;
            }
          } catch { /* continue polling */ }
        }
        setResyncing(false);
        setResyncProgress('Sync timed out');
      };
      // Start polling after a brief delay to let the POST begin
      setTimeout(poll, 500);
    } catch {
      setResyncProgress('Failed to start sync');
      setResyncing(false);
    }
  };

  const handleRunPopularity = async () => {
    setPopularityRunning(true);
    setPopularityProgress('Starting...');
    try {
      let done = false;
      let totalProcessed = 0;
      while (!done) {
        const res = await fetch('/api/popularity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchSize: 50,
            providerOrder: popOrder.filter(p => !popDisabled.includes(p)),
            disabledProviders: popDisabled,
          }),
        });
        const data = await res.json();
        if (data?.error) {
          setPopularityProgress(`Error: ${data.error}`);
          break;
        }
        totalProcessed += data?.processed ?? 0;
        done = data?.done ?? false;
        const remaining = data?.remaining ?? 0;
        setPopularityProgress(`Processed ${totalProcessed} tracks, ${remaining} remaining...`);
        if (!done) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      setPopularityProgress(`Done! ${totalProcessed} tracks checked.`);
      setTimeout(fetchDiagnostics, 1000);
    } catch (e: any) {
      setPopularityProgress(`Error: ${e?.message ?? 'Failed'}`);
    }
    setPopularityRunning(false);
  };

  const handleRunBpm = async () => {
    setBpmRunning(true);
    setBpmProgress('Starting BPM scrape...');
    try {
      let done = false;
      let totalProcessed = 0;
      while (!done) {
        const res = await fetch('/api/tracks/bpm/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchSize: 25 }),
        });
        const data = await res.json();
        if (data?.error) { setBpmProgress(`Error: ${data.error}`); break; }
        totalProcessed += data?.processed ?? 0;
        done = data?.done ?? false;
        const remaining = data?.remaining ?? 0;
        setBpmProgress(`Processed ${totalProcessed} tracks (${data?.totalWithBpm ?? 0} with BPM), ${remaining} remaining...`);
        if (!done) await new Promise(r => setTimeout(r, 300));
      }
      setBpmProgress(`Done! ${totalProcessed} tracks checked.`);
      setTimeout(fetchDiagnostics, 1000);
    } catch (e: any) {
      setBpmProgress(`Error: ${e?.message ?? 'Failed'}`);
    }
    setBpmRunning(false);
  };

  // Render a provider card for the provider management section
  function ProviderCard({ provider, type, order, disabled, onMove, onToggle }: {
    provider: PopProvider | LyricsProvider;
    type: 'popularity' | 'lyrics';
    order: string[];
    disabled: string[];
    onMove: (id: string, dir: 'up' | 'down') => void;
    onToggle: (id: string) => void;
  }) {
    const idx = order.indexOf(provider.id);
    const isDisabled = disabled.includes(provider.id);
    const test = providerTests[provider.id];
    const isTesting = testingProvider === provider.id;

    return (
      <div className={`p-3 rounded-lg border transition-colors ${isDisabled ? 'bg-secondary/20 border-border/10 opacity-60' : 'bg-secondary/40 border-border/20'}`}>
        <div className="flex items-center gap-3">
          {/* Priority arrows */}
          <div className="flex flex-col gap-0.5">
            <button onClick={() => onMove(provider.id, 'up')} disabled={idx <= 0} className="p-0.5 rounded hover:bg-background/50 disabled:opacity-20">
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onMove(provider.id, 'down')} disabled={idx >= order.length - 1} className="p-0.5 rounded hover:bg-background/50 disabled:opacity-20">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Priority number */}
          <span className="text-xs font-mono text-muted-foreground w-4 text-center">#{idx + 1}</span>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{provider.label}</p>
              {test && !isTesting && (
                test.working
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  : <XCircle className="w-3.5 h-3.5 text-red-500" />
              )}
              {test?.score !== undefined && test?.score !== null && (
                <span className="text-xs font-mono text-accent">Score: {test.score}</span>
              )}
              {test?.synced !== undefined && (
                <span className="text-xs font-mono text-accent">{test.synced ? 'Synced' : 'Plain'}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{provider.desc}</p>
            {test?.error && <p className="text-xs text-red-400 mt-0.5">{test.error}</p>}
          </div>

          {/* Actions */}
          <button
            onClick={() => handleTestProvider(provider.id, type)}
            disabled={isTesting}
            className="px-2.5 py-1.5 text-xs rounded-lg bg-background/50 hover:bg-background/80 border border-border/20 transition-colors flex items-center gap-1"
          >
            {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            Test
          </button>
          <button
            onClick={() => onToggle(provider.id)}
            className={`px-2.5 py-1.5 text-xs rounded-lg transition-colors border ${
              isDisabled
                ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
                : 'bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20'
            }`}
          >
            {isDisabled ? 'Disabled' : 'Enabled'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-[900px] mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-display font-bold tracking-tight flex items-center gap-3">
          <Settings className="w-6 h-6 text-primary" />
          Settings
        </h2>
        <p className="text-muted-foreground text-sm mt-1">Providers, diagnostics, preferences & configuration</p>
      </div>

      {/* Provider Management */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h3 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
          <Gauge className="w-5 h-5 text-accent" />
          Popularity Providers
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Providers are tried in priority order. The first provider to return a result wins.
          Use the arrows to reorder, toggle to enable/disable, and test to verify each provider.
        </p>
        <div className="space-y-2 mb-4">
          {popOrder.map(pid => {
            const prov = POP_PROVIDERS.find(p => p.id === pid);
            if (!prov) return null;
            return (
              <ProviderCard
                key={prov.id}
                provider={prov}
                type="popularity"
                order={popOrder}
                disabled={popDisabled}
                onMove={(id, dir) => moveProvider(popOrder, setPopOrder, id, dir)}
                onToggle={(id) => toggleDisabled(popDisabled, setPopDisabled, id)}
              />
            );
          })}
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleRunPopularity}
            disabled={popularityRunning}
            className="px-4 py-2 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1"
          >
            {popularityRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Gauge className="w-3 h-3" />}
            Run Popularity Check
          </button>
          <button
            onClick={async () => {
              if (!confirm('Reset all popularity data? This lets you re-run with different providers/priority.')) return;
              try { await fetch('/api/popularity', { method: 'DELETE' }); fetchDiagnostics(); } catch { /* ignore */ }
            }}
            className="px-4 py-2 text-xs rounded-lg bg-secondary hover:bg-secondary/80 transition-colors flex items-center gap-1 text-amber-400"
          >
            <RefreshCw className="w-3 h-3" />
            Reset Popularity Data
          </button>
          <button
            onClick={() => { setShowTopTracks(!showTopTracks); if (!showTopTracks && !topTracks) fetchTopTracks(); }}
            className="px-4 py-2 text-xs rounded-lg bg-secondary hover:bg-secondary/80 transition-colors flex items-center gap-1"
          >
            <BarChart3 className="w-3 h-3" />
            {showTopTracks ? 'Hide' : 'View'} Top Tracks
          </button>
        </div>
        {popularityProgress && (
          <p className="text-xs text-muted-foreground mt-2">{popularityProgress}</p>
        )}

        {/* Top Tracks Viewer */}
        {showTopTracks && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4">
            <div className="p-4 rounded-lg bg-background/50 border border-border/20">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-accent" />
                  Top Tracks by Popularity
                </h4>
                <button onClick={fetchTopTracks} disabled={topTracksLoading} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <RefreshCw className={`w-3 h-3 ${topTracksLoading ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>

              {/* Distribution stats */}
              {topTracksStats && (
                <div className="grid grid-cols-5 gap-2 mb-3">
                  {[
                    { label: 'Total', value: topTracksStats.totalTracks, color: '' },
                    { label: 'High (70+)', value: topTracksStats.distribution?.high ?? 0, color: 'text-green-400' },
                    { label: 'Med (40-69)', value: topTracksStats.distribution?.medium ?? 0, color: 'text-yellow-400' },
                    { label: 'Low (1-39)', value: topTracksStats.distribution?.low ?? 0, color: 'text-orange-400' },
                    { label: 'Unchecked', value: topTracksStats.unchecked ?? 0, color: 'text-muted-foreground' },
                  ].map(s => (
                    <div key={s.label} className="text-center p-2 rounded-lg bg-secondary/30">
                      <p className={`text-lg font-bold font-mono ${s.color}`}>{(s.value ?? 0).toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {topTracksLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : !topTracks || topTracks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No popularity data yet. Run a popularity check first.</p>
              ) : (
                <div className="max-h-[300px] overflow-y-auto space-y-1">
                  {topTracks.map((t: any, i: number) => (
                    <div key={t.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/30 transition-colors">
                      <span className="text-xs font-mono text-muted-foreground w-6 text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{t.artistName}</p>
                      </div>
                      {t.genre && <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-secondary/50">{t.genre}</span>}
                      {t.year && <span className="text-[10px] text-muted-foreground font-mono">{t.year}</span>}
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-2 rounded-full bg-secondary/60 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              (t.popularity ?? 0) >= 70 ? 'bg-green-500' : (t.popularity ?? 0) >= 40 ? 'bg-yellow-500' : 'bg-orange-500'
                            }`}
                            style={{ width: `${t.popularity ?? 0}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono font-bold w-7 text-right">{t.popularity ?? 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* BPM Data */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }} className="mb-8">
        <h3 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
          <Gauge className="w-5 h-5 text-accent" />
          BPM Data (Party Beats)
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Pre-populate BPM data from Deezer so Party Beats mode can sort tracks by tempo instantly. Without this, BPM is looked up one track at a time during playback.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleRunBpm}
            disabled={bpmRunning}
            className="px-4 py-2 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1"
          >
            {bpmRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Gauge className="w-3 h-3" />}
            Run BPM Scrape
          </button>
        </div>
        {bpmProgress && (
          <p className="text-xs text-muted-foreground mt-2">{bpmProgress}</p>
        )}
      </motion.div>

      {/* Lyrics Providers */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-8">
        <h3 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
          <Music2 className="w-5 h-5 text-accent" />
          Lyrics Providers
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          LRCLIB provides synced timestamps. Genius provides plain text. Priority determines which is tried first.
        </p>
        <div className="space-y-2">
          {lyricsOrder.map(pid => {
            const prov = LYRICS_PROVIDERS.find(p => p.id === pid);
            if (!prov) return null;
            return (
              <ProviderCard
                key={prov.id}
                provider={prov}
                type="lyrics"
                order={lyricsOrder}
                disabled={lyricsDisabled}
                onMove={(id, dir) => moveProvider(lyricsOrder, setLyricsOrder, id, dir)}
                onToggle={(id) => toggleDisabled(lyricsDisabled, setLyricsDisabled, id)}
              />
            );
          })}
        </div>
      </motion.div>

      {/* System Diagnostics */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
        <h3 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-accent" />
          System Diagnostics
          <button onClick={fetchDiagnostics} className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <StatusBadge
            ok={diagnostics ? diagnostics.plex?.configured : null}
            label={`${
              diagnostics?.plex?.serverType === 'jellyfin'
                ? 'Jellyfin'
                : diagnostics?.plex?.serverType === 'subsonic'
                ? 'Navidrome / Subsonic'
                : 'Plex'
            } Connection`}
            detail={diagnostics?.plex?.serverUrl ?? 'Checking...'}
          />
          <StatusBadge
            ok={diagnostics ? (diagnostics.library?.tracks > 0) : null}
            label="Library Cache"
            detail={diagnostics?.library ? `${diagnostics.library.artists} artists, ${diagnostics.library.albums} albums, ${diagnostics.library.tracks} tracks` : 'Checking...'}
          />
        </div>

        <div className="flex gap-2 mt-3 flex-wrap items-center">
          <button
            onClick={handleResync}
            disabled={resyncing}
            className="px-4 py-2 text-xs rounded-lg bg-secondary hover:bg-secondary/80 transition-colors flex items-center gap-1"
          >
            {resyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Resync Library
          </button>
          {resyncProgress && (
            <span className={`text-xs ${resyncProgress.startsWith('Error') ? 'text-red-400' : 'text-muted-foreground'}`}>
              {resyncProgress}
            </span>
          )}
        </div>
      </motion.div>

      {/* Library Stats */}
      {diagnostics?.library && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mb-8">
          <h3 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
            <Database className="w-5 h-5 text-accent" />
            Library Stats
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Artists', value: diagnostics.library.artists },
              { label: 'Albums', value: diagnostics.library.albums },
              { label: 'Tracks', value: diagnostics.library.tracks },
              { label: 'Stations', value: diagnostics.library.stations },
            ].map((stat) => (
              <div key={stat.label} className="p-3 rounded-lg bg-secondary/40 border border-border/20 text-center">
                <p className="text-2xl font-bold font-display">{stat.value?.toLocaleString?.() ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Display Settings */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-8">
        <h3 className="text-lg font-display font-semibold mb-3">Display & Behavior</h3>
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-secondary/40 border border-border/20">
            <label className="text-sm font-medium">Jukebox Title</label>
            <p className="text-xs text-muted-foreground mb-2">Customize the title shown in the header</p>
            <input
              type="text"
              value={jukeboxTitle}
              onChange={(e) => onJukeboxTitleChange(e.target.value)}
              placeholder="Plex Jukebox"
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
            />
          </div>

          <div className="p-4 rounded-lg bg-secondary/40 border border-border/20">
            <label className="text-sm font-medium">Auto-switch to Now Playing</label>
            <p className="text-xs text-muted-foreground mb-2">Automatically show Now Playing after idle</p>
            <div className="flex items-center gap-3">
              <input type="range" min="0" max="120" step="5" value={idleTimeout} onChange={(e) => onIdleTimeoutChange(parseInt(e.target.value))} className="flex-1 h-2 accent-primary" />
              <span className="text-sm font-mono w-16 text-right">{idleTimeout === 0 ? 'Off' : `${idleTimeout}s`}</span>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-secondary/40 border border-border/20">
            <label className="text-sm font-medium">Now Playing Layout</label>
            <p className="text-xs text-muted-foreground mb-2">Column size distribution (Art / Lyrics / Queue)</p>
            <div className="flex gap-2 mt-2 flex-wrap">
              {[
                { id: 'balanced', label: 'Balanced', desc: '30 / 40 / 30' },
                { id: 'lyrics', label: 'Lyrics Focus', desc: '25 / 50 / 25' },
                { id: 'art', label: 'Art Focus', desc: '40 / 35 / 25' },
                { id: 'compact-queue', label: 'Compact Queue', desc: '42 / 43 / 15' },
              ].map((layout) => (
                <button key={layout.id} onClick={() => onColumnLayoutChange(layout.id)} className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${columnLayout === layout.id || (columnLayout.startsWith('custom:') && layout.id === 'custom') ? 'bg-primary text-primary-foreground ring-2 ring-primary/50' : 'bg-secondary hover:bg-secondary/80'}`}>
                  {layout.label}<p className="text-[10px] opacity-70 mt-0.5">{layout.desc}</p>
                </button>
              ))}
            </div>
            {/* Custom slider - dual handle visualization */}
            <div className="mt-3">
              <p className="text-xs text-muted-foreground mb-2">Custom: drag to adjust proportions</p>
              <TripleSlider value={columnLayout} onChange={onColumnLayoutChange} />
            </div>
          </div>

          <div className="p-4 rounded-lg bg-secondary/40 border border-border/20">
            <label className="text-sm font-medium">Lyrics Text Size</label>
            <p className="text-xs text-muted-foreground mb-2">Zoom level for lyrics display</p>
            <div className="flex items-center gap-3">
              <input type="range" min="1" max="5" step="1" value={lyricsZoom} onChange={(e) => onLyricsZoomChange(parseInt(e.target.value))} className="flex-1 h-2 accent-primary" />
              <span className="text-sm font-mono w-16 text-right">{lyricsZoom === 1 ? 'Tiny' : lyricsZoom === 2 ? 'Small' : lyricsZoom === 3 ? 'Medium' : lyricsZoom === 4 ? 'Large' : 'Huge'}</span>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-secondary/40 border border-border/20">
            <label className="text-sm font-medium">Artist Grid Rows</label>
            <div className="flex items-center gap-3">
              <input type="range" min="1" max="6" step="1" value={artistRows} onChange={(e) => onArtistRowsChange(parseInt(e.target.value))} className="flex-1 h-2 accent-primary" />
              <span className="text-sm font-mono w-10 text-right">{artistRows}</span>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-secondary/40 border border-border/20">
            <label className="text-sm font-medium">Station Grid Rows</label>
            <div className="flex items-center gap-3">
              <input type="range" min="1" max="4" step="1" value={stationRows} onChange={(e) => onStationRowsChange(parseInt(e.target.value))} className="flex-1 h-2 accent-primary" />
              <span className="text-sm font-mono w-10 text-right">{stationRows}</span>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-secondary/40 border border-border/20">
            <label className="text-sm font-medium">Previous Tracks in Queue</label>
            <div className="flex items-center gap-3">
              <input type="range" min="0" max="20" step="1" value={previousTrackCount} onChange={(e) => onPreviousTrackCountChange(parseInt(e.target.value))} className="flex-1 h-2 accent-primary" />
              <span className="text-sm font-mono w-10 text-right">{previousTrackCount}</span>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-secondary/40 border border-border/20">
            <label className="text-sm font-medium">Station Queue Size</label>
            <p className="text-xs text-muted-foreground mb-2">How many upcoming songs to keep queued when playing a station</p>
            <div className="flex items-center gap-3">
              <input type="range" min="2" max="30" step="1" value={stationQueueSize} onChange={(e) => onStationQueueSizeChange(parseInt(e.target.value))} className="flex-1 h-2 accent-primary" />
              <span className="text-sm font-mono w-10 text-right">{stationQueueSize}</span>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-secondary/40 border border-border/20">
            <label className="text-sm font-medium">Cover Art Fill %</label>
            <p className="text-xs text-muted-foreground mb-2">How much of the available height each page&apos;s artwork fills</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-16">Stations</span>
                <input type="range" min="40" max="100" step="5" value={stationFillPct} onChange={(e) => onStationFillPctChange(parseInt(e.target.value))} className="flex-1 h-2 accent-primary" />
                <span className="text-sm font-mono w-12 text-right">{stationFillPct}%</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-16">Artists</span>
                <input type="range" min="40" max="100" step="5" value={artistFillPct} onChange={(e) => onArtistFillPctChange(parseInt(e.target.value))} className="flex-1 h-2 accent-primary" />
                <span className="text-sm font-mono w-12 text-right">{artistFillPct}%</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-16">Mixes</span>
                <input type="range" min="40" max="100" step="5" value={mixFillPct} onChange={(e) => onMixFillPctChange(parseInt(e.target.value))} className="flex-1 h-2 accent-primary" />
                <span className="text-sm font-mono w-12 text-right">{mixFillPct}%</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-16">Mix Editor</span>
                <input type="range" min="40" max="100" step="5" value={mixEditorFillPct} onChange={(e) => onMixEditorFillPctChange(parseInt(e.target.value))} className="flex-1 h-2 accent-primary" />
                <span className="text-sm font-mono w-12 text-right">{mixEditorFillPct}%</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-secondary/40 border border-border/20">
            <label className="text-sm font-medium">Equalizer Bands</label>
            <div className="flex items-center gap-3">
              <input type="range" min="8" max="64" step="4" value={eqBands} onChange={(e) => onEqBandsChange(parseInt(e.target.value))} className="flex-1 h-2 accent-primary" />
              <span className="text-sm font-mono w-10 text-right">{eqBands}</span>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-secondary/40 border border-border/20">
            <label className="text-sm font-medium">Equalizer Colors</label>
            <div className="flex gap-2 mt-2">
              {[
                { id: 'classic', label: 'Classic', colors: 'from-green-500 via-yellow-500 to-red-500' },
                { id: 'purple', label: 'Purple', colors: 'from-violet-600 via-purple-500 to-pink-500' },
                { id: 'cyan', label: 'Cyan', colors: 'from-sky-500 via-cyan-500 to-pink-500' },
              ].map((scheme) => (
                <button key={scheme.id} onClick={() => onEqColorSchemeChange(scheme.id)} className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${eqColorScheme === scheme.id ? 'bg-primary text-primary-foreground ring-2 ring-primary/50' : 'bg-secondary hover:bg-secondary/80'}`}>
                  <div className={`w-12 h-2 rounded-full bg-gradient-to-r ${scheme.colors} mb-1`} />{scheme.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-lg bg-secondary/40 border border-border/20">
            <label className="text-sm font-medium">EQ Bar Height</label>
            <p className="text-xs text-muted-foreground mb-2">Height of the LED equalizer in the player bar</p>
            <div className="flex items-center gap-3">
              <input type="range" min="24" max="200" step="4" value={eqBarHeight} onChange={(e) => onEqBarHeightChange(parseInt(e.target.value))} className="flex-1 h-2 accent-primary" />
              <span className="text-sm font-mono w-16 text-right">{eqBarHeight}px</span>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-secondary/40 border border-border/20">
            <label className="text-sm font-medium">Touch Keyboard Size</label>
            <div className="flex gap-2 mt-2">
              {(['small', 'medium', 'large', 'xl', 'xxl'] as const).map((sz) => (
                <button key={sz} onClick={() => onKeyboardSizeChange(sz)} className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${keyboardSize === sz ? 'bg-primary text-primary-foreground ring-2 ring-primary/50' : 'bg-secondary hover:bg-secondary/80'}`}>
                  {sz.charAt(0).toUpperCase() + sz.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Artist Detail Layout */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.19 }} className="mb-8">
        <h3 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
          <SlidersHorizontal className="w-5 h-5 text-accent" />
          Artist Detail Layout
        </h3>
        <div className="space-y-3">
          <div className="p-4 rounded-lg bg-secondary/40 border border-border/20">
            <label className="text-sm font-medium">Section Heights</label>
            <p className="text-xs text-muted-foreground mb-2">Drag handles to adjust Bio / Albums / Similar sections (must total 100%)</p>
            <ArtistHeightSlider
              bio={artistBioHeight}
              albums={artistAlbumHeight}
              similar={artistSimilarHeight}
              onChange={(bio, albums, similar) => {
                onArtistBioHeightChange(bio);
                onArtistAlbumHeightChange(albums);
                onArtistSimilarHeightChange(similar);
              }}
            />
          </div>
          <div className="p-4 rounded-lg bg-secondary/40 border border-border/20">
            <label className="text-sm font-medium">Track List Width</label>
            <p className="text-xs text-muted-foreground mb-2">Percentage of page width for track listing</p>
            <div className="flex items-center gap-3">
              <input type="range" min="25" max="60" step="5" value={artistTrackWidth} onChange={(e) => onArtistTrackWidthChange(parseInt(e.target.value))} className="flex-1 h-2 accent-primary" />
              <span className="text-sm font-mono w-16 text-right">{artistTrackWidth}%</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Animated Background */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.21 }} className="mb-8">
        <h3 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" />
          Animated Background
        </h3>
        <div className="grid gap-3">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {([
              { value: 'none', label: 'None', emoji: '⬛' },
              { value: 'aurora', label: 'Aurora', emoji: '🌌' },
              { value: 'particles', label: 'Particles', emoji: '✨' },
              { value: 'waves', label: 'Waves', emoji: '🌊' },
              { value: 'nebula', label: 'Nebula', emoji: '🟣' },
              { value: 'gradient-flow', label: 'Gradient', emoji: '🎨' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => onBgStyleChange(opt.value)}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${
                  bgStyle === opt.value
                    ? 'border-accent bg-accent/20 ring-1 ring-accent'
                    : 'border-border/30 bg-secondary/30 hover:bg-secondary/50'
                }`}
              >
                <span className="text-xl">{opt.emoji}</span>
                <span className="text-xs font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
          {bgStyle !== 'none' && (
            <label className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/20 cursor-pointer">
              <input
                type="checkbox"
                checked={bgMusicReactive}
                onChange={e => onBgMusicReactiveChange(e.target.checked)}
                className="w-4 h-4 rounded accent-accent"
              />
              <div>
                <span className="text-sm font-medium">Music Reactive</span>
                <p className="text-xs text-muted-foreground">Background responds to audio energy</p>
              </div>
            </label>
          )}
        </div>
      </motion.div>

      {/* Station Tuning */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className="mb-8">
        <h3 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
          <SlidersHorizontal className="w-5 h-5 text-accent" />
          Station Tuning
        </h3>

        {/* Stats bar */}
        {tuningStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="p-2 rounded-lg bg-secondary/40 border border-border/20 text-center">
              <p className="text-lg font-bold text-primary">{tuningStats.totalTracks?.toLocaleString?.()}</p>
              <p className="text-[10px] text-muted-foreground">Total Tracks</p>
            </div>
            <div className="p-2 rounded-lg bg-secondary/40 border border-border/20 text-center">
              <p className="text-lg font-bold text-primary">{tuningStats.withGenre?.toLocaleString?.()}</p>
              <p className="text-[10px] text-muted-foreground">Have Genre</p>
            </div>
            <div className="p-2 rounded-lg bg-secondary/40 border border-border/20 text-center">
              <p className="text-lg font-bold text-primary">{tuningStats.withYear?.toLocaleString?.()}</p>
              <p className="text-[10px] text-muted-foreground">Have Year</p>
            </div>
            <div className="p-2 rounded-lg bg-secondary/40 border border-border/20 text-center">
              <p className="text-lg font-bold text-primary">{tuningStats.withPopularity?.toLocaleString?.()}</p>
              <p className="text-[10px] text-muted-foreground">Have Popularity</p>
            </div>
          </div>
        )}

        {/* Min popularity slider for hits stations */}
        <div className="p-4 rounded-lg bg-secondary/40 border border-border/20 mb-3">
          <label className="text-sm font-medium">Hits Station Min Popularity</label>
          <p className="text-xs text-muted-foreground mb-2">Lower this value to include more tracks in Hits stations. Standard stations (decade+genre) are not affected by this.</p>
          <div className="flex items-center gap-3">
            <input
              type="range" min="0" max="80" step="5" value={tuningMinPop}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setTuningMinPop(val);
                try { localStorage.setItem('hitsMinPopularity', String(val)); } catch { /* ignore */ }
                if (tuningTimerRef.current) clearTimeout(tuningTimerRef.current);
                tuningTimerRef.current = setTimeout(() => fetchStationPreview(val), 400);
              }}
              className="flex-1 h-2 accent-primary"
            />
            <span className="text-sm font-mono w-10 text-right">{tuningMinPop}</span>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleRescanStations}
              disabled={rescanning}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm flex items-center gap-2"
            >
              {rescanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Apply &amp; Rescan Stations
            </button>
            <p className="text-xs text-muted-foreground">Updates all station track counts and saves the new min popularity for Hits stations.</p>
          </div>
        </div>

        {/* Real-time preview of station track counts */}
        <div className="p-4 rounded-lg bg-secondary/40 border border-border/20">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium">
              Station Track Counts
              {tuningLoading && <Loader2 className="w-3 h-3 animate-spin inline ml-2" />}
            </label>
            <button onClick={() => fetchStationPreview(tuningMinPop)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
          {tuningPreview && tuningPreview.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-[300px] overflow-y-auto">
              {(tuningPreview as any[])
                .sort((a: any, b: any) => (b.trackCount ?? 0) - (a.trackCount ?? 0))
                .map((s: any) => (
                <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-background/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{s.name}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-20 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${s.trackCount > 50 ? 'bg-green-500' : s.trackCount > 10 ? 'bg-yellow-500' : s.trackCount > 0 ? 'bg-orange-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(100, (s.trackCount / Math.max(1, ...(tuningPreview as any[]).map((x: any) => x.trackCount ?? 0))) * 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-mono w-12 text-right ${s.trackCount === 0 ? 'text-red-400' : s.trackCount < 10 ? 'text-orange-400' : 'text-foreground'}`}>
                      {s.trackCount?.toLocaleString?.() ?? 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : tuningPreview && tuningPreview.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No stations found. Add stations below.</p>
          ) : null}
        </div>
      </motion.div>

      {/* Station Management */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mb-8">
        <h3 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
          <Radio className="w-5 h-5 text-accent" />
          Station Management
        </h3>

        <div className="p-4 rounded-lg bg-secondary/40 border border-border/20 mb-3">
          <label className="text-sm font-medium">Add Station</label>
          <div className="flex gap-2 mb-3 mt-2">
            {[
              { id: 'standard' as const, label: 'Standard', desc: 'Decade + Genre' },
              { id: 'hits' as const, label: 'Hits', desc: 'Top tracks across eras' },
              { id: 'most-played' as const, label: 'Most Played', desc: 'Your favorites' },
            ].map((t) => (
              <button key={t.id} onClick={() => setNewStationType(t.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${newStationType === t.id ? 'bg-primary text-primary-foreground ring-2 ring-primary/50' : 'bg-secondary hover:bg-secondary/80'}`}>
                {t.label}<p className="text-[10px] opacity-70 mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>

          <div className="flex items-end gap-2 flex-wrap">
            {newStationType !== 'most-played' && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Decade</label>
                  <select value={newStationDecade} onChange={(e) => setNewStationDecade(e.target.value)} className="px-3 py-2 rounded-lg bg-background border border-border text-sm">
                    {newStationType === 'hits' && <option value="all">All Decades</option>}
                    {DECADES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Genre</label>
                  <select value={newStationGenre} onChange={(e) => setNewStationGenre(e.target.value)} className="px-3 py-2 rounded-lg bg-background border border-border text-sm">
                    {newStationType === 'hits' && <option value="all">All Genres</option>}
                    {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </>
            )}
            <div className="flex-1 min-w-[150px]">
              <label className="text-xs text-muted-foreground block mb-1">Custom Name (optional)</label>
              <input type="text" value={newStationName} onChange={(e) => setNewStationName(e.target.value)}
                placeholder={newStationType === 'most-played' ? 'Most Played' : newStationType === 'hits' ? `${newStationGenre !== 'all' ? newStationGenre + ' ' : ''}Hits` : `${newStationDecade} ${newStationGenre}`}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
              />
            </div>
            <button onClick={handleAddStation} disabled={stationSaving} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm flex items-center gap-1">
              {stationSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
            </button>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-secondary/40 border border-border/20">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium">Active Stations ({stations.length})</label>
            <button onClick={fetchStations} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <RefreshCw className={`w-3 h-3 ${stationsLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
          {stationsLoading ? (
            <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : stations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No active stations. Add one above.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
              {stations.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg bg-background/50 border border-border/10 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {s.stationType === 'hits' ? 'Hits' : s.stationType === 'most-played' ? 'Most Played' : `${s.decade ?? ''} ${s.genre ?? ''}`.trim()}
                      {' '}<span className={`${(s.trackCount ?? 0) === 0 ? 'text-red-400' : 'text-muted-foreground'}`}>({s.trackCount ?? 0} tracks)</span>
                    </p>
                  </div>
                  <button onClick={() => handleRemoveStation(s.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100" title="Remove station">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* Metadata Dashboard */}
      <MetadataDashboard />

      {/* WLED Panels */}
      <WledPanelsSection />

      {/* Media Server Config */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <h3 className="text-lg font-display font-semibold mb-3">Media Server Configuration</h3>
        <MediaServerCredentialsPanel
          serverType={diagnostics?.plex?.serverType}
          serverUrl={diagnostics?.plex?.serverUrl}
        />
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MediaServerCredentialsPanel: inline token / URL updater that preserves
// libraryId and all cached artist / album / track metadata. Uses the PATCH
// endpoint on /api/plex/config instead of POST so we don't wipe the library
// selection when the user just needs to refresh a stale token.
// ---------------------------------------------------------------------------

function MediaServerCredentialsPanel(props: { serverType?: string; serverUrl?: string }) {
  const serverType = props.serverType ?? 'plex';
  const serverLabel =
    serverType === 'jellyfin' ? 'Jellyfin' :
    serverType === 'subsonic' ? 'Navidrome / Subsonic' : 'Plex';
  const needsUsername = serverType === 'subsonic';

  const [showEdit, setShowEdit] = React.useState(false);
  const [serverUrl, setServerUrl] = React.useState(props.serverUrl ?? '');
  const [token, setToken] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<{ kind: 'idle' | 'ok' | 'error'; message?: string }>({ kind: 'idle' });

  React.useEffect(() => {
    if (props.serverUrl && !serverUrl) setServerUrl(props.serverUrl);
  }, [props.serverUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!token.trim() && serverUrl === (props.serverUrl ?? '')) {
      setStatus({ kind: 'error', message: 'Enter a new token or a new server URL.' });
      return;
    }
    setSaving(true);
    setStatus({ kind: 'idle' });
    try {
      const body: Record<string, any> = {};
      if (serverUrl.trim() && serverUrl.trim() !== (props.serverUrl ?? '')) body.serverUrl = serverUrl.trim();
      if (token.trim()) body.token = token.trim();
      if (needsUsername && username.trim()) body.username = username.trim();

      const res = await fetch('/api/plex/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ kind: 'error', message: data?.error ?? 'Failed to update credentials' });
      } else {
        setStatus({
          kind: 'ok',
          message: 'Credentials updated. Your library and cached metadata are preserved.',
        });
        setToken('');
        setUsername('');
      }
    } catch (e: any) {
      setStatus({ kind: 'error', message: e?.message ?? 'Network error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 rounded-lg bg-secondary/40 border border-border/20">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div>
          <p className="text-sm">
            Connected to <strong>{serverLabel}</strong>
            {props.serverUrl && <span className="text-muted-foreground"> at {props.serverUrl}</span>}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            If your token expired or the server URL changed, update below - your library and cached metadata stay intact.
          </p>
        </div>
        <button
          onClick={() => setShowEdit(s => !s)}
          className="px-3 py-1.5 text-xs rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          {showEdit ? 'Cancel' : 'Update credentials'}
        </button>
      </div>

      {showEdit && (
        <div className="mt-3 space-y-2 border-t border-border/20 pt-3">
          <label className="flex flex-col text-xs">
            <span className="text-muted-foreground mb-1">Server URL</span>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder={props.serverUrl || 'http://192.168.1.100:32400'}
              className="px-3 py-2 rounded-lg bg-background border border-border/50 text-sm font-mono"
            />
          </label>

          {needsUsername && (
            <label className="flex flex-col text-xs">
              <span className="text-muted-foreground mb-1">Username</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="leave blank to keep current"
                className="px-3 py-2 rounded-lg bg-background border border-border/50 text-sm"
              />
            </label>
          )}

          <label className="flex flex-col text-xs">
            <span className="text-muted-foreground mb-1">
              {serverType === 'subsonic' ? 'Password' : 'Token'}
            </span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={serverType === 'subsonic' ? 'Enter new password' : 'Enter new token'}
              className="px-3 py-2 rounded-lg bg-background border border-border/50 text-sm font-mono"
            />
          </label>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Testing & saving...' : 'Save & test connection'}
            </button>
            {status.kind === 'ok' && (
              <span className="text-xs text-green-400">{status.message}</span>
            )}
            {status.kind === 'error' && (
              <span className="text-xs text-red-400">{status.message}</span>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-border/20 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Need to switch backends, or pick a different library? Re-run the setup wizard (this will reset library selection).
        </p>
        <button
          onClick={() => { window.location.href = '/setup'; }}
          className="px-3 py-1.5 text-xs rounded-lg bg-background border border-border/50 hover:bg-secondary/60 transition-colors"
        >
          Open Setup Wizard
        </button>
      </div>
    </div>
  );
}
