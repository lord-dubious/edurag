import { beforeAll, afterAll } from 'vitest';
import { config } from 'dotenv';
import path from 'path';

beforeAll(async () => {
  config({ path: path.resolve(process.cwd(), '.env.local') });
  console.log('Test environment loaded');
});

afterAll(async () => {
  console.log('Test environment cleaned up');
});
