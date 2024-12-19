export interface Song {
  id: string;
  title: string;
  artist: string;
  albumCover: string;
  duration: string;
  previewUrl: string | null;
}

export interface Artist {
  id: string;
  name: string;
  imageUrl: string;
  genres: string[];
  spotifyUrl: string;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  followers: number;
  following: number;
  topGenres: string[];
  spotifyUrl: string;
}