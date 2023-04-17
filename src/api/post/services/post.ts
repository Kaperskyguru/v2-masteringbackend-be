/**
 * post service
 */

import { factories } from "@strapi/strapi";
import axios from "axios";
import path from "path";
import fs from "fs";
import https from "https";
import slugify from "slugify";

// At request level
const agent = new https.Agent({
  rejectUnauthorized: false,
});

const download = async (url) => {
  // get the filename such as `image01.jpg`
  const name = path.basename(url);
  // we need to set a file path on our host where the image will be
  // downloaded to
  const filePath = `/tmp/${name}`;
  // create an instance of fs.writeStream
  const writeStream = fs.createWriteStream(filePath);
  // make a GET request and create a readStream to the resource
  const { data } = await axios.get(url, {
    responseType: "stream",
    httpsAgent: agent,
  });

  // pipe the data we receive to the writeStream
  data.pipe(writeStream);
  // return a new Promise that resolves when the event writeStream.on
  // is emitted. Resolves the file path

  return new Promise((resolve, reject) => {
    writeStream.on("finish", () => {
      resolve(filePath);
    });
    writeStream.on("error", reject);
  });
};

const upload = async (imgPath) => {
  // we want the file type without the "." like: "jpg" or "png"
  const ext = path.extname(imgPath).slice(1);
  // name of the file like image01.jpg
  const name = path.basename(imgPath);
  // read contents of file into a Buffer
  const buffer = fs.readFileSync(imgPath);
  // get the buffersize using service function from upload plugin

  const uploadProvider = strapi.plugin("upload").service("provider");
  const config = strapi.config.get("plugin.upload");

  const entity = {
    name,
    hash: `${slugify(name)}`,
    ext,
    // path: imgPath,
    // mime: mimeTypes.lookup(photo.name),
    size: buffer.toString().length,
    type: `image/${ext}`,
    provider: config.provider,
    getStream: () => imgPath.data,
  };

  //   const buffers = await strapi.plugins.upload.services.upload.bufferize({
  //     path: imgPath,
  //     name,
  //     type: `image/${ext}`,
  //     size: buffer.toString().length,
  //   });
  // pass the `buffers` variable to the service function upload which
  // returns a promise that gets resolved upon upload
  //   return strapi.plugins.upload.services.upload.upload(buffers, {
  //     provider: "local",
  //     enabled: true,
  //     sizeLimit: 10000000,
  //   });

  await uploadProvider.upload(entity);
  return strapi.query("plugin::upload.file").create({ data: entity });
};

export default factories.createCoreService("api::post.post", ({ strapi }) => ({
  downloadImage(url) {
    return download(url);
  },

  uploadImage(imgPath) {
    return upload(imgPath);
  },
}));
