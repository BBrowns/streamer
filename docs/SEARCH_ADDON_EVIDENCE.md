# Search add-on capability evidence

Validated on 2026-07-16. This document records protocol evidence, not a list
of providers to hardcode into the product.

## Root cause

The former Search implementation determined that an installed add-on could be
searched from its broad resource/type declarations, then called
`findCatalogId(manifest, type)`. That helper returns the first catalog for the
requested content type. It never checks whether that catalog declares the
Stremio `search` extra.

That assumption produces both false positives and wrong results:

- TorrentClaw's first movie catalog is `tc-upgrade`. Sending a Matrix search to
  it returned five PRO promotional cards with HTTP 200.
- TorrentClaw's first series catalog is `tc-trending`. Sending a Breaking Bad
  search to it returned the provider's trending series rather than the queried
  title, also with HTTP 200.
- NoTorrent's first series catalog is `netflix`. It does not declare search and
  returned an empty result for the same unsupported search path.
- Stream-only add-ons must not become metadata-search providers merely because
  they support movie or series stream IDs.

The capability signal is therefore the individual catalog definition:

1. its type is `movie` or `series` and is present in `manifest.types`;
2. one of its `extra` entries has `name: "search"`.

Do not additionally require a `catalog` resource declaration. TorrentClaw
serves working `tc-search` catalog routes but its current manifest only lists
`stream` and `meta` resources. The catalog plus search-extra declaration is the
authoritative evidence in this deployed manifest.

## Public manifest matrix

| Manifest                                             | Relevant declared capability                                   | Search classification                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `https://torrentio.strem.fun/manifest.json`          | Stream resource; no catalogs                                   | Not searchable                                                                                                |
| `https://addon.notorrent2.workers.dev/manifest.json` | Seven series catalogs; none has a search extra                 | Browse-only                                                                                                   |
| `https://torrentclaw.com/api/stremio/manifest.json`  | Eighteen catalogs; movie and series `tc-search` declare search | Searchable for movie and series                                                                               |
| `https://cinemeta.ratingposterdb.com/manifest.json`  | Movie and series `top` declare search                          | Search-capable, but the unconfigured public route returned HTTP 500 and must behave as a provider failure     |
| `https://comet.elfhosted.com/manifest.json`          | Stream resource; no catalogs                                   | Not searchable                                                                                                |
| `https://v3-cinemeta.strem.io/manifest.json`         | Movie and series `top` declare search                          | Searchable for movie and series; this is also the searchable add-on present in the local development database |

## Reproducible live queries

TorrentClaw provides a real, configuration-free positive path:

```sh
curl --fail --silent --show-error --max-time 20 \
  'https://torrentclaw.com/api/stremio/catalog/movie/tc-search/search=The%20Matrix.json'
```

The response contained 50 metas and its first result was
`movie:tt0133093` — **The Matrix**. The equivalent series query was:

```sh
curl --fail --silent --show-error --max-time 20 \
  'https://torrentclaw.com/api/stremio/catalog/series/tc-search/search=Breaking%20Bad.json'
```

Its first result was `series:tt0903747` — **Breaking Bad**.

The previous algorithm can be reproduced by substituting the first catalogs:

```text
/catalog/movie/tc-upgrade/search=The%20Matrix.json
/catalog/series/tc-trending/search=Breaking%20Bad.json
```

Both requests returned HTTP 200 but semantically unrelated content. This is why
transport success and non-empty arrays did not prove Search was correct.

## Automated evidence

`server/tests/search-addon.integration.test.ts` installs add-ons through the
real application endpoint and searches through `/api/search`. Its local HTTP
fixture deliberately mirrors the deployed edge case:

- browse-only catalogs precede the search catalogs;
- search works for movie and series independently;
- `catalog` is omitted from `resources`;
- an additional searchable provider fails while healthy results remain;
- browse-only and stream-only manifests yield no attempts;
- an honest no-match response remains distinct from no provider.

The test creates a random PostgreSQL schema and drops only that schema after the
run. From the `server` workspace, run the deterministic matrix with:

```sh
DOTENV_CONFIG_PATH=.env node -r dotenv/config \
  ../node_modules/vitest/vitest.mjs run tests/search-addon.integration.test.ts
```

To include the opt-in deployed-provider proof:

```sh
RUN_REAL_ADDON_SEARCH_E2E=1 DOTENV_CONFIG_PATH=.env node -r dotenv/config \
  ../node_modules/vitest/vitest.mjs run tests/search-addon.integration.test.ts
```

The live case installs TorrentClaw from its manifest URL through Streamer's
add-on API, submits `The Matrix` as a movie result search with limit 6, and
requires `tt0133093` plus provider provenance in the application response.
