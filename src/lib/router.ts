import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}

export function usePath() {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export function navigate(to: string, { replace = false } = {}) {
  window.history[replace ? 'replaceState' : 'pushState'](null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

export type Route =
  | { page: 'home' }
  | { page: 'callback' }
  | { page: 'share'; id: string }
  | { page: 'result'; id: string; joinId: string }
  | { page: 'notFound' };

export function matchRoute(path: string): Route {
  if (path === '/' || path === '') return { page: 'home' };
  if (path === '/callback') return { page: 'callback' };
  const result = path.match(/^\/c\/([A-Za-z0-9]+)\/([A-Za-z0-9]+)\/?$/);
  if (result) return { page: 'result', id: result[1], joinId: result[2] };
  const share = path.match(/^\/c\/([A-Za-z0-9]+)\/?$/);
  if (share) return { page: 'share', id: share[1] };
  return { page: 'notFound' };
}
