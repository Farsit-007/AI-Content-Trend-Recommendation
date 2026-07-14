import dotenv from 'dotenv';
import path from 'path';

// Runs before any test file (and before `config/index.ts`'s eager zod parse) is imported,
// so the whole suite gets schema-valid placeholder env vars without touching the real .env.
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env.test') });
