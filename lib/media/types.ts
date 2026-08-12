// Common media server types - backend-agnostic shapes
// Used by the adapter layer to normalize Plex, Jellyfin, and Subsonic data into
// a single internal format that the rest of the app can consume.

export type MediaServerType = 'plex' | 'jellyfin' | 'subsonic';

export interface MediaServerConfig {
  serverType: MediaServerType;
  serverUrl: string;
  token: string;       // Plex token / Jellyfin API key / Subsonic password
  username?: string | null;  // Subsonic username (null for Plex / Jellyfin)
  libraryId?: string | null; // Selected library section (persisted from setup)
}

export interface MediaLibrarySection {
  id: string;
  title: string;
}

export interface MediaArtist {
  id: string;              // Unique ID as returned by the backend
  name: string;
  thumb: string | null;    // Backend-specific image identifier (path for plex, ID for jellyfin/subsonic)
  addedAt: number | null;  // Unix seconds (nullable)
  summary?: string | null;
}

export interface MediaAlbum {
  id: string;
  artistId: string;
  title: string;
  year: number | null;
  thumb: string | null;
  genre: string | null;
}

export interface MediaTrack {
  id: string;
  albumId: string;
  artistId: string;
  artistName: string;
  albumTitle: string;
  title: string;
  duration: number | null;     // Milliseconds
  trackNumber: number | null;
  year: number | null;
  genre: string | null;
  thumb: string | null;
  mediaKey: string | null;     // Identifier used to request a stream via /api/plex/stream
  ratingCount?: number | null; // Plex-native per-track popularity (Last.fm listener count) - drives the flame icon
}

export interface MediaLibraryBundle {
  artists: MediaArtist[];
  albums: MediaAlbum[];
  tracks: MediaTrack[];
}

export interface MediaPlaylist {
  id: string;
  title: string;
  trackCount: number;
  thumb: string | null;
}

export interface MediaPlaylistTrack {
  id: string;            // Track ID in the cache (e.g., "track-12345")
  title: string;
  artistName: string;
  albumTitle: string;
  duration: number | null;
  thumb: string | null;
}

// Progress callback invoked during long-running sync/fetch operations
/** Strip the "track-" / "artist-" / "album-" prefix from a cached ID to get the raw media server key. */
export function stripIdPrefix(cachedId: string): string {
  return cachedId.replace(/^(track|artist|album)-/, '');
}

export type ProgressCallback = (pct: number, message: string) => Promise<void> | void;
