import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { hashPassword } from '../lib/password.ts';

/**
 * Prints an `ADMIN_PASSWORD_HASH=` line for `.env`. The password is read from
 * the terminal without echo, so it lands neither on screen nor in shell history.
 *
 *   npm run hash-password
 *   docker compose run --rm bot node dist/scripts/hashPassword.js
 */

let muted = false;
const output = new Writable({
  write(chunk: Buffer, _encoding, callback) {
    if (!muted) {
      process.stdout.write(chunk);
    }
    callback();
  },
});

const prompts = createInterface({
  input: process.stdin,
  output,
  terminal: process.stdin.isTTY === true,
});

const ask = (question: string): Promise<string> =>
  new Promise((resolve) => {
    process.stdout.write(question);
    muted = true;
    prompts.question('', (answer) => {
      muted = false;
      process.stdout.write('\n');
      resolve(answer);
    });
  });

const MIN_LENGTH = 12;

const password = await ask('Password: ');
if (password.length < MIN_LENGTH) {
  process.stderr.write(`Use at least ${MIN_LENGTH} characters.\n`);
  process.exit(1);
}

if (process.stdin.isTTY === true && (await ask('Repeat:   ')) !== password) {
  process.stderr.write('The two entries differ.\n');
  process.exit(1);
}

prompts.close();
process.stdout.write(`ADMIN_PASSWORD_HASH=${await hashPassword(password)}\n`);
