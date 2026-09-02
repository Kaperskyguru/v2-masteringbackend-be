// path: ./config/env/production/database.ts

import { parse } from 'pg-connection-string';

export default ({ env }) => {
  // Parsed lazily and defensively: `strapi build` loads this file with no
  // DATABASE_URL present, so a top-level parse(undefined) crashes the build.
  const url = env('DATABASE_URL');
  const parsed: any = url ? parse(url) : {};

  // SSL is required by managed providers (Supabase/Neon/Render) but NOT by a
  // Postgres container on a private Docker network. Driven by env so the same
  // image works in both places.
  const useSsl = env.bool('DATABASE_SSL', false);

  return {
    connection: {
      client: 'postgres',
      connection: {
        host: parsed.host ?? env('DATABASE_HOST', 'localhost'),
        port: Number(parsed.port ?? env.int('DATABASE_PORT', 5432)),
        database: parsed.database ?? env('DATABASE_NAME', 'strapi'),
        user: parsed.user ?? env('DATABASE_USERNAME', 'strapi'),
        password: parsed.password ?? env('DATABASE_PASSWORD', 'strapi'),
        ssl: useSsl
          ? {
              rejectUnauthorized: env.bool(
                'DATABASE_SSL_REJECT_UNAUTHORIZED',
                false
              ),
            }
          : false,
        schema: env('DATABASE_SCHEMA', 'public'),
      },
      debug: false,
      pool: {
        min: env.int('DATABASE_POOL_MIN', 2),
        max: env.int('DATABASE_POOL_MAX', 10),
        acquireTimeoutMillis: 60000,
        createTimeoutMillis: 30000,
        idleTimeoutMillis: 30000,
      },
    },
  };
};
