import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load from root .env or current dir .env
dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config({ path: resolve(__dirname, '../../.env') });
dotenv.config({ path: resolve(__dirname, '.env') });

const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  console.warn("⚠️ DIRECT_URL atau DATABASE_URL belum diatur di .env");
}

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: dbUrl || '',
  },
});
