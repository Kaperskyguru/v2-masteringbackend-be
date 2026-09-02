# syntax=docker/dockerfile:1
#
# Strapi 5 production image.
#
# Notes for this deployment:
#  - node:22-slim (Debian) rather than Alpine: sharp/libvips and other native
#    modules are far less trouble on glibc than on musl.
#  - NODE_ENV is deliberately NOT set until after `yarn install`, otherwise
#    yarn skips devDependencies and the build has no TypeScript.
#  - libvips + build tools are present so sharp can fall back to a source
#    build if a prebuilt binary does not match this host's CPU
#    (this VM reports x86-64-v1; sharp >= 0.34 prebuilts require v2).

FROM node:22-slim

WORKDIR /opt/app

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      python3 \
      git \
      ca-certificates \
      libvips-dev \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first so this layer caches across source-only changes.
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000

COPY . .

# Cap the heap so the admin build cannot exhaust a small host and get
# the database OOM-killed alongside it.
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=1536

RUN yarn build

ENV HOST=0.0.0.0
ENV PORT=1337

EXPOSE 1337

CMD ["yarn", "start"]
