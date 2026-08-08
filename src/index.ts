import slugify from "slugify";
import { calculateReadTime } from "./utils/read-time";

/**
 * Replacement for strapi-plugin-slugify, which has no Strapi 5 release
 * (last published 2.3.8, pinned to @strapi/strapi ^4.14.0).
 *
 * Mirrors the previous config/plugins.ts `slugify` block: the same content
 * types, the same source fields, and `shouldUpdateSlug: true` behaviour
 * (the slug is regenerated when the source field changes).
 */
const SLUGIFIED_CONTENT_TYPES: Record<string, { field: string; references: string }> = {
  "api::post.post": { field: "slug", references: "title" },
  "api::project.project": { field: "slug", references: "title" },
  "api::hub.hub": { field: "slug", references: "title" },
  "api::chapter.chapter": { field: "slug", references: "title" },
  "api::category.category": { field: "slug", references: "name" },
  "api::tag.tag": { field: "slug", references: "name" },
};

/**
 * Content types that carry a denormalised `read_time` derived from `content`.
 *
 * This exists so list endpoints never have to fetch `content`. The blog
 * homepage was pulling every article body purely to count words for the
 * "N min read" label — by far the largest part of that payload, and none of
 * it rendered. Storing the number here lets the frontend select a handful of
 * scalar fields instead.
 */
const READ_TIME_CONTENT_TYPES = ["api::post.post"];

const toSlug = (value: string) =>
  slugify(value, { lower: true, strict: true, trim: true });

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }) {
    strapi.documents.use(async (context, next) => {
      if (!["create", "update"].includes(context.action)) {
        return next();
      }

      const data = (context.params as any)?.data;
      if (!data) return next();

      // --- Slug generation ---
      const slugConfig = SLUGIFIED_CONTENT_TYPES[context.uid];
      if (slugConfig) {
        const source = data[slugConfig.references];

        if (context.action === "create") {
          // On create, always derive the slug when the source field is present
          // and no slug was supplied explicitly.
          if (!data[slugConfig.field] && source) {
            data[slugConfig.field] = toSlug(source);
          }
        } else if (source && data[slugConfig.field] === undefined) {
          // On update, regenerate only when the source field is actually being
          // changed and the caller did not set the slug themselves. This
          // matches the old plugin's shouldUpdateSlug: true.
          data[slugConfig.field] = toSlug(source);
        }
      }

      // --- Read time ---
      // Recompute whenever `content` is part of the write. If the caller set
      // read_time explicitly, respect it.
      if (
        READ_TIME_CONTENT_TYPES.includes(context.uid) &&
        typeof data.content === "string" &&
        data.read_time === undefined
      ) {
        data.read_time = calculateReadTime(data.content);
      }

      return next();
    });
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  bootstrap(/*{ strapi }*/) {},
};
