/**
 * One-off backfill for post.read_time.
 *
 * Existing posts predate the read_time field, so they have no value until they
 * are next saved. This walks every post, computes read_time from content, and
 * writes it via the Query Engine.
 *
 * Query Engine (not Document Service) is deliberate:
 *   - it bypasses entity validation, so we don't trip over non-writable fields
 *   - it does not touch updatedAt, so a backfill doesn't make every post look
 *     freshly edited
 *   - it writes the draft and published rows independently, which is what we
 *     want since both are read depending on the endpoint
 *
 * Run from the project root, after `yarn build`:
 *
 *   node scripts/backfill-read-time.js
 *
 * Safe to re-run. Pass --force to recompute values that are already set:
 *
 *   node scripts/backfill-read-time.js --force
 */

const { compileStrapi, createStrapi } = require("@strapi/strapi");

const WORDS_PER_MINUTE = 200;
const BATCH_SIZE = 100;
const FORCE = process.argv.includes("--force");
const DRY_RUN = process.argv.includes("--dry-run");

function htmlToText(html) {
  return String(html ?? "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function calculateReadTime(content) {
  const text = htmlToText(content);
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

async function main() {
  const appContext = await compileStrapi();
  const strapi = await createStrapi(appContext).load();

  let offset = 0;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  try {
    for (;;) {
      // Query Engine returns every row — both draft and published versions.
      const rows = await strapi.db.query("api::post.post").findMany({
        select: ["id", "documentId", "title", "content", "read_time"],
        limit: BATCH_SIZE,
        offset,
        orderBy: { id: "asc" },
      });

      if (!rows.length) break;

      for (const row of rows) {
        scanned += 1;

        if (!FORCE && typeof row.read_time === "number" && row.read_time > 0) {
          skipped += 1;
          continue;
        }

        const readTime = calculateReadTime(row.content);

        if (row.read_time === readTime) {
          skipped += 1;
          continue;
        }

        if (!DRY_RUN) {
          await strapi.db.query("api::post.post").update({
            where: { id: row.id },
            data: { read_time: readTime },
          });
        }

        updated += 1;
        console.log(
          `  ${DRY_RUN ? "[dry-run] " : ""}#${row.id} ${String(row.title ?? "").slice(0, 60)} -> ${readTime} min`
        );
      }

      offset += rows.length;
    }

    console.log(
      `\nDone. scanned=${scanned} updated=${updated} skipped=${skipped}${DRY_RUN ? " (dry run, nothing written)" : ""}`
    );
  } finally {
    await strapi.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
