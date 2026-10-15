# Scotty's MusicMatch

Compare Spotify libraries (Liked Songs plus your own playlists) with friends. Live at **https://scottymatch.netlify.app**.

You connect Spotify and get a link. Anyone you send it to can connect their Spotify and see what you share: songs you both liked, artists you both like, a taste-match score, eras, genres, mainstream vs deep cuts, who found each shared song first, and songs to steal from each other. Shared songs can be saved as a Spotify playlist.

## How it works

- **Login**: Spotify Authorization Code with PKCE, straight from the browser. No client secret, no server session. (The 2024 version used the implicit grant, which Spotify shut off on 2025-11-27. That's why it stopped working.)
- **Your link** (`/c/<id>`): your Liked Songs and the playlists you own or collaborate on, saved as gzipped JSON in Netlify Blobs. Works for any number of people. Each person who connects gets their own results page, `/c/<id>/<their-id>`.
- **Results are snapshots** from when each person connected. "Update my songs" on your link page refreshes your side and re-scores every friend. A friend refreshes theirs by opening your link and connecting again.
- **Your link page** lists everyone who compared with you, ranked by match. Only the device that made the link has the owner key. Opening your own link on another device and connecting with the same Spotify account hands that device the key too.
- **Uploads are verified.** The server calls Spotify `/me` with the uploader's token, so nobody can post a library under someone else's name.
- **Deleting a link** removes everything under it and purges the CDN cache.

| Path | What |
| --- | --- |
| `src/lib/auth.ts` | PKCE login, token refresh |
| `src/lib/spotify.ts` | Liked Songs + own/collaborative playlists (8 parallel pages, deduped, earliest add date wins), artist photos and genres, playlist creation |
| `src/lib/compare.ts` | Matching (track id, then ISRC, then normalized title + lead artist) and all the analysis |
| `src/lib/connect.ts` | What happens after Spotify sends you back: make a link, join one, refresh, or save a playlist |
| `server/share.ts` | Share API, platform-neutral (`Request` in, `Response` out) |
| `netlify/functions/share.mts` | Wires the API to Netlify Blobs and cache purging at `/api/share` |
| `netlify/edge-functions/link-preview.ts` | Rewrites Open Graph tags on `/c/*` for link unfurlers only, so a pasted link says who sent it |

## Spotify app setup

The app is **ComparisonApp** (client ID in `.env`) at https://developer.spotify.com/dashboard. It's in Development Mode, which means:

- **Only accounts on the app's User Management list can connect.** Anyone else gets "Spotify blocked this account". Since Feb 2026 new apps get 5 users. This app kept the 8 it already had, but it can't add anyone new until it's below 5. Removing people frees nothing until then, so think before you remove anyone.
- The app owner's Spotify account needs Premium or the app stops working.
- Redirect URIs must be HTTPS, or loopback IPs for local dev. `localhost` is rejected. Registered: `https://scottymatch.netlify.app/callback` and `http://127.0.0.1:5173/callback`.

Getting past the user cap means Spotify's Extended Quota Mode, which needs a registered business with real traffic.

## Develop

```bash
npm install
npx netlify-cli dev
```

That serves the app and the API on http://127.0.0.1:5173. Use 127.0.0.1, not localhost; the app redirects you if you forget.

```bash
npm test          # comparison logic + share API
npm run typecheck
npm run lint
```

## Deploy

```bash
npx netlify-cli deploy --build --prod
```

The Netlify site is `scottymatch`. Production is public; deploy previews sit behind Netlify login.

## Known limits

- Playlists: Spotify ignores `public: false` for this app. Saved playlists come out public but off your profile. The UI says so.
- 30-second previews only play for tracks where Spotify still returns `preview_url`.
- Genre and popularity analysis show up only when Spotify returns enough of that data.
