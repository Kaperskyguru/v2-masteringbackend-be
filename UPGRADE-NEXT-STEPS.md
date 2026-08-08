# Strapi 5 upgrade — what's done and what you need to run

Branch: `upgrade/strapi-5` (created, checked out). **Nothing is committed** — see caveat below.

---

## ⚠️ Deploy order — the frontend depends on the backend

The blog's list queries select `read_time`. Strapi 5 validates query parameters and returns **400 Bad Request** for a field that doesn't exist on the content type. So deploying the blog before the CMS takes the homepage down.

This is what caused the `400 Bad Request` on `getPosts` / `getStickyPosts` during local development: the local blog points at production Strapi, which doesn't have the field yet.

Deploy in this order, and don't skip the gates:

| # | Step | Gate before continuing |
|---|---|---|
| 1 | Deploy CMS with the v5 upgrade **and** the `read_time` field | Admin panel loads, `post` shows a Read time field |
| 2 | Restart Strapi so the schema registers | `GET /api/posts?fields[0]=read_time` returns 200, not 400 |
| 3 | Run `node scripts/backfill-read-time.js` | Spot-check a few posts have sensible minute values |
| 4 | In `mb-blog/.env`, delete `STRAPI_HAS_READ_TIME=false` | — |
| 5 | Deploy the blog | Homepage lists posts; read-time badges render |

Steps 1–3 are safe to ship on their own — the currently-live blog doesn't know about `read_time` and is unaffected by the field existing.

### The `STRAPI_HAS_READ_TIME` switch

`fields` is an allowlist and Strapi 5 validates it, so naming a field the content type doesn't have fails the **entire request** with `400 Invalid key read_time` — it isn't silently ignored. That's what took the local homepage down while pointing at production Strapi.

`STRAPI_HAS_READ_TIME=false` drops `read_time` from list queries so the blog works against a CMS that doesn't have it yet. It's currently set to `false` in `mb-blog/.env`. The code defaults to `true`, which is the correct steady state — so once the CMS is deployed, just delete the line rather than flipping it.

While it's off, read-time badges are hidden (the card markup omits them rather than rendering "0 min read"). Everything else works normally.

Note `.env` changes need a dev server restart to take effect.

---

## Two things I could not do from here

**1. Git commits.** The sandbox can't write `.git/index.lock` through the folder mount, so `git commit` fails. There's a stale lock file left behind. Clear it and commit yourself:

```sh
rm -f .git/index.lock
git status
```

**2. `yarn install` / the upgrade tool.** I run on Linux; you're on macOS. Installing into the mounted folder would have written Linux-built native modules (`sharp`, `better-sqlite3`) into your project and broken it on your machine. So I applied the codemod changes by hand instead — the surface was small enough that this was cleaner than running the tool. You run the install locally.

---

## Run this locally

```sh
# 1. clear v4 build artifacts and deps
rm -rf node_modules yarn.lock .cache dist

# 2. delete the now-dead admin webpack config (I couldn't unlink files)
git rm src/admin/webpack.config.js

# 3. install Strapi 5
yarn install

# 4. build + run
yarn build
yarn develop
```

`src/admin/webpack.config.js` only existed to patch `tippy.js`, a dependency of `strapi-tiptap-editor`. Both are gone, and v5 uses Vite rather than webpack, so the file is dead either way.

**Back up your Postgres database before step 4** — the first v5 boot runs schema migrations against it.

```sh
pg_dump -Fc "$DATABASE_URL" > backup-pre-v5.dump
```

---

## What changed

### `package.json`
- `@strapi/strapi`, `@strapi/plugin-users-permissions`, `@strapi/provider-upload-aws-s3` → `5.51.2`
- **Removed** `@strapi/plugin-i18n` — i18n is core in v5
- **Removed** `strapi-plugin-slugify` — no v5 release exists (replaced, see below)
- **Removed** `strapi-tiptap-editor` — v4-only; was an admin editor skin over `richtext` fields, no data impact
- **Added** `react`, `react-dom`, `react-router-dom`, `styled-components` — now required peer deps
- `pg` 8.8.0 → 8.13.1; added `typescript` + `@types/node` as devDeps; added `engines`

### `config/plugins.ts`
S3 credentials restructured to the v5 shape: `providerOptions.s3Options.{credentials, region, params}`. Your env var names are unchanged (`AWS_ACCESS_KEY_ID`, `AWS_ACCESS_SECRET`, `AWS_REGION`, `AWS_BUCKET_NAME`). Added `actionOptions` and an explicit `ACL` (defaults to `public-read`, matching prior behaviour).

### `config/server.ts`
Added the `mcp` block. Gated behind `MCP_ENABLED`, defaulting to on in development only — so enabling MCP in production is a deliberate act, not something that ships silently.

### `config/middlewares.ts`
- `module.exports` → `export default` (v5 enforces stricter config file requirements)
- Removed the duplicate bare `"strapi::security"` entry that was overriding your CSP config

### `src/index.ts` — slug middleware
Replaces `strapi-plugin-slugify` with a Document Service middleware registered in `register()`. Same six content types, same source fields, same `shouldUpdateSlug: true` behaviour. Existing slug data is untouched.

### `src/api/post/controllers/post.ts` — rewritten
- 4 `strapi.entityService.findMany` → `strapi.documents(uid).findMany`
- The repeated find-or-create blocks for author/category/tag are now one `findOrCreateBySlug` helper
- **Relations now connect by `documentId`, not numeric `id`** — this is the change most likely to bite if missed; v5 accepts the wrong value silently and just doesn't link the relation
- `Promise.all` around the category/tag maps (the pre-existing bug)
- `create` now passes `status: "published"`, since v5 creates drafts by default

### `src/api/post/services/post.ts`
- `strapi.query(...)` → `strapi.db.query(...)`
- `strapi.config.get("plugin.upload")` → `strapi.config.get("plugin::upload")` (uid format)

---

## Verify after it boots

1. Admin panel loads, all 10 content types present, existing posts intact.
2. **Create a post in the admin with a title and no slug** — confirm the slug auto-generates. This is the riskiest replacement.
3. Rename a post's title, save, confirm the slug updates.
4. Upload an image to the Media Library — confirms the S3 config restructure took.
5. Hit the import endpoint and confirm imported posts have authors, categories **and tags** attached. On v4 the tags/categories were silently empty.

### Corrections made after checking the docs

Three things I got wrong on the first pass, found by verifying against the Strapi 5 documentation:

**`createdAt` / `publishedAt` on create would have thrown a 400.** Strapi 5 validates create/update input and rejects "non-writable fields and internal timestamps like `createdAt`". v4's Entity Service allowed them. Those fields are now omitted from the create call, and the original dates are restored afterwards via `strapi.db.query(...).updateMany()`, which bypasses entity validation. This matters for you specifically because the blog sorts by `createdAt:desc` — without it, every imported post would carry the import timestamp and the ordering would collapse.

`updateMany` rather than `update` is deliberate: with Draft & Publish a document has both a draft and a published row, and both need the date.

**Document Service output is unsanitized.** The docs are explicit: it's a data-access layer with no awareness of permissions or field visibility, and results "may include private fields, passwords, and restricted relations." The import action was sending raw documents straight to `ctx.send`. It now goes through `this.sanitizeOutput(posts, ctx)`.

**`limit` is valid after all.** I'd been unsure whether `limit: 1` was supported on `documents().findMany()` — the methods reference table omits it, but the Sort & Pagination page documents `limit` and `start` explicitly. Left as-is.

---

## Payload + SEO work (second pass)

`rest.maxLimit` stays at 100. The cap was never the real problem — the per-post weight was. The homepage was fetching every article body just to count words for the "N min read" label, which nothing else on the page used.

### Backend changes

- **New field**: `post.read_time` (integer, minutes).
- **`src/utils/read-time.ts`**: strips HTML before counting. The old frontend version counted raw markup, so tags and class names inflated every total — expect displayed read times to drop once backfilled. They were wrong before, not now.
- **`src/index.ts`**: the Document Service middleware now computes `read_time` alongside slugs, on create and update, whenever `content` is written and `read_time` wasn't set explicitly.

### Run the backfill once

Existing posts have no `read_time` until they're next saved. After deploying and restarting:

```sh
node scripts/backfill-read-time.js --dry-run   # see what it would change
node scripts/backfill-read-time.js
```

Safe to re-run; skips posts that already have a value unless you pass `--force`. It writes via the Query Engine, so it doesn't touch `updatedAt` — a backfill won't make every post look freshly edited.

The frontend falls back to computing read time from `content` when `read_time` is missing, but list queries no longer fetch `content`, so **un-backfilled posts will show no read time in lists** until the script runs. Cards hide the badge rather than showing "0 min read".

### Frontend changes (mb-blog)

- List queries now use explicit `fields[]` + `populate[]` and **never fetch `content`**. Wildcard `populate=*` is gone from every list endpoint — it was pulling `chapters`, `user` and `resource`, none of which the cards render.
- Homepage moved to **server-side pagination**, 12 per page, driven by `?page=`, `?q=` and `?category=`.
- Pagination renders real `<a href>` links. Previously it was `<button onClick>`, so pages 2+ had no URL and were unreachable by a crawler — the other ~94 posts were shipped to the browser as serialized props, which Google doesn't read as links. Full bandwidth cost, zero indexing benefit.
- Added `app/sitemap.ts` and `app/robots.ts`. There were none. This is the single biggest SEO fix here.
- Category list now comes from `/categories` instead of being derived by scanning every post — that scan was one of the reasons the page loaded everything at once.
- Search results are `noindex, follow` and canonical to `/`, so thin result pages don't compete with real content.

### Follow-up not done

The category, tag and author pages still fetch 100 posts and paginate client-side with buttons — same pattern the homepage just moved away from. They benefit from the slimmer queries and are covered by the sitemap, so posts are discoverable, but their own pagination remains uncrawlable. `Pagination` now supports both modes (`buildHref` for links, `onPageChange` for callbacks), so converting them is mostly mechanical when you want it.

The `download`/`upload` helpers in `post.ts` are unused (the `featured_image` import is commented out) and the `upload` one looks broken independently of this migration — `getStream: () => imgPath.data` doesn't reference anything real. I did a faithful API migration rather than rewriting logic. Worth deleting or fixing separately.

---

## Then: the frontend

Before pointing your blog at the upgraded API, add the compatibility header to your frontend's Strapi calls:

```
Strapi-Response-Format: v4
```

That keeps the old `data.attributes` shape working while you migrate. Then flatten the payload access and switch from `id` to `documentId` — **especially anywhere you look up posts by slug or cache references** — and remove the header per consumer once its tests pass.

---

## Finally: MCP

Once v5 is running (5.51.2 is well past the 5.47.0 minimum):

1. `MCP_ENABLED=true` in your env, restart.
2. Admin panel → **Settings → Admin tokens** → create a token, copy it once.
3. Scope it tightly to start: `post`, `category`, `tag` with read/create/update only. All 10 of your content types have `draftAndPublish: true`, so a full-permission token would expose ~80 tools — a lot of surface for a client to hold, and every one of them is a way for an agent to touch live content.
4. Connect:

```sh
claude mcp add strapi-mcp --transport http https://your-host/mcp \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Behind your reverse proxy, make sure `/mcp` is forwarded — easy to miss if the config only routes `/api` and `/admin`. It accepts POST only; a 405 on GET is expected, not a fault.

Note MCP can't upload media. Your `post` schema has `image` (string) and `featured_image` (media) — an agent can set `image` and reference an existing asset, but can't create one.
