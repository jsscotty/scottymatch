import { useEffect, useState } from 'react';
import { ExternalLink, Music, Pause, Play } from 'lucide-react';
import { artistUrl, safeCdnUrl, trackUrl } from '../lib/format';
import type { Track } from '../lib/types';

// One shared <audio> so starting a preview stops the previous one.
const audio = typeof Audio !== 'undefined' ? new Audio() : null;
let playingId: string | null = null;
const listeners = new Set<(id: string | null) => void>();

function setPlaying(id: string | null) {
  playingId = id;
  listeners.forEach((listener) => listener(id));
}
audio?.addEventListener('ended', () => setPlaying(null));

function usePlaying() {
  const [id, setId] = useState(playingId);
  useEffect(() => {
    listeners.add(setId);
    return () => {
      listeners.delete(setId);
    };
  }, []);
  return id;
}

function toggle(track: Track) {
  const preview = safeCdnUrl(track.preview);
  if (!audio || !preview) return;
  if (playingId === track.id) {
    audio.pause();
    setPlaying(null);
    return;
  }
  audio.src = preview;
  void audio.play().catch(() => setPlaying(null));
  setPlaying(track.id);
}

function Cover({ src, alt, round }: { src: string | null; alt: string; round?: boolean }) {
  const image = safeCdnUrl(src);
  return (
    <span className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden bg-white/10 ${round ? 'rounded-full' : 'rounded-lg'}`}>
      {image ? <img src={image} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <Music className="h-5 w-5 text-white/40" />}
    </span>
  );
}

export function TrackRow({ track, note, rank }: { track: Track; note?: string; rank?: number }) {
  const playing = usePlaying() === track.id;
  const canPlay = !!safeCdnUrl(track.preview);
  return (
    <li className="group flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-white/[0.04]">
      {rank !== undefined && <span className="w-6 shrink-0 text-right text-sm tabular-nums text-white/35">{rank}</span>}
      {canPlay ? (
        <button type="button" onClick={() => toggle(track)} className="relative shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-mint" aria-label={playing ? `Pause ${track.name}` : `Play a preview of ${track.name}`}>
          <Cover src={track.image} alt={track.album || track.name} />
          <span className={`absolute inset-0 flex items-center justify-center rounded-lg bg-black/55 transition ${playing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            {playing ? <Pause className="h-5 w-5 fill-white text-white" /> : <Play className="h-5 w-5 fill-white text-white" />}
          </span>
          {playing && <span className="absolute -bottom-1 left-1/2 h-1 w-6 -translate-x-1/2 animate-pulse rounded-full bg-mint" />}
        </button>
      ) : (
        <Cover src={track.image} alt={track.album || track.name} />
      )}
      <div className="min-w-0 flex-1">
        <p className={`truncate font-medium ${playing ? 'text-mint' : ''}`}>{track.name}</p>
        <p className="truncate text-sm text-white/55">
          {track.artists.map((a) => a.name).join(', ')}
          {track.year ? <span className="text-white/35"> · {track.year}</span> : null}
        </p>
        {note && <p className="truncate text-xs text-white/40">{note}</p>}
      </div>
      <a href={trackUrl(track.id)} target="_blank" rel="noopener noreferrer" className="rounded-full p-2 text-white/40 transition hover:bg-white/10 hover:text-mint" aria-label={`Open ${track.name} in Spotify`}>
        <ExternalLink className="h-4 w-4" />
      </a>
    </li>
  );
}

export function ArtistRow({ id, name, image, aCount, bCount, aName, bName }: { id: string; name: string; image: string | null; aCount: number; bCount: number; aName: string; bName: string }) {
  const max = Math.max(aCount, bCount);
  return (
    <li className="flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-white/[0.04]">
      <Cover src={image} alt={name} round />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{name}</p>
        <div className="mt-1.5 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-xs text-white/50">
          <span className="max-w-[6rem] truncate">{aName}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <span className="block h-full rounded-full bg-mint" style={{ width: `${(aCount / max) * 100}%` }} />
          </span>
          <span className="tabular-nums">{aCount}</span>
          <span className="max-w-[6rem] truncate">{bName}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <span className="block h-full rounded-full bg-violet" style={{ width: `${(bCount / max) * 100}%` }} />
          </span>
          <span className="tabular-nums">{bCount}</span>
        </div>
      </div>
      <a href={artistUrl(id)} target="_blank" rel="noopener noreferrer" className="rounded-full p-2 text-white/40 transition hover:bg-white/10 hover:text-mint" aria-label={`Open ${name} in Spotify`}>
        <ExternalLink className="h-4 w-4" />
      </a>
    </li>
  );
}
