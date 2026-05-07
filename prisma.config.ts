// With prisma.config.ts, Prisma CLI does not auto-load .env — load it before validating the schema.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl =
  (isProduction
    ? process.env.DATABASE_URL_PROD
    : process.env.DATABASE_URL_LOCAL) ||
  process.env.DATABASE_URL;

if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'npx tsx prisma/seed.ts',
  },
});
