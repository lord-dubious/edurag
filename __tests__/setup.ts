import { beforeAll, afterAll } from 'vitest';
import { config } from 'dotenv';
import path from 'path';

beforeAll(async () => {
  config({ path: path.resolve(process.cwd(), '.env.local') });
  console.log('Test environment loaded. AUTH_SECRET:', process.env.AUTH_SECRET?.length, process.env.AUTH_SECRET?.substring(0, 5));
});

afterAll(async () => {
  console.log('Test environment cleaned up');
});
