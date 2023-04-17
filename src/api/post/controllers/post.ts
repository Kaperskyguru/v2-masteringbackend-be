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

export default factories.createCoreController(
  "api::post.post",
  ({ strapi }) => ({
    async import(ctx) {
      const { data } = await axios.get(
        "http://masteringbackend.solomoneseme.com/api/get_posts?count=72",
        { httpsAgent: agent }
      );

      if (!data?.posts?.length) return;

      const posts = await Promise.all(
        data.posts.map(
          (post) =>
            new Promise(async (resolve, reject) => {
              //resolve when the post is created

              const {
                title,
                slug,
                content,
                date,
                is_sticky,
                excerpt,
                categories,
                tags,
                // thumbnail: image,
              } = post;
              try {
                // featured_image functionality here that we built
                // out with our helper functions
                // let downloaded: unknown = null;
                // if (image) {
                //   downloaded = await strapi
                //     .service("api::post.post")
                //     .downloadImage(image);
                // }
                // let file: unknown = null;
                // if (downloaded) {
                //   let [{ id: fileId }] = await strapi
                //     .service("api::post.post")
                //     .uploadImage(downloaded);
                //   file = fileId;
                // }
                // // now that we have fileId we can complete our postData object
                const postData = {
                  title,
                  content,
                  slug,
                  is_sticky,
                  excerpt,
                  //   image: [file],
                  publishedAt: date,
                  createdAt: date,
                };

                // Import Categories
                let cats = [];
                await categories.map(async (cat: any) => {
                  let oldCats = await strapi.entityService.findMany(
                    "api::category.category",
                    {
                      filters: { slug: { $eq: cat.slug } },
                    }
                  );

                  if (oldCats?.length) {
                    cats.push(oldCats[0].id);
                    return;
                  }
                  const entry = await strapi
                    .service("api::category.category")
                    .create({
                      data: {
                        name: cat.title,
                        slug: cat.slug,
                        description: cat.description,
                      },
                    });

                  cats.push(entry.id);
                });

                // Import Tags
                let newTags = [];
                await tags.map(async (tag: any) => {
                  let oldTags = await strapi.entityService.findMany(
                    "api::tag.tag",
                    {
                      filters: { slug: { $eq: tag.slug } },
                    }
                  );

                  console.log(oldTags);
                  if (oldTags?.length) {
                    newTags.push(oldTags[0].id);
                    return;
                  }

                  const entry = await strapi.service("api::tag.tag").create({
                    data: {
                      name: tag.title,
                      slug: tag.slug,
                      description: tag.description,
                    },
                  });

                  newTags.push(entry.id);
                });

                // use the strapi services create function to create entry
                let newPost = await strapi.entityService.findMany(
                  "api::post.post",
                  {
                    filters: { slug: { $eq: post.slug } },
                  }
                );

                if (!newPost?.length)
                  newPost = await strapi.service("api::post.post").create({
                    data: {
                      ...postData,
                      categories: { connect: cats },
                      tags: { connect: newTags },
                    },
                  });
                resolve(newPost);
              } catch (err) {
                reject(err);
              }
            })
        )
      );
      ctx.send(posts);
    },
  })
);
