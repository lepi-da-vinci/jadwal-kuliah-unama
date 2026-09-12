import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';
import * as schema from './schema';

// Cari file .env dari current dir naik ke root monorepo
let currentDir = process.cwd();
for (let i = 0; i < 5; i++) {
  const envPath = resolve(currentDir, '.env');
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
  const parent = resolve(currentDir, '..');
  if (parent === currentDir) break;
  currentDir = parent;
}

// Utamakan DATABASE_URL (Pooler), jika tidak ada gunakan DIRECT_URL
const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!connectionString) {
  console.warn('⚠️ Warning: DATABASE_URL atau DIRECT_URL belum diatur di environment variables.');
}

// Jika menggunakan port 6543 (Transaction Pooler Supavisor) atau pooler domain, disable prepared statements
const isTransactionPooler =
  connectionString?.includes(':6543') || connectionString?.includes('.pooler.');

export const client = postgres(connectionString || '', {
  prepare: !isTransactionPooler,
});

export const db = drizzle(client, { schema });

export * from 'drizzle-orm';
export * from './schema';
