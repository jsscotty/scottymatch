export const SPOTIFY_CONFIG = {
  CLIENT_ID: import.meta.env.VITE_SPOTIFY_CLIENT_ID,
  REDIRECT_URI: `${window.location.origin}/callback`,
  SCOPES: [
    'user-library-read',
    'user-read-private',
    'user-read-email',
    'user-top-read',
    'playlist-read-private'
  ].join(' '),
  API_URL: 'https://api.spotify.com/v1',
  AUTH_URL: 'https://accounts.spotify.com/authorize',
  TOKEN_URL: 'https://accounts.spotify.com/api/token'
};