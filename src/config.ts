export const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string;

// Spotify rejects "localhost" redirect URIs, so local dev runs on 127.0.0.1 (see main.tsx).
export const REDIRECT_URI = `${window.location.origin}/callback`;

export const SCOPES = ['user-library-read', 'user-top-read', 'user-follow-read', 'playlist-read-private', 'playlist-read-collaborative'];

// Who friends should ask when Spotify blocks them (the app is in development mode).
export const ADMIN_NAME = (import.meta.env.VITE_ADMIN_NAME as string | undefined) || 'the person who runs this site';

export const APP_NAME = "Scotty's MusicMatch";
