// Subsonic / OpenSubsonic adapter (tested against Navidrome).
// Uses plain password auth for simplicity — the password stays server-side
// (never sent to the browser), so we don't need the token+salt flow.
// Spec: http://www.subsonic.org/pages/api.jsp
// OpenSubsonic extensions: https://opensubsonic.netlify.app/

import type { MediaServerAdapter } from './adapter';
import type {
  MediaLibrarySection,
  MediaLibraryBundle,
  MediaServerConfig,
  ProgressCallback,
  MediaArtist,
  MediaAlbum,
  MediaTrack,
  MediaPlaylist,
  MediaPlaylistTrack,
} from './types';

const API_VERSION = '1.16.1';
const CLIENT_ID = 'plex-jukebox-app';

export class SubsonicAdapter implements MediaServerAdapter {
  readonly type = 'subsonic' as const;

  constructor(private readonly config: MediaServerConfig) {}

  /** Builds the `?u=&p=&v=&c=&f=json` query string prefix shared by every request. */
  private authParams(): URLSearchParams {
    const p = new URLSearchParams();
    p.set('u', this.config.username ?? '');
    p.set('p', this.config.token); // plain password in `token` column (kept server-side only)
    p.set('v', API_VERSION);
    p.set('c', CLIENT_ID);
    p.set('f', 'json');
    return p;
  }

  /** JSON-API helper. Subsonic wraps everything in { "subsonic-response": {...} }. */
  private async ssGet<T = any>(endpoint: string, extraParams: Record<string, string> = {}): Promise<T> {
    const params = this.authParams();
    for (const [k, v] of Object.entries(extraParams)) params.set(k, v);
    const url = `${this.config.serverUrl}/rest/${endpoint}?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Subsonic HTTP ${res.status} on ${endpoint}`);
    const data = await res.json();
    const body = data?.['subsonic-response'];
    if (body?.status !== 'ok') {
      const err = body?.error?.message ?? 'Unknown Subsonic error';
      throw new Error(`Subsonic: ${err}`);
    }
    return body as T;
  }

  async createPlaylist(name: string, trackIds: string[]): Promise<string> {
    // Subsonic createPlaylist uses GET with multiple songId params.
    const params = this.authParams();
    params.set('name', name);
    for (const id of trackIds) params.append('songId', id);
    const url = `${this.config.serverUrl}/rest/createPlaylist?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Subsonic createPlaylist HTTP ${res.status}`);
    const data = await res.json();
    const body = data?.['subsonic-response'];
    if (body?.status !== 'ok') {
      throw new Error(`Subsonic createPlaylist: ${body?.error?.message ?? 'Unknown error'}`);
    }
    return body?.playlist?.id ?? '';
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.ssGet('ping');
      return true;
    } catch {
      return false;
    }
  }

  async getLibrarySections(): Promise<MediaLibrarySection[]> {
    try {
      // Subsonic's "music folders" are closest to libraries.
      const body: any = await this.ssGet('getMusicFolders');
      const folders = body?.musicFolders?.musicFolder ?? [];
      if (Array.isArray(folders) && folders.length > 0) {
        return folders.map((f: any) => ({ id: String(f?.id ?? ''), title: f?.name ?? 'Music' }));
      }
    } catch {
      /* fall through */
    }
    // Fallback: single synthetic library that means "everything"
    return [{ id: 'all', title: 'All Music' }];
  }

  async getFullLibrary(libraryId: string, onProgress?: ProgressCallback): Promise<MediaLibraryBundle> {
    const musicFolderExtra: Record<string, string> = libraryId && libraryId !== 'all' ? { musicFolderId: libraryId } : {};

    // 1. Fetch all artists via getArtists (ID3-tag indexed)
    await onProgress?.(5, 'Fetching artists from Subsonic...');
    const artistsBody: any = await this.ssGet('getArtists', musicFolderExtra);
    const indexes = artistsBody?.artists?.index ?? [];
    const rawArtists: any[] = [];
    for (const idx of indexes) {
      const list = Array.isArray(idx?.artist) ? idx.artist : idx?.artist ? [idx.artist] : [];
      rawArtists.push(...list);
    }

    await onProgress?.(15, `Found ${rawArtists.length} artists. Fetching albums...`);

    // 2. Fetch all albums via paginated getAlbumList2 (alphabeticalByArtist for determinism)
    const rawAlbums: any[] = [];
    {
      const PAGE = 500;
      let offset = 0;
      while (true) {
        const body: any = await this.ssGet('getAlbumList2', {
          type: 'alphabeticalByArtist',
          size: String(PAGE),
          offset: String(offset),
          ...musicFolderExtra,
        });
        const list = body?.albumList2?.album ?? [];
        if (!Array.isArray(list) || list.length === 0) break;
        rawAlbums.push(...list);
        offset += list.length;
        if (list.length < PAGE) break;
      }
    }

    await onProgress?.(35, `Found ${rawAlbums.length} albums. Fetching tracks...`);

    // 3. Fetch tracks - getAlbum(id) returns song[] for each album.
    // Run with limited concurrency to keep the server happy.
    const rawTracks: any[] = [];
    const CONCURRENCY = 8;
    let completed = 0;
    const totalAlbums = rawAlbums.length;
    const queue = [...rawAlbums];
    const worker = async () => {
      while (queue.length > 0) {
        const album = queue.shift();
        if (!album) break;
        try {
          const body: any = await this.ssGet('getAlbum', { id: String(album?.id ?? '') });
          const songs = body?.album?.song ?? [];
          if (Array.isArray(songs)) rawTracks.push(...songs);
        } catch {
          /* skip album on error, keep going */
        }
        completed += 1;
        if (completed % 25 === 0 || completed === totalAlbums) {
          const pct = 35 + Math.floor((completed / Math.max(1, totalAlbums)) * 25);
          await onProgress?.(pct, `Fetching tracks... ${completed}/${totalAlbums} albums processed`);
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    await onProgress?.(60, `Found ${rawTracks.length} tracks. Saving to database...`);

    const artists: MediaArtist[] = rawArtists.map((a: any) => {
      const id = String(a?.id ?? '');
      return {
        id: `artist-${id}`,
        name: a?.name ?? 'Unknown Artist',
        // Subsonic: use coverArt field if provided, else the artist ID itself
        thumb: (a?.coverArt ?? id) as string,
        addedAt: null,
      };
    });

    const albums: MediaAlbum[] = rawAlbums.map((al: any) => {
      const id = String(al?.id ?? '');
      const artistId = String(al?.artistId ?? '');
      return {
        id: `album-${id}`,
        artistId: artistId ? `artist-${artistId}` : '',
        title: al?.name ?? al?.title ?? 'Unknown Album',
        year: typeof al?.year === 'number' ? al.year : al?.year ? Number(al.year) : null,
        thumb: (al?.coverArt ?? id) as string,
        genre: al?.genre ?? null,
      };
    });

    const tracks: MediaTrack[] = rawTracks.map((t: any) => {
      const id = String(t?.id ?? '');
      const albumRawId = String(t?.albumId ?? '');
      const artistRawId = String(t?.artistId ?? '');
      const durationMs = typeof t?.duration === 'number' ? t.duration * 1000 : null;
      return {
        id: `track-${id}`,
        albumId: albumRawId ? `album-${albumRawId}` : '',
        artistId: artistRawId ? `artist-${artistRawId}` : '',
        artistName: t?.artist ?? '',
        albumTitle: t?.album ?? '',
        title: t?.title ?? 'Unknown Track',
        duration: durationMs,
        trackNumber: t?.track ?? null,
        year: typeof t?.year === 'number' ? t.year : t?.year ? Number(t.year) : null,
        genre: t?.genre ?? null,
        thumb: (t?.coverArt ?? albumRawId ?? id) as string,
        mediaKey: id || null,
      };
    });

    return { artists, albums, tracks };
  }

  async fetchImage(thumb: string, width: number, height: number): Promise<Response> {
    // Subsonic getCoverArt accepts a size (square).
    const params = this.authParams();
    params.set('id', thumb);
    params.set('size', String(Math.max(width, height)));
    const url = `${this.config.serverUrl}/rest/getCoverArt?${params}`;
    return fetch(url);
  }

  async getPlaylists(): Promise<MediaPlaylist[]> {
    const data = await this.ssGet<any>('getPlaylists');
    const items = data?.playlists?.playlist ?? [];
    return items
      .filter((p: any) => (p.songCount ?? 0) > 0)
      .map((p: any) => ({
        id: String(p.id),
        title: p.name ?? 'Untitled',
        trackCount: p.songCount ?? 0,
        thumb: p.coverArt ? String(p.coverArt) : null,
      }));
  }

  async getPlaylistTracks(playlistId: string): Promise<MediaPlaylistTrack[]> {
    const data = await this.ssGet<any>('getPlaylist', { id: playlistId });
    const entries = data?.playlist?.entry ?? [];
    return entries.map((e: any) => ({
      id: `track-${e.id}`,
      title: e.title ?? 'Unknown',
      artistId: e.artistId ? `artist-${e.artistId}` : '',
      artistName: e.artist ?? 'Unknown Artist',
      albumId: e.albumId ? `album-${e.albumId}` : '',
      albumTitle: e.album ?? 'Unknown Album',
      duration: (e.duration ?? 0) * 1000,
    }));
  }

  async fetchStream(mediaKey: string, rangeHeader?: string | null): Promise<Response> {
    const params = this.authParams();
    params.set('id', mediaKey);
    // Ask for the original format; Subsonic servers generally transcode if the client lacks support.
    params.set('format', 'raw');
    const url = `${this.config.serverUrl}/rest/stream?${params}`;
    const headers: Record<string, string> = {};
    if (rangeHeader) headers['Range'] = rangeHeader;
    return fetch(url, { headers });
  }
}
