export default ({ env }) => ({
  upload: {
    config: {
      provider: "aws-s3",
      providerOptions: {
        s3Options: {
          credentials: {
            accessKeyId: env("AWS_ACCESS_KEY_ID"),
            secretAccessKey: env("AWS_ACCESS_SECRET"),
          },
          region: env("AWS_REGION"),
          params: {
            ACL: env("AWS_ACL", "public-read"),
            Bucket: env("AWS_BUCKET_NAME"),
          },
        },
      },
      actionOptions: {
        upload: {},
        uploadStream: {},
        delete: {},
      },
    },
  },

  // NOTE: strapi-plugin-slugify was removed during the v5 upgrade — it has no
  // Strapi 5 release (last published 2.3.8, pinned to @strapi/strapi ^4.14.0).
  // Slug generation is now handled by a Document Service middleware registered
  // in src/index.ts. Content types and source fields are configured there.
});
