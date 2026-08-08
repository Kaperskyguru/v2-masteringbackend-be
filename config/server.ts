export default ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  app: {
    keys: env.array('APP_KEYS'),
  },
  webhooks: {
    populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
  },
  // Built-in MCP server (requires Strapi >= 5.47.0).
  // Exposes POST /mcp on this same HTTP server. Authenticated per-request with
  // an Admin token (Settings > Admin tokens); the token's permissions decide
  // which tools an AI client can see. Off by default in production unless
  // MCP_ENABLED is set.
  mcp: {
    enabled: env.bool('MCP_ENABLED', env('NODE_ENV') === 'development'),
  },
});
