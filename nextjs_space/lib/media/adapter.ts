// Media Server Adapter interface
// Every backend implementation (Plex, Jellyfin, Subsonic) exposes this exact shape.
//
// The adapter is responsible for:
//   1. Testing connectivity with the configured credentials.
//   2. Listing music libraries (if applicable) so the user can pick one during setup.
//   3. Fetching the full library bundle (artists/albums/tracks) for sync.
//   4. Proxying image and audio stream requests (returns raw Response objects
//      so the Next.js route handlers can pipe them through unchanged).

import type {
  MediaLibrarySection,
  MediaLibraryBundle,
  MediaServerConfig,
  MediaPlaylist,
  MediaPlaylistTrack,
  ProgressCallback,
} from './types';

export interface MediaServerAdapter {
  readonly type: MediaServerConfig['serverType'];

  // Returns true if credentials work against the server.
  testConnection(): Promise<boolean>;

  // Lists available music library sections for the user to pick during setup.
  // For Subsonic (which has no real "sections"), returns a single synthetic entry.
  getLibrarySections(): Promise<MediaLibrarySection[]>;

  // Full library sync - fetches everything so we can populate the CachedArtist/Album/Track tables.
  // onProgress reports percentages (0-100) and a human-readable message.
  getFullLibrary(libraryId: string, onProgress?: ProgressCallback): Promise<MediaLibraryBundle>;

  // Lists playlists from the media server.
  getPlaylists(): Promise<MediaPlaylist[]>;

  // Returns track details for a specific playlist.
  getPlaylistTracks(playlistId: string): Promise<MediaPlaylistTrack[]>;

  // Returns a fetch() Response object for an image. The caller pipes the body back to the client.
  fetchImage(thumb: string, width: number, height: number): Promise<Response>;

  // Returns a fetch() Response object for an audio stream. The caller pipes the body back.
  // rangeHeader may be provided by the client for seeking.
  fetchStream(mediaKey: string, rangeHeader?: string | null): Promise<Response>;
}
