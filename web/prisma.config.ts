import { defineConfig } from 'prisma/config';

// ponytail: prisma 7 moved the migrate/introspect URL out of schema.prisma.
// process.env, not env() — env() throws when unset, and `generate` needs no URL (CI has none).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: process.env.DATABASE_URL },
});
