import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, Loader2, User } from 'lucide-react';
import { safeCdnUrl } from '../lib/format';
import { navigate } from '../lib/router';

export function Link({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      href={href}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(href);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

export function Avatar({ src, name, size = 48, ring }: { src: string | null; name: string; size?: number; ring?: string }) {
  const image = safeCdnUrl(src);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 ${ring ?? ''}`}
      style={{ width: size, height: size }}
    >
      {image ? (
        <img src={image} alt={name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="font-display font-semibold text-white/80" style={{ fontSize: size * 0.4 }}>
          {name.trim().charAt(0).toUpperCase() || <User className="h-1/2 w-1/2" />}
        </span>
      )}
    </span>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden />;
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-mint transition-[width] duration-300 ease-out" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card p-6 md:p-8 ${className}`}>{children}</div>;
}

export function Problem({ title, message, children }: { title: string; message: string; children?: ReactNode }) {
  return (
    <Panel className="fade-up mx-auto max-w-lg text-center">
      <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-400/15 text-amber-300">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <p className="mt-3 text-white/70">{message}</p>
      {children && <div className="mt-6 flex flex-wrap justify-center gap-3">{children}</div>}
    </Panel>
  );
}

export function PageLoading({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-white/60">
      <Spinner className="h-7 w-7 text-mint" />
      <p>{label}</p>
    </div>
  );
}
