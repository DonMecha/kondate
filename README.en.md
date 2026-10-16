# kondate

[日本語](README.md) | English

A prototype shopping agent that adapts tonight's dinner plan to the stock and sales at nearby grocery stores. Import a price tag from a photo, and each store's total and ranking update on the spot. It has a phone view and a projector view.

**All stores, products, prices, stock levels, and travel times are fictional demo data.** It contains no real store data, no scraping, and no ordering or purchasing features. The UI is in Japanese.

![Projector view after a price tag import: the fictional store moves up to first place](docs/screenshots/stage-after-1920.png)

| Phone: compare | Phone: confirm a price tag | Phone: shopping list |
|---|---|---|
| ![](docs/screenshots/mobile-390.png) | ![](docs/screenshots/mobile-capture-390.png) | ![](docs/screenshots/mobile-list-390.png) |

## Features

- Parses a request such as "nikujaga for 3, under ¥2,000" into a dish, servings, budget, and excluded ingredients.
- Matches ingredients across four fictional stores and ranks them by total cost, considering stock, pack counts, and sales. Ingredients with unknown stock never count as available.
- When an item is out of stock, over budget, or overpriced, it compares substitutions defined in the recipe (e.g. sliced beef → pork offcuts) with the price difference and reason.
- An AI reads candidates from a price tag photo, and a person confirms them before they update the price data. Updates reach the projector view via Server-Sent Events: the row glows, the total counts down, and the ranking reorders.
- Shows the shopping list for the chosen store in aisle order and saves it as text.

Money is computed as integers in hundredths of a yen. The AI never computes prices or decides stock.

## Getting started

Requires Node.js 24 or later and npm. The database is Node's built-in SQLite.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. To build, run, and test:

```sh
npm run build
npm start
```

```sh
npm test
```

Installing dependencies needs a network connection. After that, the default `scripted` provider runs offline. Fonts are bundled, and if map tiles cannot load, the app falls back to a store list.

## AI providers

Set these environment variables for the server process.

| Variable | Default / purpose |
|---|---|
| `AI_PROVIDER` | `scripted` (fixed demo responses, no OCR) or `ollama` |
| `OLLAMA_URL` | `http://127.0.0.1:11434`, using Ollama's `/api/chat` |
| `OLLAMA_TEXT_MODEL` | `qwen3:30b-a3b-instruct-2507-q4_K_M` |
| `OLLAMA_VISION_MODEL` | `qwen3-vl:32b` |
| `OLLAMA_TIMEOUT_MS` | `180000`, at most two requests including one retry |
| `HOST` / `PORT` | `127.0.0.1` / `3000` |
| `MAP_LAT` / `MAP_LNG` | Initial map center. Store coordinates are fixed demo values |

- AI output is validated against a JSON schema and retried once. After two failures, the app falls back to registered recipes and manual price entry.
- Missing models are never downloaded automatically.
- `anthropic` / `openai` are placeholders only. No external API calls are implemented.

## Projector view and venue setup

The phone view is at `/` and the hands-off projector view is at `/stage`. Open `http://127.0.0.1:3000/stage` on the presenting computer.

Only when phones need to join over the local network, start with:

```sh
HOST=0.0.0.0 npm start
```

- A random 256-bit key is created on every start. Write APIs and captured images require it.
- The QR code on the projector view encodes `http://<LAN IPv4>:<PORT>/?k=<key>`. After scanning, the key is removed from the URL and exchanged for an HttpOnly, SameSite=Strict cookie.
- The key lives only in memory, never in files or localStorage. The keyed QR code is served only to the server itself.
- Traffic is plain HTTP and is not encrypted. Use it only on a trusted LAN, never expose it to the internet, and do not import photos of real people or personal information.
- On machines with several networks, the first IPv4 address found is used for the QR code.

## Demo script (about 90 seconds)

1. Open `/stage` on the computer and scan the QR code with a phone. Send "今夜は肉じゃが、3人分、2,000円以内".
2. Watch the map and the four-store ranking. The top store is out of sliced beef. Switching to pork offcuts completes the list, bringing the reference total from ¥1,280 to ¥890.
3. Choose a store under "値札を撮る" and photograph a price tag (sample: [docs/price-label.png](docs/price-label.png), or run `node scripts/fixture.mjs`). After you confirm the values and stock, that store drops from ¥960 to ¥780 and moves from second to first.
4. Tap "この店で買う" to see the shopping list in aisle order.

"データを戻す" resets prices, photos, and the current request. For a full reset, stop the server, delete `data/`, and start again.

## Data

- SQLite: `data/kondate.sqlite`. Captured images are stored in `data/captures/` as PNGs with location metadata removed. Originals are not kept.
- `data/`, dependencies, and build output are not tracked by Git.

## Limitations

- Check the phone camera, voice input, and venue network on your own devices. HEIC images are not supported.
- Prices are totals of whole packs, not weighed amounts. Tax on pre-tax prices is truncated below a hundredth of a yen and does not reproduce any store's rounding.
- The map uses OpenStreetMap tiles, with fictional stores placed on a real map.

## License

[MIT](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency and bundled font licenses. Map data © OpenStreetMap contributors.
