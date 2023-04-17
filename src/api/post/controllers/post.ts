/**
 * post controller
 */

import { factories } from "@strapi/strapi";
import axios from "axios";
// import { File, FormData } from "formdata-node";
import https from "https";

// At request level
const agent = new https.Agent({
  rejectUnauthorized: false,
});

export default factories.createCoreController(
  "api::post.post",
  ({ strapi }) => ({
    async import(ctx) {
      const posts = []
      try {


        const { data } = await axios.get(
          "http://masteringbackend.solomoneseme.com/api/get_posts?count=80",
          { httpsAgent: agent }
        );



        if (!data?.posts?.length) return;


        for (const post of data?.posts) {
          console.log('asa')
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
            // thumbnail,
            // attachments
          } = post;
          try {
            // featured_image functionality here that we built
            // // now that we have fileId we can complete our postData object
            const postData = {
              title,
              content,
              slug,
              is_sticky,
              excerpt,
              // image: [blob],
              publishedAt: date,
              createdAt: date,
            };

            let authors = [];

            let oldAuthors = await strapi.entityService.findMany(
              "api::author.author",
              {
                filters: { slug: { $eq: author.slug } },
              }
            );

            if (oldAuthors?.length) {
              authors.push(oldAuthors[0].id);
            } else {
              const entry = await strapi
                .service("api::author.author")
                .create({
                  data: {
                    name: author.name,
                    slug: author.slug,
                    first_name: author.first_name,
                    last_name: author.last_name,
                    url: author.url,
                    nickname: author.nickname,
                    description: author.description,
                  },
                });

              authors.push(entry.id);
            }

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
              } else {
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
              }
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
              } else {

                const entry = await strapi.service("api::tag.tag").create({
                  data: {
                    name: tag.title,
                    slug: tag.slug,
                    description: tag.description,
                  },
                });

                newTags.push(entry.id);
              }
            });

            // use the strapi services create function to create entry
            let newPost = await strapi.entityService.findMany(
              "api::post.post",
              {
                filters: { slug: { $eq: post.slug } },
              }
            );

            if (!newPost?.length) {
              newPost = await strapi.service("api::post.post").create({
                data: {
                  ...postData,
                  author: { connect: authors },
                  categories: { connect: cats },
                  tags: { connect: newTags },
                },
              });
              posts.push(newPost)
            }

          } catch (error) {
            console.error(error)
          }
        }


      } catch (error) {
        console.log(error?.message ?? error)
      }

      ctx.send(posts);
    },
  })
);
