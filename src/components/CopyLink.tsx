import { useRef, useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';

export default function CopyLink({ url, shareText, label = 'Copy link' }: { url: string; shareText: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const input = useRef<HTMLInputElement>(null);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      // Clipboard blocked (some in-app browsers). Select the text so a long-press or Cmd+C works.
      input.current?.focus();
      input.current?.select();
      setState('manual');
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: 'Compare our Spotify songs', text: shareText, url });
    } catch {
      // User closed the share sheet.
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          ref={input}
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-full border border-line bg-black/40 px-5 py-3 font-mono text-sm text-white/80 outline-none focus:border-mint/60"
          aria-label="Link"
          data-testid="share-url"
        />
        <div className="flex gap-2">
          <button type="button" onClick={() => void copy()} className="btn-primary flex-1 sm:flex-none">
            {state === 'copied' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {state === 'copied' ? 'Copied' : label}
          </button>
          {canShare && (
            <button type="button" onClick={() => void share()} className="btn-secondary flex-1 sm:flex-none">
              <Share2 className="h-4 w-4" />
              Share
            </button>
          )}
        </div>
      </div>
      {state === 'manual' && <p className="mt-2 text-sm text-white/55">Your browser blocked copying. The link is selected, so copy it from the box.</p>}
    </div>
  );
}
