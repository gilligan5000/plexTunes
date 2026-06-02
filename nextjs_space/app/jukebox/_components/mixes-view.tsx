"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Disc3, Play, Loader2, Music2, Plus, Pencil, Trash2, X, Save, Check, Radio, Users, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { usePlayer, TrackInfo } from '@/lib/player-context';
import type { ViewType } from './jukebox-shell';
import { toast } from 'sonner';
import PlexImage from './plex-image';

interface MixesViewProps {
  onNavigate: (view: ViewType, opts?: any) => void;
  stationQueueSize?: number;
  stationRows?: number;
  fillPct?: number;
  artistFillPct?: number;
  artistRows?: number;
  mixEditorFillPct?: number;
}

/* ── Mix Card (matches station card styling) ── */
function MixCard({ mix, onPlay, onEdit, onDelete, isPlaying, cardSize, stationNames, artistThumbs, stationArtMap }: {
  mix: any; onPlay: () => void; onEdit: () => void; onDelete: () => void;
  isPlaying: boolean; cardSize: number; stationNames: Record<string, string>;
  artistThumbs: Record<string, string | null>;
  stationArtMap: Record<string, string[]>;
}) {
  const labelSize = cardSize > 400 ? 'text-2xl' : cardSize > 300 ? 'text-xl' : cardSize > 250 ? 'text-lg' : 'text-base';
  const subSize = cardSize > 400 ? 'text-base' : cardSize > 300 ? 'text-sm' : 'text-xs';
  const stationCount = mix?.stationIds?.length ?? 0;
  const artistCount = mix?.artistIds?.length ?? 0;

  // Build a sample art array from artist thumbs, fall back to station art
  let sampleArt = (mix?.artistIds ?? []).map((id: string) => artistThumbs[id]).filter(Boolean);
  if (sampleArt.length === 0 && stationCount > 0) {
    const stationArts: string[] = [];
    (mix.stationIds ?? []).forEach((sid: string) => {
      (stationArtMap[sid] ?? []).forEach((url: string) => {
        if (!stationArts.includes(url)) stationArts.push(url);
      });
    });
    sampleArt = stationArts;
  }
  const useGrid3 = sampleArt.length >= 9;
  const useGrid2 = sampleArt.length >= 4;
  const gridCols = useGrid3 ? 3 : 2;
  const gridCount = useGrid3 ? 9 : 4;
  const imgSize = Math.round(cardSize / gridCols);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex-shrink-0 group relative"
      style={{ width: cardSize, height: cardSize }}
    >
      <button onClick={onPlay} disabled={isPlaying} className="w-full h-full text-left">
        <div className="relative w-full h-full rounded-xl overflow-hidden bg-gradient-to-br from-violet-900/60 to-indigo-950/50">
          {useGrid2 ? (
            <div className="w-full h-full" style={{ display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gridTemplateRows: `repeat(${gridCols}, 1fr)` }}>
              {sampleArt.slice(0, gridCount).map((thumb: string, i: number) => (
                <div key={i} className="w-full h-full overflow-hidden">
                  <PlexImage thumb={thumb} alt="" size={imgSize} />
                </div>
              ))}
            </div>
          ) : sampleArt.length >= 1 ? (
            <div className="w-full h-full">
              <PlexImage thumb={sampleArt[0]} alt="" size={Math.round(cardSize * 2)} />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Disc3 className="w-16 h-16 text-white/20" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-[clamp(3rem,8%,5rem)] h-[clamp(3rem,8%,5rem)] rounded-full bg-primary/90 flex items-center justify-center shadow-lg backdrop-blur-sm">
              {isPlaying ? <Loader2 className="w-[40%] h-[40%] animate-spin text-primary-foreground" /> : <Play className="w-[40%] h-[40%] text-primary-foreground ml-0.5" />}
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h4 className={`font-display font-bold ${labelSize} text-white leading-tight`}>{mix?.name ?? 'Mix'}</h4>
            <p className={`${subSize} text-white/60 mt-0.5`}>
              {stationCount > 0 && `${stationCount} station${stationCount > 1 ? 's' : ''}`}
              {stationCount > 0 && artistCount > 0 && ' · '}
              {artistCount > 0 && `${artistCount} artist${artistCount > 1 ? 's' : ''}`}
              {stationCount === 0 && artistCount === 0 && 'Empty mix'}
            </p>
          </div>
        </div>
      </button>
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1.5 rounded-full bg-black/60 hover:bg-red-600/80 text-white transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

/* ── Main Component ── */
export default function MixesView({ onNavigate, stationQueueSize = 25, stationRows = 3, fillPct = 70, artistFillPct = 70, artistRows: artistRowsProp = 4, mixEditorFillPct = 70 }: MixesViewProps) {
  const [mixes, setMixes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingMix, setPlayingMix] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [stations, setStations] = useState<any[]>([]);
  const stationArtMap = useMemo(() => {
    const m: Record<string, string[]> = {};
    stations.forEach((s: any) => { m[s.id] = s.sampleArt ?? []; });
    return m;
  }, [stations]);
  const [allArtists, setAllArtists] = useState<any[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(false);
  const [artistSearch, setArtistSearch] = useState('');
  const { playQueue, setCurrentStationId, setCurrentStationName, setCurrentMixId } = usePlayer();
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const artistScrollRef = useRef<HTMLDivElement>(null);
  const artistContainerRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState(200);
  const [artistItemSize, setArtistItemSize] = useState(100);

  // Form state
  const [formName, setFormName] = useState('');
  const [formStationIds, setFormStationIds] = useState<string[]>([]);
  const [formArtistIds, setFormArtistIds] = useState<string[]>([]);
  const [formPopularOnly, setFormPopularOnly] = useState(true);
  const [saving, setSaving] = useState(false);

  // Import playlists state
  const [importOpen, setImportOpen] = useState(false);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [selectedPlaylists, setSelectedPlaylists] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  // Station names and artist thumbs for card display
  const [stationNames, setStationNames] = useState<Record<string, string>>({});
  const [artistThumbs, setArtistThumbs] = useState<Record<string, string | null>>({});

  const fetchMixes = useCallback(() => {
    setLoading(true);
    fetch('/api/mixes').then(r => r?.json?.()).then(data => { setMixes(data?.mixes ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchMixes(); }, [fetchMixes]);

  // Fetch stations + artist thumbs for display
  useEffect(() => {
    fetch('/api/stations').then(r => r?.json?.()).then(data => {
      const sMap: Record<string, string> = {};
      (data?.stations ?? []).forEach((s: any) => { sMap[s.id] = s.name; });
      setStationNames(sMap);
      setStations(data?.stations ?? []);
    }).catch(() => {});
  }, []);

  // Collect all artist IDs from mixes to fetch their thumbs
  useEffect(() => {
    const allIds = new Set<string>();
    mixes.forEach(m => (m.artistIds ?? []).forEach((id: string) => allIds.add(id)));
    if (allIds.size === 0) return;
    fetch(`/api/artists?ids=${Array.from(allIds).join(',')}&limit=500`)
      .then(r => r?.json?.())
      .then(data => {
        const tMap: Record<string, string | null> = {};
        (data?.artists ?? []).forEach((a: any) => { tMap[a.id] = a.thumb ?? null; });
        setArtistThumbs(tMap);
      }).catch(() => {});
  }, [mixes]);

  // Load all artists for editor
  useEffect(() => {
    if (editing === null) return;
    if (allArtists.length > 0) return;
    setArtistsLoading(true);
    fetch('/api/artists?limit=5000&page=1')
      .then(r => r?.json?.())
      .then(data => { setAllArtists(data?.artists ?? []); setArtistsLoading(false); })
      .catch(() => setArtistsLoading(false));
  }, [editing, allArtists.length]);

  // Card sizing (matches station card logic)
  const lastCardSizeRef = useRef(0);
  useEffect(() => {
    const calcSize = () => {
      const container = containerRef.current;
      if (!container) return;
      const available = container.clientHeight;
      if (available < 10) return;
      const gap = 12;
      const totalGaps = (stationRows - 1) * gap;
      const perRow = Math.max(120, Math.round((available - totalGaps) * (fillPct / 100) / stationRows));
      if (Math.abs(perRow - lastCardSizeRef.current) > 2) {
        lastCardSizeRef.current = perRow;
        setCardSize(perRow);
      }
    };
    calcSize();
    const ro = new ResizeObserver(calcSize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [mixes, stationRows, fillPct]);

  // Artist grid sizing for editor — match artist page fill logic
  // Use a ref to prevent infinite resize loops (ResizeObserver → setState → re-render → resize → ...)
  const lastArtistSizeRef = useRef(0);
  useEffect(() => {
    const calcArtistSize = () => {
      const container = artistScrollRef.current;
      if (!container) return;
      const available = container.clientHeight;
      if (available < 10) return; // container not yet laid out
      const gap = 12;
      const labelHeight = 28; // name text below icon (match artists-view)
      const rows = artistRowsProp;
      const totalGaps = (rows - 1) * gap;
      const perRow = Math.max(40, Math.floor(((available - totalGaps) * (mixEditorFillPct / 100) / rows) - labelHeight));
      // Only update if meaningfully different to break resize loops
      if (Math.abs(perRow - lastArtistSizeRef.current) > 2) {
        lastArtistSizeRef.current = perRow;
        setArtistItemSize(perRow);
      }
    };
    calcArtistSize();
    const ro = new ResizeObserver(calcArtistSize);
    if (artistScrollRef.current) ro.observe(artistScrollRef.current);
    return () => ro.disconnect();
  }, [editing, mixEditorFillPct, artistRowsProp]);

  const handlePlay = async (mix: any) => {
    setPlayingMix(mix.id);
    try {
      const res = await fetch(`/api/mixes/${mix.id}/tracks?limit=${stationQueueSize}`);
      const data = await res?.json?.();
      const tracks: TrackInfo[] = (data?.tracks ?? [])?.map?.((t: any) => ({
        id: t?.id ?? '',
        title: t?.title ?? '',
        artistName: t?.artist?.name ?? t?.artistName ?? '',
        albumTitle: t?.album?.title ?? t?.albumTitle ?? '',
        thumb: t?.thumb ?? t?.album?.thumb ?? null,
        mediaKey: t?.mediaKey ?? null,
        duration: t?.duration ?? null,
        ratingKey: t?.ratingKey ?? '',
        year: t?.year ?? t?.album?.year ?? null,
        artistId: t?.artistId ?? null,
        albumId: t?.albumId ?? null,
      })) ?? [];
      if (tracks?.length > 0) {
        playQueue(tracks);
        setCurrentStationId(null);
        setCurrentMixId(mix.id);
        setCurrentStationName(mix?.name ?? 'Mix');
        toast.success(`Playing ${mix?.name ?? 'Mix'}`);
      } else {
        toast.error('No tracks found for this mix');
      }
    } catch {
      toast.error('Failed to load mix tracks');
    }
    setPlayingMix(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/mixes/${id}`, { method: 'DELETE' });
      setMixes(prev => prev.filter(m => m.id !== id));
      toast.success('Mix deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const startEdit = (mix: any) => {
    setEditing(mix);
    setFormName(mix.name ?? '');
    setFormStationIds(mix.stationIds ?? []);
    setFormArtistIds(mix.artistIds ?? []);
    setFormPopularOnly(mix.popularOnly ?? true);
    setArtistSearch('');
  };

  const startNew = () => {
    setEditing('new');
    setFormName('');
    setFormStationIds([]);
    setFormArtistIds([]);
    setFormPopularOnly(true);
    setArtistSearch('');
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const body = { name: formName, stationIds: formStationIds, artistIds: formArtistIds, popularOnly: formPopularOnly };
      if (editing === 'new') {
        const res = await fetch('/api/mixes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res?.json?.();
        if (data?.mix) { setMixes(prev => [data.mix, ...prev]); toast.success('Mix created!'); }
      } else {
        const res = await fetch(`/api/mixes/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res?.json?.();
        if (data?.mix) { setMixes(prev => prev.map(m => m.id === data.mix.id ? data.mix : m)); toast.success('Mix updated!'); }
      }
      setEditing(null);
    } catch { toast.error('Failed to save'); }
    setSaving(false);
  };

  // Import playlists handlers
  const openImport = async () => {
    setImportOpen(true);
    setSelectedPlaylists([]);
    setPlaylistsLoading(true);
    try {
      const res = await fetch('/api/playlists');
      const data = await res?.json?.();
      setPlaylists(data?.playlists ?? []);
    } catch {
      toast.error('Failed to fetch playlists');
      setPlaylists([]);
    }
    setPlaylistsLoading(false);
  };

  const togglePlaylistSelection = (id: string) => {
    setSelectedPlaylists(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const handleImport = async () => {
    if (selectedPlaylists.length === 0) { toast.error('Select at least one playlist'); return; }
    setImporting(true);
    try {
      const res = await fetch('/api/playlists/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistIds: selectedPlaylists }),
      });
      const data = await res?.json?.();
      if (data?.imported > 0) {
        toast.success(`Imported ${data.imported} playlist${data.imported > 1 ? 's' : ''} as mix${data.imported > 1 ? 'es' : ''}`);
        fetchMixes();
        setImportOpen(false);
      } else {
        toast.error('No matching tracks found — make sure your library is synced');
      }
    } catch {
      toast.error('Import failed');
    }
    setImporting(false);
  };

  const toggleStation = (id: string) => {
    setFormStationIds(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const toggleArtist = (id: string) => {
    setFormArtistIds(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  // Filter artists for the grid
  const filteredArtists = artistSearch
    ? allArtists.filter(a => (a?.name ?? '').toLowerCase().includes(artistSearch.toLowerCase()))
    : allArtists;

  // Build columns for artist grid (4 rows)
  const artistColumns: any[][] = [];
  for (let i = 0; i < filteredArtists.length; i += 4) {
    artistColumns.push(filteredArtists.slice(i, i + 4));
  }

  // ── Editor view ──
  if (editing !== null) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden p-4 gap-3">
        <div className="flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-display font-bold flex items-center gap-2">
            <Disc3 className="w-5 h-5 text-primary" />
            {editing === 'new' ? 'Create Mix' : 'Edit Mix'}
          </h2>
          <div className="flex gap-2">
            <button onClick={() => setEditing(null)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-sm">
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
            </button>
          </div>
        </div>

        {/* Top section: name, stations, toggle - compact, no scroll */}
        <div className="flex-shrink-0 space-y-3">
          {/* Name */}
          <div>
            <label className="text-sm font-medium mb-1 block">Mix Name</label>
            <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="My Custom Mix"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border/30 text-sm" />
          </div>

          {/* Stations */}
          <div>
            <label className="text-sm font-medium mb-2 flex items-center gap-2">
              <Radio className="w-4 h-4 text-primary" /> Stations
            </label>
            <div className="flex flex-wrap gap-2">
              {stations.map((s: any) => (
                <button key={s.id} onClick={() => toggleStation(s.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    formStationIds.includes(s.id) ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'
                  }`}>
                  {formStationIds.includes(s.id) && <Check className="w-3 h-3 inline mr-1" />}
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* Popular only toggle */}
          <div className="flex items-center gap-3">
            <button onClick={() => setFormPopularOnly(!formPopularOnly)}
              className={`w-10 h-5 rounded-full transition-colors relative ${formPopularOnly ? 'bg-primary' : 'bg-secondary'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${formPopularOnly ? 'left-5' : 'left-0.5'}`} />
            </button>
            <span className="text-sm">Popular tracks only</span>
          </div>
        </div>

        {/* Artist selection grid - fills ALL remaining space */}
        <div ref={artistScrollRef} className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-1 flex-shrink-0">
              <label className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> Emphasized Artists
                {formArtistIds.length > 0 && <span className="text-xs text-primary">({formArtistIds.length} selected)</span>}
              </label>
            </div>
            {/* Search */}
            <input value={artistSearch} onChange={e => setArtistSearch(e.target.value)}
              placeholder="Search artists..." className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border/30 text-xs mb-2 flex-shrink-0" />
            {/* Selected artists chips */}
            {formArtistIds.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2 flex-shrink-0 max-h-16 overflow-y-auto">
                {formArtistIds.map(id => {
                  const a = allArtists.find(ar => ar.id === id);
                  return (
                    <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px]">
                      {a?.name ?? id}
                      <button onClick={() => toggleArtist(id)} className="hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
                    </span>
                  );
                })}
              </div>
            )}
            {/* Artist grid (4 rows, scrollable with arrows) */}
            {artistsLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="flex-1 flex items-center gap-1 min-h-0">
                <button
                  onClick={() => { const el = artistContainerRef.current; if (el) el.scrollBy({ left: -(artistItemSize + 8) * 3, behavior: 'smooth' }); }}
                  className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary/60 hover:bg-secondary flex items-center justify-center transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div ref={artistContainerRef} className="flex-1 self-stretch overflow-x-auto overflow-y-hidden scrollbar-none min-h-0">
                  <div className="flex gap-2 h-full items-center">
                    {artistColumns.map((col, ci) => (
                      <div key={ci} className="flex flex-col gap-2 flex-shrink-0" style={{ width: artistItemSize }}>
                        {col.map((artist: any) => {
                          const selected = formArtistIds.includes(artist.id);
                          return (
                            <button key={artist.id} onClick={() => toggleArtist(artist.id)}
                              className={`group text-center flex-shrink-0 relative ${selected ? 'opacity-100' : 'opacity-70 hover:opacity-100'}`}>
                              <div className="relative rounded-full overflow-hidden bg-secondary mx-auto transition-all"
                                style={{ width: artistItemSize, height: artistItemSize }}>
                                <PlexImage thumb={artist?.thumb} alt={artist?.name ?? ''} />
                                {selected && (
                                  <div className="absolute inset-0 bg-primary/40 flex items-center justify-center">
                                    <Check className="w-1/3 h-1/3 text-white" />
                                  </div>
                                )}
                              </div>
                              <h4 className="font-medium text-[10px] truncate px-0.5 mt-0.5">{artist?.name ?? 'Unknown'}</h4>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                    <div className="flex-shrink-0 w-4 h-full" />
                  </div>
                </div>
                <button
                  onClick={() => { const el = artistContainerRef.current; if (el) el.scrollBy({ left: (artistItemSize + 8) * 3, behavior: 'smooth' }); }}
                  className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary/60 hover:bg-secondary flex items-center justify-center transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
      </div>
    );
  }

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -(cardSize + 12) * 2 : (cardSize + 12) * 2, behavior: 'smooth' });
  };

  // ── List view ──
  return (
    <div className="flex flex-col h-full px-6">
      {/* Header row */}
      <div className="flex items-center justify-between py-3 flex-shrink-0">
        <div>
          <h2 className="text-[clamp(1.25rem,2.5vw,2rem)] font-display font-bold tracking-tight flex items-center gap-3">
            <Disc3 className="w-[clamp(1.25rem,2vw,1.75rem)] h-[clamp(1.25rem,2vw,1.75rem)] text-primary" /> Mixes
          </h2>
          <p className="text-muted-foreground text-[clamp(0.75rem,1.2vw,1rem)] mt-1">Your custom mixes — Swipe to browse</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll('left')}
            className="w-10 h-10 rounded-full bg-secondary/70 flex items-center justify-center hover:bg-secondary transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="w-10 h-10 rounded-full bg-secondary/70 flex items-center justify-center hover:bg-secondary transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button onClick={openImport}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors">
            <Download className="w-4 h-4" /> Import
          </button>
          <button onClick={startNew}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> New Mix
          </button>
        </div>
      </div>

      {/* Import Playlists Modal */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !importing && setImportOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-card border border-border/40 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border/30">
              <h3 className="text-lg font-display font-bold flex items-center gap-2">
                <Download className="w-5 h-5 text-primary" /> Import Playlists
              </h3>
              <button onClick={() => !importing && setImportOpen(false)} className="p-1.5 rounded-full hover:bg-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {playlistsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : playlists.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Music2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No playlists found on your media server</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {playlists.map(pl => (
                    <button key={pl.id} onClick={() => togglePlaylistSelection(pl.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        selectedPlaylists.includes(pl.id) ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-secondary/60'
                      }`}>
                      <div className={`w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                        selectedPlaylists.includes(pl.id) ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                      }`}>
                        {selectedPlaylists.includes(pl.id) && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{pl.title}</p>
                        <p className="text-xs text-muted-foreground">{pl.trackCount} track{pl.trackCount !== 1 ? 's' : ''}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {playlists.length > 0 && (
              <div className="flex items-center justify-between p-4 border-t border-border/30">
                <p className="text-xs text-muted-foreground">
                  {selectedPlaylists.length} selected
                </p>
                <button onClick={handleImport} disabled={importing || selectedPlaylists.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {importing ? 'Importing...' : 'Import Selected'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : mixes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <Disc3 className="w-16 h-16 opacity-30" />
          <p className="text-lg font-medium">No mixes yet</p>
          <p className="text-sm">Create a mix by combining stations and artists</p>
          <button onClick={startNew} className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
            <Plus className="w-4 h-4" /> Create Your First Mix
          </button>
        </div>
      ) : (
        <div ref={containerRef} className="flex-1 flex items-center min-h-0">
          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto scrollbar-none w-full items-center"
          >
            {(() => {
              const cols: any[][] = [];
              for (let i = 0; i < mixes.length; i += stationRows) {
                cols.push(mixes.slice(i, i + stationRows));
              }
              return cols.map((col, ci) => (
                <div key={ci} className="flex flex-col gap-3 flex-shrink-0">
                  {col.map((mix: any, si: number) => (
                    <MixCard
                      key={`${ci}-${si}-${mix?.id}`}
                      mix={mix}
                      onPlay={() => handlePlay(mix)}
                      onEdit={() => startEdit(mix)}
                      onDelete={() => handleDelete(mix.id)}
                      isPlaying={playingMix === mix.id}
                      cardSize={cardSize}
                      stationNames={stationNames}
                      artistThumbs={artistThumbs}
                      stationArtMap={stationArtMap}
                    />
                  ))}
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}