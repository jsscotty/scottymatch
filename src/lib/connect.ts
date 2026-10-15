import { useSyncExternalStore } from 'react';
import { ADMIN_NAME } from '../config';
import { clearToken, completeLogin, getAccessToken, LoginError, type LoginIntent } from './auth';
import { compareLibraries } from './compare';
import { createShare, getJoinLibrary, getOwnedShare, getOwnerLibrary, joinShare, refreshShare, rememberJoinLibrary, rememberOwnerLibrary, saveOwnedShare, ShareApiError } from './shares';
import { createPlaylist, fetchLibrary, SpotifyApiError } from './spotify';

export interface ConnectProblem {
  title: string;
  message: string;
  retry?: LoginIntent;
  goTo?: { label: string; path: string };
}

export type ConnectState =
  | { phase: 'auth' }
  | { phase: 'library'; loaded: number; total: number }
  | { phase: 'upload'; intent: LoginIntent }
  | { phase: 'playlist' }
  | { phase: 'done'; to: string }
  | { phase: 'error'; problem: ConnectProblem };

// One job per callback URL. Lives outside React so StrictMode's double effects
// and re-renders never exchange the same code twice.
let job: { key: string; state: ConnectState } | null = null;
const listeners = new Set<() => void>();
const initial: ConnectState = { phase: 'auth' };

function setState(state: ConnectState) {
  if (!job) return;
  job = { ...job, state };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useConnectState() {
  return useSyncExternalStore(subscribe, () => job?.state ?? initial);
}

export function startConnect(search: string) {
  if (job?.key === search) return;
  job = { key: search, state: initial };
  listeners.forEach((listener) => listener());
  void run(search);
}

function describe(error: unknown, intent: LoginIntent | null): ConnectProblem {
  if (error instanceof LoginError) {
    return {
      title: error.code === 'cancelled' ? 'Login cancelled' : 'Spotify login didn’t finish',
      message: error.message,
      retry: intent ?? error.intent ?? undefined,
    };
  }
  if (error instanceof SpotifyApiError && intent?.kind === 'playlist') {
    return { title: 'Couldn’t make the playlist', message: `Spotify said: ${error.message} (HTTP ${error.status})`, retry: intent };
  }
  if (error instanceof SpotifyApiError) {
    if (error.status === 403) {
      return {
        title: 'Spotify blocked this account',
        message: `This app is in Spotify's development mode, so only accounts on its approved list can connect. Ask ${ADMIN_NAME} to add the email you use for Spotify, then try again. (Spotify said: ${error.message})`,
        retry: intent ?? undefined,
      };
    }
    if (error.status === 429) {
      return {
        title: 'Spotify is busy',
        message: 'Spotify is rate limiting this app right now. Wait a few minutes and try again.',
        retry: intent ?? undefined,
      };
    }
    return { title: 'Spotify had a problem', message: `${error.message} (HTTP ${error.status})`, retry: intent ?? undefined };
  }
  if (error instanceof ShareApiError) {
    if (error.code === 'wrong_account') {
      return { title: 'Different Spotify account', message: error.message, retry: intent ?? undefined };
    }
    if (error.code === 'not_found' && intent?.kind === 'join') {
      return {
        title: 'This link doesn’t work anymore',
        message: 'The person who made it probably deleted it. Ask them for a new one, or make your own.',
        goTo: { label: 'Make your own link', path: '/' },
      };
    }
    return { title: 'Couldn’t save your link', message: error.message, retry: intent ?? undefined };
  }
  return {
    title: 'Something went wrong',
    message: error instanceof Error ? error.message : String(error),
    retry: intent ?? undefined,
  };
}

async function makePlaylist(shareId: string, joinId: string) {
  setState({ phase: 'playlist' });
  const [owner, friend] = await Promise.all([getOwnerLibrary(shareId), getJoinLibrary(shareId, joinId)]);
  const { sharedTracks } = compareLibraries(owner, friend);
  const first = (name: string) => name.split(' ')[0] || name;
  const url = await createPlaylist(
    `${first(owner.user.name)} & ${first(friend.user.name)}: both liked`,
    `${sharedTracks.length} songs we both have in our Liked Songs or playlists. Made with Scotty's MusicMatch.`,
    sharedTracks.map((pair) => pair.a.id),
  );
  clearToken();
  setState({ phase: 'done', to: `/c/${shareId}/${joinId}?playlist=${encodeURIComponent(url)}` });
}

async function run(search: string) {
  let intent: LoginIntent | null = null;
  try {
    intent = await completeLogin(search);
    // Keep the code out of the address bar and browser history.
    window.history.replaceState(null, '', '/callback');

    if (intent.kind === 'playlist') {
      await makePlaylist(intent.shareId, intent.joinId);
      return;
    }

    // A friend needs the owner's library for the results page. Fetch it while theirs loads.
    if (intent.kind === 'join') void getOwnerLibrary(intent.shareId).catch(() => undefined);

    setState({ phase: 'library', loaded: 0, total: 0 });
    const library = await fetchLibrary((loaded, total) => setState({ phase: 'library', loaded, total }));

    setState({ phase: 'upload', intent });
    const token = await getAccessToken();

    if (intent.kind === 'refresh') {
      const owned = getOwnedShare(intent.shareId);
      if (!owned) throw new Error('This device doesn’t have the key for that link anymore.');
      await refreshShare(intent.shareId, owned.ownerKey, library, token);
      rememberOwnerLibrary(intent.shareId, library);
      clearToken();
      setState({ phase: 'done', to: `/c/${intent.shareId}` });
      return;
    }

    if (intent.kind === 'create') {
      const { id, ownerKey } = await createShare(library, token);
      rememberOwnerLibrary(id, library);
      saveOwnedShare({ id, ownerKey, name: library.user.name, createdAt: library.createdAt });
      clearToken();
      setState({ phase: 'done', to: `/c/${id}` });
      return;
    }

    // Set when the owner tapped "Connect a friend here" on their own device.
    const ownerDevice = !!getOwnedShare(intent.shareId);
    try {
      const { joinId } = await joinShare(intent.shareId, library, token);
      rememberJoinLibrary(intent.shareId, joinId, library);
      clearToken();
      setState({ phase: 'done', to: `/c/${intent.shareId}/${joinId}` });
    } catch (error) {
      // You opened your own link. The server checked it's really you, so hand
      // this device the owner key and show the owner view.
      if (error instanceof ShareApiError && error.code === 'same_user' && ownerDevice) {
        clearToken();
        setState({
          phase: 'error',
          problem: {
            title: `Spotify logged in ${library.user.name.split(' ')[0]} again`,
            message: 'Your friend needs their own account. On Spotify’s screen, tap “Not you?”, then let them log in.',
            retry: intent,
            goTo: { label: 'Back to your link', path: `/c/${intent.shareId}` },
          },
        });
        return;
      }
      if (error instanceof ShareApiError && error.code === 'same_user' && typeof error.body.ownerKey === 'string') {
        saveOwnedShare({ id: intent.shareId, ownerKey: error.body.ownerKey, name: library.user.name, createdAt: library.createdAt });
        clearToken();
        setState({ phase: 'done', to: `/c/${intent.shareId}` });
        return;
      }
      throw error;
    }
  } catch (error) {
    console.error(error);
    setState({ phase: 'error', problem: describe(error, intent) });
  }
}
