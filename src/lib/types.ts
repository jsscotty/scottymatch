export interface ArtistRef {
  id: string;
  name: string;
}

export interface Track {
  id: string;
  name: string;
  artists: ArtistRef[];
  album: string;
  image: string | null;
  isrc: string | null;
  ms: number;
  added: string;
  preview: string | null;
  // Added later. Older links don't have these, so treat them as optional.
  year?: number | null;
  explicit?: boolean;
  pop?: number | null;
}

export interface ArtistInfo {
  name: string;
  image: string | null;
  genres: string[];
}

export interface LibraryUser {
  id: string;
  name: string;
  image: string | null;
}

export interface Library {
  v: 1;
  user: LibraryUser;
  createdAt: string;
  tracks: Track[];
  artists: Record<string, ArtistInfo>;
}

export interface TeaserArtist {
  name: string;
  image: string | null;
}

export interface ShareSummary {
  user: LibraryUser;
  trackCount: number;
  createdAt: string;
  updatedAt?: string;
  topArtists?: TeaserArtist[];
}

export interface MatchStats {
  sharedTracks: number;
  sharedArtists: number;
  tasteMatch: number;
  topArtists: string[];
}

export interface JoinSummary {
  joinId: string;
  user: LibraryUser;
  trackCount: number;
  createdAt: string;
  stats?: MatchStats;
}
