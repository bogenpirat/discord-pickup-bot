import { statSync } from 'node:fs';

const path = process.env.HEARTBEAT_PATH ?? '/tmp/heartbeat';
const maxAgeMs = 120_000;

try {
  process.exit(Date.now() - statSync(path).mtimeMs < maxAgeMs ? 0 : 1);
} catch {
  process.exit(1);
}
