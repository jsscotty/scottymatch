import type { ReactNode } from 'react';
import { APP_NAME } from '../config';
import { Link } from './ui';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="12.5" cy="16" r="7.5" fill="#1ed760" fillOpacity="0.9" />
      <circle cx="19.5" cy="16" r="7.5" fill="#a78bfa" fillOpacity="0.85" />
      <path d="M16 10.3a7.5 7.5 0 0 1 0 11.4 7.5 7.5 0 0 1 0-11.4Z" fill="#fff" />
    </svg>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_30%_0%,rgba(30,215,96,0.16),transparent_70%),radial-gradient(50%_50%_at_80%_10%,rgba(167,139,250,0.16),transparent_70%)]" />
      <header className="relative mx-auto flex max-w-5xl items-center justify-between px-4 py-5 md:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight">
          <Logo />
          {APP_NAME}
        </Link>
      </header>
      <main className="relative mx-auto max-w-5xl px-4 pb-20 md:px-6">{children}</main>
      <footer className="relative mx-auto max-w-5xl px-4 pb-10 text-xs leading-relaxed text-white/35 md:px-6">
        Uses the Spotify Web API. Not made or endorsed by Spotify. We keep the song lists behind a link until its owner deletes it.
      </footer>
    </div>
  );
}
