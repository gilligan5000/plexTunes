// Plex adapter - wraps the existing lib/plex.ts functions and normalizes results
// into the common MediaArtist/MediaAlbum/MediaTrack shapes.

import type { MediaServerAdapter } from './adapter';
import type {
  MediaLibrarySection,
  MediaLibraryBundle,
  MediaServerConfig,
  MediaPlaylist,
  MediaPlaylistTrack,
  ProgressCallback,
} from './types';
import { stripIdPrefix } from './types';
import { plexFetch, testPlexConnection, getMusicLibrarySections } from '@/lib/plex';

const PAGE_SIZE = 100;

export class PlexAdapter implements MediaServerAdapter {
  readonly type = 'plex' as const;

  constructor(private readonly config: MediaServerConfig) {}

  async testConnection(): Promise<boolean> {
    return testPlexConnection(this.config.serverUrl, this.config.token);
  }

  async getLibrarySections(): Promise<MediaLibrarySection[]> {
    const sections = await getMusicLibrarySections(this.config.serverUrl, this.config.token);
    return (sections ?? []).map((s: any) => ({
      id: String(s?.key ?? ''),
      title: s?.title ?? 'Music',
    }));
  }

  async getFullLibrary(sectionId: string, onProgress?: ProgressCallback): Promise<MediaLibraryBundle> {
    const { serverUrl, token } = this.config;

    const fetchAllPaged = async (type: number): Promise<any[]> => {
      const all: any[] = [];
      let start = 0;
      let total = Infinity;
      while (start < total) {
        const data = await plexFetch(
          serverUrl,
          token,
          `/library/sections/${sectionId}/all?type=${type}&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${PAGE_SIZE}`,
        );
        const container = data?.MediaContainer;
        total = container?.totalSize ?? container?.size ?? 0;
        const items = container?.Metadata ?? [];
        all.push(...items);
        start += PAGE_SIZE;
        if (items.length === 0) break;
      }
      return all;
    };

    await onProgress?.(5, 'Fetching artists from Plex...');
    const rawArtists = await fetchAllPaged(8);
    await onProgress?.(25, `Found ${rawArtists.length} artists. Fetching albums...`);
    const rawAlbums = await fetchAllPaged(9);
    await onProgress?.(45, `Found ${rawAlbums.length} albums. Fetching tracks...`);
    const rawTracks = await fetchAllPaged(10);
    await onProgress?.(60, `Found ${rawTracks.length} tracks. Saving to database...`);

    const artists = (rawArtists ?? []).map((a: any) => {
      const rk = String(a?.ratingKey ?? '');
      return {
        id: `artist-${rk}`,
        name: a?.title ?? 'Unknown Artist',
        thumb: a?.thumb ?? null,
        addedAt: a?.addedAt ?? null,
      };
    });

    const albums = (rawAlbums ?? []).map((al: any) => {
      const rk = String(al?.ratingKey ?? '');
      const parentRk = String(al?.parentRatingKey ?? '');
      return {
        id: `album-${rk}`,
        artistId: `artist-${parentRk}`,
        title: al?.title ?? 'Unknown Album',
        year: al?.year ?? null,
        thumb: al?.thumb ?? null,
        genre: al?.Genre?.[0]?.tag ?? null,
      };
    });

    const tracks = (rawTracks ?? []).map((t: any) => {
      const rk = String(t?.ratingKey ?? '');
      const albumRk = String(t?.parentRatingKey ?? '');
      const grandparentRk = String(t?.grandparentRatingKey ?? '');
      return {
        id: `track-${rk}`,
        albumId: `album-${albumRk}`,
        artistId: `artist-${grandparentRk}`,
        artistName: t?.grandparentTitle ?? '',
        albumTitle: t?.parentTitle ?? '',
        title: t?.title ?? 'Unknown Track',
        duration: t?.duration ?? null,
        trackNumber: t?.index ?? null,
        year: t?.year ?? t?.parentYear ?? null,
        genre: t?.Genre?.[0]?.tag ?? null,
        thumb: t?.thumb ?? t?.parentThumb ?? null,
        mediaKey: t?.Media?.[0]?.Part?.[0]?.key ?? null,
      };
    });

    return { artists, albums, tracks };
  }

  async getPlaylists(): Promise<MediaPlaylist[]> {
    try {
      const data = await plexFetch(this.config.serverUrl, this.config.token, '/playlists?type=15&playlistType=audio');
      const items = data?.MediaContainer?.Metadata ?? [];
      return items.map((p: any) => ({
        id: String(p?.ratingKey ?? ''),
        title: p?.title ?? 'Untitled',
        trackCount: p?.leafCount ?? 0,
        thumb: p?.composite ?? p?.thumb ?? null,
      }));
    } catch (e: any) {
      console.error('Plex getPlaylists error:', e?.message);
      return [];
    }
  }

  async getPlaylistTracks(playlistId: string): Promise<MediaPlaylistTrack[]> {
    try {
      const data = await plexFetch(this.config.serverUrl, this.config.token, `/playlists/${playlistId}/items`);
      const items = data?.MediaContainer?.Metadata ?? [];
      return items.map((t: any) => {
        const rk = String(t?.ratingKey ?? '');
        return {
          id: `track-${rk}`,
          title: t?.title ?? 'Unknown',
          artistName: t?.grandparentTitle ?? '',
          albumTitle: t?.parentTitle ?? '',
          duration: t?.duration ?? null,
          thumb: t?.thumb ?? t?.parentThumb ?? null,
        };
      });
    } catch (e: any) {
      console.error('Plex getPlaylistTracks error:', e?.message);
      return [];
    }
  }

  async createPlaylist(name: string, trackIds: string[]): Promise<string> {
    const { serverUrl, token } = this.config;
    const machineId = await this.getMachineIdentifier();
    // Plex expects a URI list: server://<machineId>/com.plexapp.plugins.library/library/metadata/<rk1>,<rk2>,...
    const rawKeys = trackIds.map(id => stripIdPrefix(id));
    const uri = `server://${machineId}/com.plexapp.plugins.library/library/metadata/${rawKeys.join(',')}`;
    const params = new URLSearchParams({
      type: 'audio',
      title: name,
      uri,
      'X-Plex-Token': token,
    });
    const res = await fetch(`${serverUrl}/playlists?${params}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'X-Plex-Client-Identifier': 'plex-jukebox-app',
        'X-Plex-Product': 'Plex Jukebox',
      },
    });
    if (!res.ok) throw new Error(`Plex create playlist error: ${res.status}`);
    const data = await res.json();
    return String(data?.MediaContainer?.Metadata?.[0]?.ratingKey ?? '');
  }

  /** Get the machine identifier for this Plex server (needed for playlist URIs). */
  private async getMachineIdentifier(): Promise<string> {
    const data = await plexFetch(this.config.serverUrl, this.config.token, '/');
    return data?.MediaContainer?.machineIdentifier ?? '';
  }

  async fetchImage(thumb: string, width: number, height: number): Promise<Response> {
    const { serverUrl, token } = this.config;
    const url = `${serverUrl}/photo/:/transcode?width=${width}&height=${height}&minSize=1&upscale=1&url=${encodeURIComponent(thumb)}&X-Plex-Token=${token}`;
    return fetch(url);
  }

  async fetchStream(mediaKey: string, rangeHeader?: string | null): Promise<Response> {
    const { serverUrl, token } = this.config;
    const url = `${serverUrl}${mediaKey}?X-Plex-Token=${token}`;
    const headers: Record<string, string> = {
      'X-Plex-Client-Identifier': 'plex-jukebox-app',
      'X-Plex-Product': 'Plex Jukebox',
    };
    if (rangeHeader) headers['Range'] = rangeHeader;
    return fetch(url, { headers });
  }
}
