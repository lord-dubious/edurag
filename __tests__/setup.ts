import { beforeAll } from 'vitest';
import { config } from 'dotenv';
import path from 'path';

beforeAll(() => {
  config({ path: path.resolve(process.cwd(), '.env.local') });
});
