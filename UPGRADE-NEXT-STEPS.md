# Strapi 5 upgrade — what's done and what you need to run

Branch: `upgrade/strapi-5` (created, checked out). **Nothing is committed** — see caveat below.

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

### Things I flagged but did not change

`postData` still sets `publishedAt` and `createdAt` from the source feed. v5's Document Service handles publication state differently from v4, so the historical dates may not be preserved the way they were. Check one imported post's dates before trusting a full re-import.

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
