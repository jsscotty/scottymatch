import { useState } from 'react';
import { ArrowRight, Heart, Link2, Users } from 'lucide-react';
import { ADMIN_NAME } from '../config';
import { startLogin } from '../lib/auth';
import { formatDate } from '../lib/format';
import { getOwnedShares } from '../lib/shares';
import { Link, Spinner } from '../components/ui';

function VennArt() {
  return (
    <div aria-hidden className="relative mx-auto aspect-square w-full max-w-[340px]">
      <div className="absolute left-0 top-[12%] h-[76%] w-[76%] rounded-full bg-mint/80 mix-blend-screen blur-[1px]" />
      <div className="absolute right-0 top-[12%] h-[76%] w-[76%] rounded-full bg-violet/80 mix-blend-screen blur-[1px]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="spin-slow flex h-24 w-24 items-center justify-center rounded-full bg-ink shadow-2xl ring-1 ring-white/10">
          <div className="h-20 w-20 rounded-full bg-[repeating-radial-gradient(circle,#18181f_0,#18181f_2px,#0e0e13_3px,#0e0e13_5px)]" />
          <Heart className="absolute h-6 w-6 fill-white text-white" />
        </div>
      </div>
    </div>
  );
}

const steps = [
  { icon: Heart, title: 'Connect Spotify', body: 'We read your Liked Songs and the playlists you made. Takes a few seconds, longer for big libraries.' },
  { icon: Link2, title: 'Send your link', body: 'Text it, DM it, drop it in a group chat. Anyone you send it to can compare with you.' },
  { icon: Users, title: 'See what you share', body: 'Songs you both have, artists you both love, and songs to steal from each other.' },
];

export default function Home() {
  const [starting, setStarting] = useState(false);
  const owned = getOwnedShares();

  const connect = () => {
    setStarting(true);
    void startLogin({ kind: 'create' });
  };

  return (
    <div className="fade-up">
      <section className="grid items-center gap-10 pt-6 md:grid-cols-[1.15fr_1fr] md:pt-16">
        <div>
          <p className="eyebrow">Spotify libraries, side by side</p>
          <h1 className="mt-4 font-display text-[2.6rem] font-bold leading-[1.02] tracking-tight md:text-6xl">
            Find the songs you both love.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/70">
            Connect your Spotify and you get a link. Send it to a friend. Once they connect, you both see every song and artist you have in common.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3">
            <button type="button" onClick={connect} disabled={starting} className="btn-primary px-8 py-4 text-base">
              {starting ? <Spinner /> : <Heart className="h-5 w-5" />}
              Connect Spotify
            </button>
            <p className="max-w-md text-sm text-white/45">
              Heads up: Spotify only lets approved accounts into this app right now. If yours gets blocked, ask {ADMIN_NAME} to add you.
            </p>
          </div>
        </div>
        <VennArt />
      </section>

      {owned.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display text-xl font-semibold">Your links</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {owned.map((share) => (
              <li key={share.id}>
                <Link href={`/c/${share.id}`} className="card flex items-center justify-between gap-3 px-5 py-4 transition hover:border-mint/40">
                  <span>
                    <span className="block font-medium">{share.name}'s link</span>
                    <span className="text-sm text-white/50">Made {formatDate(share.createdAt)}</span>
                  </span>
                  <ArrowRight className="h-5 w-5 text-white/40" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-16 grid gap-4 md:grid-cols-3">
        {steps.map(({ icon: Icon, title, body }, index) => (
          <div key={title} className="card p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 font-display text-sm font-bold">{index + 1}</span>
              <Icon className="h-5 w-5 text-mint" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
            <p className="mt-1.5 text-white/60">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
