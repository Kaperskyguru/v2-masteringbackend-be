/**
 * post controller
 */

import { factories } from "@strapi/strapi";
import axios from "axios";
import https from "https";

// At request level
const agent = new https.Agent({
  rejectUnauthorized: false,
});

/**
 * Find an existing entry by slug, or create it. Returns the documentId.
 *
 * Strapi 5: relations are connected by `documentId` (a string), not the numeric
 * `id` that v4 used. Returning the wrong one fails silently — the entry is
 * created but the relation is simply not linked.
 */
const findOrCreateBySlug = async (
  uid: any,
  slug: string,
  data: Record<string, unknown>
): Promise<string | null> => {
  if (!slug) return null;

  const existing = await strapi.documents(uid).findMany({
    filters: { slug: { $eq: slug } },
    limit: 1,
  });

  if (existing?.length) {
    return existing[0].documentId;
  }

  const entry = await strapi.documents(uid).create({ data });
  return entry.documentId;
};

export default factories.createCoreController(
  "api::post.post",
  ({ strapi }) => ({
    async import(ctx) {
      const posts = [];

      try {
        const { data } = await axios.get(
          "http://masteringbackend.solomoneseme.com/api/get_posts?count=80",
          { httpsAgent: agent }
        );

        if (!data?.posts?.length) return;

        for (const post of data.posts) {
          const {
            title,
            slug,
            content,
            date,
            is_sticky,
            excerpt,
            categories,
            tags,
            author,
            thumbnail,
          } = post;

          try {
            // NOTE: createdAt / publishedAt are deliberately NOT set here.
            // Strapi 5 validates create/update input and rejects non-writable
            // fields and internal timestamps (createdAt, createdBy, ...) with a
            // 400. v4's Entity Service allowed them through. The original
            // dates are restored via the Query Engine after create — see below.
            const postData = {
              title,
              content,
              slug,
              is_sticky,
              excerpt,
            };

            // --- Author ---
            const authorId = await findOrCreateBySlug(
              "api::author.author",
              author?.slug,
              {
                name: author?.name,
                slug: author?.slug,
                first_name: author?.first_name,
                last_name: author?.last_name,
                url: author?.url,
                nickname: author?.nickname,
                description: author?.description,
              }
            );

            // --- Categories ---
            // Was `await categories.map(async ...)`, which awaits the array of
            // promises rather than the promises themselves — `cats` was always
            // empty by the time the post was created below.
            const cats = (
              await Promise.all(
                (categories ?? []).map((cat: any) =>
                  findOrCreateBySlug("api::category.category", cat?.slug, {
                    name: cat?.title,
                    slug: cat?.slug,
                    description: cat?.description,
                  })
                )
              )
            ).filter(Boolean) as string[];

            // --- Tags ---
            const newTags = (
              await Promise.all(
                (tags ?? []).map((tag: any) =>
                  findOrCreateBySlug("api::tag.tag", tag?.slug, {
                    name: tag?.title,
                    slug: tag?.slug,
                    description: tag?.description,
                  })
                )
              )
            ).filter(Boolean) as string[];

            // --- Post ---
            const existingPosts = await strapi
              .documents("api::post.post")
              .findMany({
                filters: { slug: { $eq: slug } },
                limit: 1,
              });

            if (!existingPosts?.length) {
              const newPost = await strapi.documents("api::post.post").create({
                data: {
                  ...postData,
                  // `author` is manyToOne — a to-one relation. v5 takes the
                  // documentId directly here; connect/disconnect/set are only
                  // valid on to-many relations (categories, tags below).
                  author: authorId,
                  is_public: true,
                  image: thumbnail,
                  categories: { connect: cats },
                  tags: { connect: newTags },
                },
                // v5 creates drafts by default. The source feed only contains
                // already-published posts, so publish on create.
                status: "published",
              });

              // Restore the original publication dates. The Document Service
              // refuses to write timestamps (see postData above), so drop to
              // the Query Engine, which bypasses entity validation.
              //
              // updateMany, not update: with Draft & Publish a document has
              // both a draft and a published row, and both need the date for
              // sorting to be consistent regardless of which version is read.
              if (date) {
                await strapi.db.query("api::post.post").updateMany({
                  where: { documentId: newPost.documentId },
                  data: { createdAt: date, publishedAt: date },
                });
              }

              posts.push(newPost);
            }
          } catch (error) {
            console.error(error);
          }
        }
      } catch (error) {
        console.log(error?.message ?? error);
      }

      // The Document Service is a data-access layer and returns UNSANITIZED
      // data — private fields and restricted relations included. Anything
      // returned from a controller must be sanitized explicitly.
      ctx.send(await this.sanitizeOutput(posts, ctx));
    },
  })
);
