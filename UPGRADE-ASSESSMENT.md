# Strapi Upgrade Assessment — be-masteringbackend

**Current:** Strapi `4.7.0` · **Target:** `5.51.2` · Postgres · Node v22.22.3 · branch `main` (clean)

Verdict: **this is a small, tractable migration.** Total custom code is 481 lines, and only two files (`post` controller + service) are non-boilerplate. The usual v4→v5 killers are all absent. One real blocker: the slugify plugin.

---

## What's in your favour

| Check | Status |
|---|---|
| Admin panel customization | **None** — `src/admin/` only has `app.example.tsx` + config. No rewrite needed. |
| `@strapi/helper-plugin` usage | **None**. This is normally the biggest manual chunk. |
| Lifecycle hook files | **None**. |
| Custom fields in schemas | **None** — all fields are core types. |
| Database | Postgres + `pg`. Dodges the MySQL5 / `sqlite3` / `mysql`-driver breaking changes entirely. |
| Node version | v22 — supported by v5. |
| `.env` in git | Not tracked. Good. |
| Content types | 10, all boilerplate controllers/services/routes except `post`. |

The 8 other API folders (`author`, `category`, `chapter`, `hub`, `project`, `tag`, `topic`, `ai-blog`, `ai-tool`) are 7-line factory files. The codemods will handle them completely.

---

## Blockers and manual work

### 1. `strapi-plugin-slugify` — no v5 version exists ⛔

`strapi-plugin-slugify@2.3.8` (Nov 2023) declares `@strapi/strapi: ^4.14.0`. Latest published is still 2.3.8; there is no v5 release and no v5 dist-tag. The known forks (`strapi-plugin-slugify-transliteration`, `strapi-plugin-slug-transliterate`) are also v4-era.

This is load-bearing — it auto-generates slugs on **6 content types** (`post`, `project`, `hub`, `chapter` from `title`; `category`, `tag` from `name`), and `post.slug` is `required: true, unique: true`. If it silently stops firing, article creation breaks.

**Recommended fix: replace it with a Document Service middleware.** In v5 this is roughly 40 lines in `src/index.ts` — register a middleware that intercepts `create`/`update` on those UIDs and derives `slug` from the source field. That drops a dead dependency instead of inheriting an unmaintained fork, and it's less code than the plugin config it replaces.

Existing slug data is unaffected either way — slugs are plain string columns.

### 2. `strapi-tiptap-editor` — v4 only, but low risk ✅

`0.9.13` declares `@strapi/strapi: ^4.0.0`. Also v4-only.

**But** no schema uses `customField` — tiptap here only replaces the *admin editor UI* for `richtext` fields. Your content is stored as ordinary `richtext` strings across all 10 content types. Dropping the plugin changes what editors see in the admin panel; it does not touch data, the API, or your frontend.

So: remove it, ship the upgrade on v5's default editor, and evaluate a v5 rich-text plugin separately if the team misses it. Don't let this block the migration.

### 3. `entityService` → Document Service — 5 call sites

All in the post import path:

- `src/api/post/controllers/post.ts` — lines 64, 94, 122, 148 (`strapi.entityService.findMany` on author, category, tag, post)
- `src/api/post/services/post.ts` — line 83 (`strapi.query("plugin::upload.file").create(...)`)

The codemod converts most of this; the `findMany` → `strapi.documents(uid).findMany` swaps are mechanical. Watch for `oldAuthors[0].id` / `entry.id` (lines 72, 88, 102, 115, 131, 143) — in v5 relations connect by **`documentId`**, not numeric `id`. The codemod will not catch these; they'll fail silently and produce posts with no author/category/tag links.

### 4. S3 upload provider

`config/plugins.ts` has `accessKeyId` / `secretAccessKey` flat in `providerOptions`. v5 requires them nested in a `credentials` object. The `s3-keys-wrapped-in-credentials` codemod handles this — just verify it fired.

### 5. `config/middlewares.ts` — two issues

```js
module.exports = ({ env }) => [ ... ]
```

- It's the only config file using `module.exports` while the rest use ESM `export default`. v5 enforces stricter config-file requirements — normalize it.
- **Pre-existing bug:** `"strapi::security"` is listed **twice** — once as the configured object with your CSP directives, then again as a bare string immediately after. The bare entry re-registers the middleware with defaults, so your S3/airtable `img-src` and `media-src` allowances are likely not taking effect. Worth fixing while you're in here.

---

## Unrelated bug found in the import controller

`src/api/post/controllers/post.ts` lines 93 and 121:

```ts
await categories.map(async (cat: any) => { ... });
```

`.map()` returns an array of promises; `await` on the array itself resolves immediately without waiting. So `cats` and `newTags` are still empty when the post is created at line 156 — meaning imported posts get **no categories and no tags attached**. Should be `await Promise.all(categories.map(...))`.

Pre-existing on v4, not caused by the migration. Flagging it because you'll be touching these exact lines anyway.

---

## Sequencing

| # | Step | Gate |
|---|---|---|
| 0 | `pg_dump` prod; branch `upgrade/strapi-5`; clear `dist/` and `.cache/` | Backup restores cleanly |
| 1 | Decide the slugify replacement | — |
| 2 | `npx @strapi/upgrade minor` → 4.7.0 to 4.25.23 | Boots, admin loads, content intact |
| 3 | Remove `strapi-tiptap-editor` + `strapi-plugin-slugify` from `package.json` and `config/plugins.ts` | Still boots on v4 |
| 4 | `npx @strapi/upgrade major` | Deps resolve |
| 5 | Fix `__TODO__`s, the 5 call sites, `documentId` relations, middlewares.ts | Zero `__TODO__` |
| 6 | Implement slug middleware | Creating a post generates a slug |
| 7 | Frontend: `Strapi-Response-Format: v4` header, then migrate off it | Blog renders |
| 8 | Enable MCP | `/mcp` connects |

Step 2 is a 4.7.0 → 4.25.23 jump — 18 minor versions. Expect that one to surface its own small surprises before you ever get to v5.

---

## MCP notes specific to this project

All 10 content types have `draftAndPublish: true`, so a full-permission admin token would expose **~80 tools** (8 per collection type). That's a lot of tool surface for a client to hold. Scope the first token to `post`, `category`, `tag` with read/create/update — skip `delete` and `publish` until you trust it.

Also relevant here: **MCP cannot upload media.** Your `post` schema has both `image` (string) and `featured_image` (media). An AI client can set `image` and can reference an already-uploaded `featured_image` asset, but can't create one. Image-bearing posts still need the Media Library or your existing upload path first.

Config once on 5.47.0+ (`config/server.ts`):

```ts
mcp: { enabled: true },
```

Behind your reverse proxy, make sure `/mcp` is forwarded — it's easy to miss if your nginx config only routes `/api` and `/admin`. It accepts POST only; GET returns 405 by design.
