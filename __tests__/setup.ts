import { beforeAll, afterAll } from 'vitest';
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';

beforeAll(async () => {
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envLocalPath)) {
    config({ path: envLocalPath });
  }
  config({ path: path.resolve(process.cwd(), '.env.test'), override: true });
});

afterAll(async () => {
  console.log('Test environment cleaned up');
});
