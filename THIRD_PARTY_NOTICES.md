# Third-party notices

The application source, fictional sample data, and screenshots are provided under the MIT license in [LICENSE](LICENSE).

Dependencies are installed by npm from the versions pinned in `package-lock.json`. They are not vendored in this repository and keep their own license files in `node_modules/`. This project's license does not replace them.

## Runtime dependencies

| Package | License |
|---|---|
| react, react-dom, scheduler | MIT |
| hono, @hono/node-server | MIT |
| zod | MIT |
| qrcode | MIT |
| leaflet | BSD-2-Clause |
| lucide-react | ISC |
| sharp | Apache-2.0 (its prebuilt libvips binaries are LGPL-3.0-or-later and are downloaded by npm) |

## Bundled fonts

The built app bundles these fonts through the `@fontsource` packages. They are licensed under the SIL Open Font License 1.1.

| Font | Package |
|---|---|
| Zen Kaku Gothic New | @fontsource/zen-kaku-gothic-new |
| Inter Tight | @fontsource/inter-tight |
| JetBrains Mono | @fontsource/jetbrains-mono |

## Map data

Map tiles are loaded at runtime from OpenStreetMap. Map data © OpenStreetMap contributors, available under the Open Database License. Tile use must follow the OpenStreetMap Foundation tile usage policy. For heavy or public use, switch to a tile provider that permits it.

## Development tools

Development dependencies (TypeScript, Vite, tsx, Playwright, Prettier, and others) retain their own licenses.
