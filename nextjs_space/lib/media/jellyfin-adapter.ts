// Jellyfin adapter - uses API key authentication.
// API spec: https://api.jellyfin.org/ (OpenAPI).
// Auth header: X-Emby-Token: <api_key>

import type { MediaServerAdapter } from './adapter';
import type {
  MediaLibrarySection,
  MediaLibraryBundle,
  MediaServerConfig,
  MediaPlaylist,
  MediaPlaylistTrack,
  ProgressCallback,
  MediaArtist,
  MediaAlbum,
  MediaTrack,
} from './types';

const PAGE_SIZE = 500;

export class JellyfinAdapter implements MediaServerAdapter {
  readonly type = 'jellyfin' as const;

  constructor(private readonly config: MediaServerConfig) {}

  private authHeaders(): Record<string, string> {
    return {
      'X-Emby-Token': this.config.token,
      'Accept': 'application/json',
    };
  }

  private async jfGet(path: string): Promise<any> {
    const url = `${this.config.serverUrl}${path}`;
    const res = await fetch(url, { headers: this.authHeaders() });
    if (!res.ok) throw new Error(`Jellyfin error ${res.status} on ${path}`);
    return res.json();
  }

  async testConnection(): Promise<boolean> {
    try {
      const info = await this.jfGet('/System/Info');
      return !!info?.Id;
    } catch {
      return false;
    }
  }

  async getLibrarySections(): Promise<MediaLibrarySection[]> {
    try {
      const data = await this.jfGet('/Library/MediaFolders');
      const items = (data?.Items ?? []) as any[];
      return items
        .filter((i) => i?.CollectionType === 'music')
        .map((i) => ({ id: String(i?.Id ?? ''), title: i?.Name ?? 'Music' }));
    } catch {
      return [];
    }
  }

  /**
   * Paginated Items fetch with the requested IncludeItemTypes filter.
   * Jellyfin returns { Items, TotalRecordCount } per page.
   */
  private async fetchItemsPaged(libraryId: string, itemTypes: string, fields: string): Promise<any[]> {
    const all: any[] = [];
    let startIndex = 0;
    while (true) {
      const params = new URLSearchParams({
        ParentId: libraryId,
        IncludeItemTypes: itemTypes,
        Recursive: 'true',
        Fields: fields,
        StartIndex: String(startIndex),
        Limit: String(PAGE_SIZE),
      });
      const data = await this.jfGet(`/Items?${params}`);
      const items = (data?.Items ?? []) as any[];
      const total = Number(data?.TotalRecordCount ?? items.length);
      all.push(...items);
      startIndex += items.length;
      if (items.length === 0 || startIndex >= total) break;
    }
    return all;
  }

  async getFullLibrary(libraryId: string, onProgress?: ProgressCallback): Promise<MediaLibraryBundle> {
    await onProgress?.(5, 'Fetching artists from Jellyfin...');
    // Use Artists endpoint scoped by ParentId. Supported by modern Jellyfin.
    const rawArtists = await this.fetchItemsPaged(libraryId, 'MusicArtist', 'PremiereDate,Genres');
    await onProgress?.(25, `Found ${rawArtists.length} artists. Fetching albums...`);

    const rawAlbums = await this.fetchItemsPaged(
      libraryId,
      'MusicAlbum',
      'Genres,PremiereDate,ProductionYear,AlbumArtists',
    );
    await onProgress?.(45, `Found ${rawAlbums.length} albums. Fetching tracks...`);

    const rawTracks = await this.fetchItemsPaged(
      libraryId,
      'Audio',
      'Genres,ProductionYear,RunTimeTicks,IndexNumber,AlbumId,AlbumArtists,ArtistItems',
    );
    await onProgress?.(60, `Found ${rawTracks.length} tracks. Saving to database...`);

    const artists: MediaArtist[] = rawArtists.map((a: any) => {
      const id = String(a?.Id ?? '');
      return {
        id: `artist-${id}`,
        name: a?.Name ?? 'Unknown Artist',
        thumb: a?.ImageTags?.Primary ? id : null, // we store the item ID as thumb; image proxy uses it
        addedAt: null,
      };
    });

    const albums: MediaAlbum[] = rawAlbums.map((al: any) => {
      const id = String(al?.Id ?? '');
      const artistId = String(al?.AlbumArtists?.[0]?.Id ?? al?.ArtistItems?.[0]?.Id ?? '');
      return {
        id: `album-${id}`,
        artistId: artistId ? `artist-${artistId}` : '',
        title: al?.Name ?? 'Unknown Album',
        year: al?.ProductionYear ?? (al?.PremiereDate ? new Date(al.PremiereDate).getFullYear() : null),
        thumb: al?.ImageTags?.Primary ? id : null,
        genre: (al?.Genres?.[0] ?? null) as string | null,
      };
    });

    const tracks: MediaTrack[] = rawTracks.map((t: any) => {
      const id = String(t?.Id ?? '');
      const albumRawId = String(t?.AlbumId ?? '');
      const artistRawId = String(t?.ArtistItems?.[0]?.Id ?? t?.AlbumArtists?.[0]?.Id ?? '');
      const runtimeMs = t?.RunTimeTicks ? Math.round(Number(t.RunTimeTicks) / 10000) : null; // ticks → ms
      return {
        id: `track-${id}`,
        albumId: albumRawId ? `album-${albumRawId}` : '',
        artistId: artistRawId ? `artist-${artistRawId}` : '',
        artistName: (t?.ArtistItems?.[0]?.Name ?? t?.AlbumArtists?.[0]?.Name ?? t?.AlbumArtist ?? '') as string,
        albumTitle: t?.Album ?? '',
        title: t?.Name ?? 'Unknown Track',
        duration: runtimeMs,
        trackNumber: t?.IndexNumber ?? null,
        year: t?.ProductionYear ?? null,
        genre: (t?.Genres?.[0] ?? null) as string | null,
        // For tracks, prefer album primary image (so album art appears). Fall back to track's own primary image.
        thumb: (t?.AlbumPrimaryImageTag ? albumRawId : (t?.ImageTags?.Primary ? id : null)) || null,
        mediaKey: id || null, // we use the raw item ID for streaming
      };
    });

    return { artists, albums, tracks };
  }

  async getPlaylists(): Promise<MediaPlaylist[]> {
    try {
      const params = new URLSearchParams({
        IncludeItemTypes: 'Playlist',
        Recursive: 'true',
        Fields: 'ChildCount',
      });
      const data = await this.jfGet(`/Items?${params}`);
      const items = (data?.Items ?? []) as any[];
      return items
        .filter((p: any) => p?.MediaType === 'Audio' || p?.MediaType === 'Unknown')
        .map((p: any) => ({
          id: String(p?.Id ?? ''),
          title: p?.Name ?? 'Untitled',
          trackCount: p?.ChildCount ?? 0,
          thumb: p?.ImageTags?.Primary ? String(p.Id) : null,
        }));
    } catch (e: any) {
      console.error('Jellyfin getPlaylists error:', e?.message);
      return [];
    }
  }

  async getPlaylistTracks(playlistId: string): Promise<MediaPlaylistTrack[]> {
    try {
      const params = new URLSearchParams({
        ParentId: playlistId,
        Fields: 'ArtistItems,AlbumId',
      });
      const data = await this.jfGet(`/Items?${params}`);
      const items = (data?.Items ?? []) as any[];
      return items.map((t: any) => {
        const id = String(t?.Id ?? '');
        const runtimeMs = t?.RunTimeTicks ? Math.round(Number(t.RunTimeTicks) / 10000) : null;
        return {
          id: `track-${id}`,
          title: t?.Name ?? 'Unknown',
          artistName: t?.ArtistItems?.[0]?.Name ?? t?.AlbumArtist ?? '',
          albumTitle: t?.Album ?? '',
          duration: runtimeMs,
          thumb: t?.AlbumPrimaryImageTag ? String(t.AlbumId ?? id) : (t?.ImageTags?.Primary ? id : null),
        };
      });
    } catch (e: any) {
      console.error('Jellyfin getPlaylistTracks error:', e?.message);
      return [];
    }
  }

  async fetchImage(thumb: string, width: number, height: number): Promise<Response> {
    // 'thumb' here is a Jellyfin item ID - we request the Primary image for it.
    const url = `${this.config.serverUrl}/Items/${encodeURIComponent(thumb)}/Images/Primary?fillWidth=${width}&fillHeight=${height}&quality=90`;
    return fetch(url, { headers: this.authHeaders() });
  }

  async createPlaylist(name: string, trackIds: string[]): Promise<string> {
    const url = `${this.config.serverUrl}/Playlists`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ Name: name, Ids: trackIds, MediaType: 'Audio' }),
    });
    if (!res.ok) throw new Error(`Jellyfin createPlaylist error ${res.status}`);
    const data = await res.json();
    return data?.Id ?? '';
  }

  async fetchStream(mediaKey: string, rangeHeader?: string | null): Promise<Response> {
    // Universal audio endpoint - lets Jellyfin pick the best container.
    // `static=true` would force original file; we let Jellyfin handle it for broad client compatibility.
    const url = `${this.config.serverUrl}/Audio/${encodeURIComponent(mediaKey)}/universal?UserId=&DeviceId=plex-jukebox-app&MaxStreamingBitrate=320000&Container=mp3,aac,m4a,flac,ogg,opus,wav&TranscodingContainer=mp3&AudioCodec=mp3&MaxAudioChannels=2&api_key=${encodeURIComponent(this.config.token)}`;
    const headers: Record<string, string> = { Accept: 'audio/*' };
    if (rangeHeader) headers['Range'] = rangeHeader;
    return fetch(url, { headers });
  }
}
