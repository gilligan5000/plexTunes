"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Disc3, Play, Loader2, Music2, Plus, Minus, Pencil, Trash2, X, Save, Check, Radio, Users, ChevronLeft, ChevronRight, Download, Upload } from 'lucide-react';
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
function MixCard({ mix, onPlay, onEdit, onDelete, onExport, isPlaying, exporting, cardSize, stationNames, artistThumbs, stationArtMap }: {
  mix: any; onPlay: () => void; onEdit: () => void; onDelete: () => void; onExport: () => void; exporting?: boolean;
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
        <button onClick={(e) => { e.stopPropagation(); onExport(); }} disabled={exporting} className="p-1.5 rounded-full bg-black/60 hover:bg-green-600/80 text-white transition-colors disabled:opacity-50" title="Export to server">
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        </button>
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
  const [exportingId, setExportingId] = useState<string | null>(null);
  // Export config dialog
  const [exportTarget, setExportTarget] = useState<any | null>(null);
  const [exportMode, setExportMode] = useState<'all' | 'count' | 'hours'>('all');
  const [exportCount, setExportCount] = useState(50);
  const [exportHours, setExportHours] = useState(2);
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
  // User-controlled artist icon size AND row count (both persisted, both manual).
  const [artistIconSize, setArtistIconSize] = useState(110);
  const [artistGridRows, setArtistGridRows] = useState(3);
  const ARTIST_ICON_MIN = 60;
  const ARTIST_ICON_MAX = 260;
  const ARTIST_ICON_STEP = 24;
  const ARTIST_ROWS_MIN = 1;
  const ARTIST_ROWS_MAX = 8;
  const ARTIST_LABEL_H = 16;
  const ARTIST_ROW_GAP = 8;
  const artistGridHeight = artistGridRows * (artistIconSize + ARTIST_LABEL_H) + Math.max(0, artistGridRows - 1) * ARTIST_ROW_GAP;
  useEffect(() => {
    try {
      const savedSize = window.localStorage.getItem('mixArtistIconSize');
      if (savedSize) { const n = parseInt(savedSize, 10); if (!isNaN(n)) setArtistIconSize(Math.min(ARTIST_ICON_MAX, Math.max(ARTIST_ICON_MIN, n))); }
      const savedRows = window.localStorage.getItem('mixArtistRows');
      if (savedRows) { const n = parseInt(savedRows, 10); if (!isNaN(n)) setArtistGridRows(Math.min(ARTIST_ROWS_MAX, Math.max(ARTIST_ROWS_MIN, n))); }
    } catch {}
  }, []);
  const adjustArtistIcon = (delta: number) => {
    setArtistIconSize(prev => {
      const next = Math.min(ARTIST_ICON_MAX, Math.max(ARTIST_ICON_MIN, prev + delta));
      try { window.localStorage.setItem('mixArtistIconSize', String(next)); } catch {}
      return next;
    });
  };
  const adjustArtistRows = (delta: number) => {
    setArtistGridRows(prev => {
      const next = Math.min(ARTIST_ROWS_MAX, Math.max(ARTIST_ROWS_MIN, prev + delta));
      try { window.localStorage.setItem('mixArtistRows', String(next)); } catch {}
      return next;
    });
  };

  // Form state
  const [formName, setFormName] = useState('');
  const [formStationIds, setFormStationIds] = useState<string[]>([]);
  const [formArtistIds, setFormArtistIds] = useState<string[]>([]);
  const [formAlbumIds, setFormAlbumIds] = useState<string[]>([]);
  const [formPopularOnly, setFormPopularOnly] = useState(true);
  const [saving, setSaving] = useState(false);

  // Album picker state (per-artist album selection)
  const [albumPickerArtist, setAlbumPickerArtist] = useState<any | null>(null);
  const [artistAlbums, setArtistAlbums] = useState<any[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(false);
  const [albumArtistMap, setAlbumArtistMap] = useState<Record<string, string>>({});

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

  // When editing a mix that already has album restrictions, build the album→artist
  // map up front so the chips can show accurate album counts.
  useEffect(() => {
    if (editing === null || editing === 'new') return;
    const albumIds: string[] = editing.albumIds ?? [];
    const artistIds: string[] = editing.artistIds ?? [];
    if (albumIds.length === 0 || artistIds.length === 0) return;
    Promise.all(artistIds.map((aid: string) =>
      fetch(`/api/artists/${aid}`).then(r => r.json())
        .then(d => ({ aid, albums: d?.artist?.cachedAlbums ?? [] }))
        .catch(() => ({ aid, albums: [] }))
    )).then(results => {
      setAlbumArtistMap(prev => {
        const next = { ...prev };
        results.forEach(({ aid, albums }) => albums.forEach((al: any) => { next[al.id] = aid; }));
        return next;
      });
    });
  }, [editing]);

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

  // artistGridRows is now user-controlled (manual +/- buttons) and persisted.

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

  const openExport = (mix: any) => {
    setExportMode('all');
    setExportCount(50);
    setExportHours(2);
    setExportTarget(mix);
  };

  const handleExport = async () => {
    const mix = exportTarget;
    if (!mix) return;
    const params = new URLSearchParams();
    if (exportMode === 'count') params.set('limit', String(Math.max(1, exportCount)));
    else if (exportMode === 'hours') params.set('minutes', String(Math.max(1, Math.round(exportHours * 60))));
    setExportTarget(null);
    setExportingId(mix.id);
    try {
      const qs = params.toString();
      const res = await fetch(`/api/mixes/${mix.id}/export${qs ? `?${qs}` : ''}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Export failed');
      toast.success(`Exported "${mix.name}" → ${data.trackCount} tracks`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Export failed');
    }
    setExportingId(null);
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
    setFormAlbumIds(mix.albumIds ?? []);
    setFormPopularOnly(mix.popularOnly ?? true);
    setArtistSearch('');
  };

  const startNew = () => {
    setEditing('new');
    setFormName('');
    setFormStationIds([]);
    setFormArtistIds([]);
    setFormAlbumIds([]);
    setFormPopularOnly(true);
    setArtistSearch('');
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const body = { name: formName, stationIds: formStationIds, artistIds: formArtistIds, albumIds: formAlbumIds, popularOnly: formPopularOnly };
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
    setFormArtistIds(prev => {
      if (prev.includes(id)) {
        // Deselecting an artist also drops any of their album restrictions we know about
        setFormAlbumIds(albums => albums.filter(albId => albumArtistMap[albId] !== id));
        return prev.filter(a => a !== id);
      }
      return [...prev, id];
    });
  };

  const openAlbumPicker = async (artist: any) => {
    setAlbumPickerArtist(artist);
    setAlbumsLoading(true);
    setArtistAlbums([]);
    try {
      const res = await fetch(`/api/artists/${artist.id}`);
      const data = await res.json();
      const albums = data?.artist?.cachedAlbums ?? [];
      setArtistAlbums(albums);
      // Remember which artist each album belongs to (for chip counts + cleanup)
      setAlbumArtistMap(prev => {
        const next = { ...prev };
        albums.forEach((al: any) => { next[al.id] = artist.id; });
        return next;
      });
    } catch { setArtistAlbums([]); }
    setAlbumsLoading(false);
  };

  const toggleAlbum = (albumId: string) => {
    setFormAlbumIds(prev => prev.includes(albumId) ? prev.filter(a => a !== albumId) : [...prev, albumId]);
  };

  const clearArtistAlbums = () => {
    const ids = new Set(artistAlbums.map((a: any) => a.id));
    setFormAlbumIds(prev => prev.filter(id => !ids.has(id)));
  };

  // Filter artists for the grid
  const filteredArtists = artistSearch
    ? allArtists.filter(a => (a?.name ?? '').toLowerCase().includes(artistSearch.toLowerCase()))
    : allArtists;

  // Build columns for artist grid (4 rows)
  const artistColumns: any[][] = [];
  const rowsPerColumn = Math.max(1, artistGridRows);
  for (let i = 0; i < filteredArtists.length; i += rowsPerColumn) {
    artistColumns.push(filteredArtists.slice(i, i + rowsPerColumn));
  }

  // ── Editor view ──
  if (editing !== null) {
    return (
      <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-3">
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
            <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-3">
              {stations.map((s: any) => {
                const selected = formStationIds.includes(s.id);
                const art = (stationArtMap[s.id] ?? [])[0];
                return (
                  <button key={s.id} onClick={() => toggleStation(s.id)}
                    className="group flex flex-col items-center gap-1.5 focus:outline-none">
                    <div className={`relative w-full aspect-square rounded-lg overflow-hidden bg-secondary transition-all ${
                      selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'ring-1 ring-border/30 group-hover:ring-primary/50'
                    }`}>
                      {art ? (
                        <PlexImage thumb={art} alt={s.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Radio className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                      {selected && (
                        <div className="absolute inset-0 bg-primary/40 flex items-center justify-center">
                          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                            <Check className="w-4 h-4 text-primary-foreground" />
                          </div>
                        </div>
                      )}
                    </div>
                    <span className={`text-[11px] leading-tight text-center line-clamp-2 ${
                      selected ? 'text-primary font-medium' : 'text-muted-foreground'
                    }`}>{s.name}</span>
                  </button>
                );
              })}
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

        {/* Artist selection grid - fixed height driven by row count */}
        <div ref={artistScrollRef} className="flex flex-col">
            <div className="flex items-center justify-between mb-1 flex-shrink-0">
              <label className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> Emphasized Artists
                {formArtistIds.length > 0 && <span className="text-xs text-primary">({formArtistIds.length} selected)</span>}
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground mr-0.5">Icon size</span>
                <button onClick={() => adjustArtistIcon(-ARTIST_ICON_STEP)} disabled={artistIconSize <= ARTIST_ICON_MIN}
                  title="Smaller" className="w-6 h-6 rounded-md bg-secondary hover:bg-secondary/70 flex items-center justify-center transition-colors disabled:opacity-40">
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => adjustArtistIcon(ARTIST_ICON_STEP)} disabled={artistIconSize >= ARTIST_ICON_MAX}
                  title="Larger" className="w-6 h-6 rounded-md bg-secondary hover:bg-secondary/70 flex items-center justify-center transition-colors disabled:opacity-40">
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] text-muted-foreground mr-0.5 ml-2">Rows</span>
                <button onClick={() => adjustArtistRows(-1)} disabled={artistGridRows <= ARTIST_ROWS_MIN}
                  title="Fewer rows" className="w-6 h-6 rounded-md bg-secondary hover:bg-secondary/70 flex items-center justify-center transition-colors disabled:opacity-40">
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] text-muted-foreground w-3 text-center">{artistGridRows}</span>
                <button onClick={() => adjustArtistRows(1)} disabled={artistGridRows >= ARTIST_ROWS_MAX}
                  title="More rows" className="w-6 h-6 rounded-md bg-secondary hover:bg-secondary/70 flex items-center justify-center transition-colors disabled:opacity-40">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {/* Search */}
            <input value={artistSearch} onChange={e => setArtistSearch(e.target.value)}
              placeholder="Search artists..." className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border/30 text-xs mb-2 flex-shrink-0" />
            {/* Selected artists chips */}
            {formArtistIds.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2 flex-shrink-0 max-h-16 overflow-y-auto">
                {formArtistIds.map(id => {
                  const a = allArtists.find(ar => ar.id === id);
                  const albumCount = formAlbumIds.filter(albId => albumArtistMap[albId] === id).length;
                  return (
                    <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px]">
                      {a?.name ?? id}
                      {albumCount > 0 && <span className="text-[9px] opacity-80">· {albumCount} album{albumCount > 1 ? 's' : ''}</span>}
                      <button onClick={() => openAlbumPicker(a ?? { id })} title="Choose albums" className={`transition-colors ${albumCount > 0 ? 'text-white' : 'hover:text-white'}`}><Disc3 className="w-2.5 h-2.5" /></button>
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
              <div className="flex items-center gap-1" style={{ height: artistGridHeight }}>
                <button
                  onClick={() => { const el = artistContainerRef.current; if (el) el.scrollBy({ left: -(artistIconSize + 8) * 3, behavior: 'smooth' }); }}
                  className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary/60 hover:bg-secondary flex items-center justify-center transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div ref={artistContainerRef} className="flex-1 self-stretch overflow-x-auto overflow-y-hidden scrollbar-none min-h-0">
                  <div className="flex gap-2 h-full items-start">
                    {artistColumns.map((col, ci) => (
                      <div key={ci} className="flex flex-col gap-2 flex-shrink-0" style={{ width: artistIconSize }}>
                        {col.map((artist: any) => {
                          const selected = formArtistIds.includes(artist.id);
                          return (
                            <button key={artist.id} onClick={() => toggleArtist(artist.id)}
                              className={`group text-center flex-shrink-0 relative ${selected ? 'opacity-100' : 'opacity-70 hover:opacity-100'}`}>
                              <div className="relative rounded-full overflow-hidden bg-secondary mx-auto transition-all"
                                style={{ width: artistIconSize, height: artistIconSize }}>
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
                  onClick={() => { const el = artistContainerRef.current; if (el) el.scrollBy({ left: (artistIconSize + 8) * 3, behavior: 'smooth' }); }}
                  className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary/60 hover:bg-secondary flex items-center justify-center transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

        {/* Album picker modal */}
        {albumPickerArtist && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setAlbumPickerArtist(null)}>
            <div onClick={e => e.stopPropagation()} className="bg-card border border-border/40 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden">
              <div className="flex items-start justify-between p-4 border-b border-border/30">
                <div className="min-w-0 pr-2">
                  <h3 className="text-base font-display font-bold flex items-center gap-2 truncate">
                    <Disc3 className="w-4 h-4 text-primary flex-shrink-0" /> <span className="truncate">{albumPickerArtist.name ?? 'Albums'}</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Pick specific albums to pull from — or leave all unselected to include the whole artist.</p>
                </div>
                <button onClick={() => setAlbumPickerArtist(null)} className="p-1.5 rounded-full hover:bg-secondary transition-colors flex-shrink-0"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {albumsLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : artistAlbums.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Music2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No albums found for this artist</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {artistAlbums.map((al: any) => {
                      const checked = formAlbumIds.includes(al.id);
                      return (
                        <button key={al.id} onClick={() => toggleAlbum(al.id)}
                          className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors ${checked ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-secondary/60'}`}>
                          <div className={`w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${checked ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
                            {checked && <Check className="w-3 h-3 text-primary-foreground" />}
                          </div>
                          <div className="w-9 h-9 rounded overflow-hidden bg-secondary flex-shrink-0 relative">
                            <PlexImage thumb={al?.thumb} alt={al?.title ?? ''} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{al?.title ?? 'Unknown album'}</p>
                            {al?.year && <p className="text-xs text-muted-foreground">{al.year}</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between p-3 border-t border-border/30">
                <button onClick={clearArtistAlbums} className="text-xs text-muted-foreground hover:text-foreground transition-colors">All albums</button>
                <button onClick={() => setAlbumPickerArtist(null)} className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">Done</button>
              </div>
            </div>
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
                      onExport={() => openExport(mix)}
                      exporting={exportingId === mix.id}
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

      {/* Export config dialog */}
      {exportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setExportTarget(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-card border border-border/40 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-start justify-between p-4 border-b border-border/30">
              <div className="min-w-0 pr-2">
                <h3 className="text-base font-display font-bold flex items-center gap-2 truncate">
                  <Upload className="w-4 h-4 text-primary flex-shrink-0" /> <span className="truncate">Export “{exportTarget.name}”</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Choose how large the exported playlist should be.</p>
              </div>
              <button onClick={() => setExportTarget(null)} className="p-1.5 rounded-full hover:bg-secondary transition-colors flex-shrink-0"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3">
              <label className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${exportMode === 'all' ? 'bg-primary/15 ring-1 ring-primary/40' : 'bg-secondary hover:bg-secondary/70'}`}>
                <input type="radio" name="exportMode" checked={exportMode === 'all'} onChange={() => setExportMode('all')} className="accent-primary" />
                <span className="text-sm">All matching tracks</span>
              </label>
              <label className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${exportMode === 'count' ? 'bg-primary/15 ring-1 ring-primary/40' : 'bg-secondary hover:bg-secondary/70'}`}>
                <input type="radio" name="exportMode" checked={exportMode === 'count'} onChange={() => setExportMode('count')} className="accent-primary" />
                <span className="text-sm flex-1">Number of songs</span>
                <input type="number" min={1} value={exportCount} onFocus={() => setExportMode('count')}
                  onChange={e => setExportCount(Math.max(1, parseInt(e.target.value || '1', 10)))}
                  className="w-20 px-2 py-1 rounded-md bg-background border border-border/40 text-sm text-right" />
              </label>
              <label className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${exportMode === 'hours' ? 'bg-primary/15 ring-1 ring-primary/40' : 'bg-secondary hover:bg-secondary/70'}`}>
                <input type="radio" name="exportMode" checked={exportMode === 'hours'} onChange={() => setExportMode('hours')} className="accent-primary" />
                <span className="text-sm flex-1">Hours of play</span>
                <input type="number" min={0.5} step={0.5} value={exportHours} onFocus={() => setExportMode('hours')}
                  onChange={e => setExportHours(Math.max(0.5, parseFloat(e.target.value || '0.5')))}
                  className="w-20 px-2 py-1 rounded-md bg-background border border-border/40 text-sm text-right" />
              </label>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-border/30">
              <button onClick={() => setExportTarget(null)} className="px-3 py-1.5 rounded-lg bg-secondary text-sm">Cancel</button>
              <button onClick={handleExport} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
                <Upload className="w-3.5 h-3.5" /> Export
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}