# Rich Telegram Ads

A Chrome extension that adds bulk editing to [ads.telegram.org](https://ads.telegram.org).

The platform only lets you add targets one at a time and edit ads one by one.
This extension adds bulk input and bulk actions on top of the existing UI.

## Features

**New ad page**

- Bulk add channels, bots, users, or search queries — paste a list, one per line
- Splits a list longer than the per-ad limit into several ads automatically
- Shows the total budget before creating, since budget is charged per ad
- Failed lines stay in the box with the reason, so you can fix and retry

**Account page**

- Checkbox on every ad row, plus select all
- Add to budget, withdraw from budget, set status, or delete — in bulk
- Keeps going if one ad fails, and shows a log of what happened

## Install (development)

```bash
pnpm install
pnpm build
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**,
and select the `dist` folder.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm build` | Compile to `dist/` |
| `pnpm watch` | Rebuild on change, unminified |
| `pnpm package` | Build and zip `dist/` for the Chrome Web Store |
| `pnpm typecheck` | Type-check with no output |
| `pnpm lint` | Check code with Biome |
| `pnpm format` | Format code with Biome |

## Structure

```
src/
  manifest.json
  icons/
  types/          ambient types for page globals
  content/
    index.ts      entry point, routes by page
    new-ad.ts      bulk add + ad splitting
    owner-ads.ts   bulk actions on the ads list
    lib/           shared helpers (api, limits, resolve, utils)
scripts/
  build.mjs        esbuild bundle
  zip.mjs          zip dist/ for the store
```

## How it works

The content script runs in the page's `MAIN` world so it can call the site's
own `Aj`, `NewAd`, and `OwnerAds` objects directly, instead of reimplementing
the API. It depends on those internals, so a change on Telegram's side can
break it.

Requests run one at a time with a short delay between them. Creating ads and
moving budget cost real money — the extension shows totals and asks for
confirmation before bulk actions run.

## License

MIT — see [LICENSE](LICENSE).
