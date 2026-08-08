import slugify from "slugify";

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
      const config = SLUGIFIED_CONTENT_TYPES[context.uid];

      if (!config || !["create", "update"].includes(context.action)) {
        return next();
      }

      const data = (context.params as any)?.data;
      if (!data) return next();

      const source = data[config.references];

      // On create, always derive the slug when the source field is present and
      // no slug was supplied explicitly.
      if (context.action === "create") {
        if (!data[config.field] && source) {
          data[config.field] = toSlug(source);
        }
        return next();
      }

      // On update, regenerate only when the source field is actually being
      // changed and the caller did not set the slug themselves. This matches
      // the old plugin's shouldUpdateSlug: true.
      if (source && data[config.field] === undefined) {
        data[config.field] = toSlug(source);
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
