import { CLIENT_ID, REDIRECT_URI, SCOPES } from '../config';

// Authorization Code + PKCE. Spotify removed the implicit grant (response_type=token)
// on 2025-11-27, which is what broke the original version of this app.
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const PENDING_KEY = 'sm_pending_login';
const TOKEN_KEY = 'sm_token';
const PENDING_TTL_MS = 30 * 60 * 1000;

export type LoginIntent =
  | { kind: 'create' }
  | { kind: 'join'; shareId: string }
  | { kind: 'refresh'; shareId: string }
  | { kind: 'playlist'; shareId: string; joinId: string };

interface PendingLogin {
  state: string;
  verifier: string;
  intent: LoginIntent;
  createdAt: number;
}

interface StoredToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export class LoginError extends Error {
  constructor(public code: 'cancelled' | 'expired' | 'failed', message: string, public intent: LoginIntent | null = null) {
    super(message);
    this.name = 'LoginError';
  }
}

function randomString(length: number) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function challengeFor(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// localStorage (not sessionStorage) so the login survives in-app browsers that
// open the redirect in a fresh tab.
function readPending(): PendingLogin | null {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as PendingLogin | null;
    if (!pending || Date.now() - pending.createdAt > PENDING_TTL_MS) return null;
    return pending;
  } catch {
    return null;
  }
}

function readToken(): StoredToken | null {
  try {
    return JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as StoredToken | null;
  } catch {
    return null;
  }
}

function saveToken(response: TokenResponse, previousRefresh: string | null = null) {
  const token: StoredToken = {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? previousRefresh,
    expiresAt: Date.now() + response.expires_in * 1000,
  };
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  return token;
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function startLogin(intent: LoginIntent) {
  const verifier = randomString(64);
  const state = randomString(24);
  const pending: PendingLogin = { state, verifier, intent, createdAt: Date.now() };
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  clearToken();

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
    scope: (intent.kind === 'playlist' ? ['playlist-modify-private'] : SCOPES).join(' '),
    state,
    // Always show the consent screen so a second person on the same device
    // gets the "Not you?" link to switch accounts.
    show_dialog: 'true',
  });
  window.location.assign(`${AUTH_URL}?${params}`);
}

async function describeTokenError(res: Response) {
  try {
    const body = (await res.json()) as { error?: string; error_description?: string };
    return body.error_description || body.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function completeLogin(search: string): Promise<LoginIntent> {
  const params = new URLSearchParams(search);
  const error = params.get('error');
  const pending = readPending();

  if (error) {
    localStorage.removeItem(PENDING_KEY);
    if (error === 'access_denied') throw new LoginError('cancelled', 'You cancelled the Spotify login.', pending?.intent ?? null);
    throw new LoginError('failed', `Spotify said: ${error}`, pending?.intent ?? null);
  }

  const code = params.get('code');
  if (!code || !pending || pending.state !== params.get('state')) {
    throw new LoginError('expired', 'This login expired or was started in another browser. Start again.');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: pending.verifier,
    }),
  });
  localStorage.removeItem(PENDING_KEY);
  if (!res.ok) throw new LoginError('failed', `Spotify login failed: ${await describeTokenError(res)}`, pending.intent);

  saveToken((await res.json()) as TokenResponse);
  return pending.intent;
}

let refreshing: Promise<StoredToken> | null = null;

export function refreshAccessToken(): Promise<StoredToken> {
  const current = readToken();
  if (!current?.refreshToken) return Promise.reject(new LoginError('expired', 'Your Spotify session ended. Connect again.'));
  refreshing ??= (async () => {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: current.refreshToken!,
        client_id: CLIENT_ID,
      }),
    });
    if (!res.ok) {
      clearToken();
      throw new LoginError('expired', 'Your Spotify session ended. Connect again.');
    }
    return saveToken((await res.json()) as TokenResponse, current.refreshToken);
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function getAccessToken(): Promise<string> {
  const token = readToken();
  if (!token) throw new LoginError('expired', 'Your Spotify session ended. Connect again.');
  if (token.expiresAt - Date.now() < 60_000 && token.refreshToken) {
    return (await refreshAccessToken()).accessToken;
  }
  return token.accessToken;
}
