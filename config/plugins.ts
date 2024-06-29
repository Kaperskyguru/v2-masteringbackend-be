export default ({ env }) => ({
  upload: {
    config: {
      provider: "aws-s3",
      providerOptions: {
        accessKeyId: env("AWS_ACCESS_KEY_ID"),
        secretAccessKey: env("AWS_ACCESS_SECRET"),
        region: env("AWS_REGION"),
        params: {
          Bucket: env("AWS_BUCKET_NAME"),
        },
      },
    },
  },

  slugify: {
    enabled: true,
    config: {
      shouldUpdateSlug: true,
      contentTypes: {
        post: {
          field: "slug",
          references: "title",
        },
        project: {
          field: "slug",
          references: "title",
        },

        hub: {
          field: "slug",
          references: "title",
        },

        chapter: {
          field: "slug",
          references: "title",
        },

        category: {
          field: "slug",
          references: "name",
        },

        tag: {
          field: "slug",
          references: "name",
        },
      },
    },
  },
});
