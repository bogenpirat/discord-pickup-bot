import { randomBytes, type ScryptOptions, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Password hashes are stored as `scrypt:<N>:<r>:<p>:<salt>:<hash>`, salt and
 * hash in base64url. The separator is a colon rather than the usual `$` because
 * Docker Compose interpolates `$` in env files, which would silently mangle the
 * value on its way into the container.
 */
const PREFIX = 'scrypt';
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

export interface ScryptParams {
  /** CPU/memory cost, a power of two. */
  readonly cost: number;
  readonly blockSize: number;
  readonly parallelization: number;
}

/** 2^15 with r=8 takes 32 MiB and tens of milliseconds, the OWASP baseline for scrypt. */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = {
  cost: 2 ** 15,
  blockSize: 8,
  parallelization: 1,
};

const HASH_PATTERN = /^scrypt:(\d+):(\d+):(\d+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$/;

interface ParsedHash {
  readonly params: ScryptParams;
  readonly salt: Buffer;
  readonly hash: Buffer;
}

/**
 * Ceilings on what a stored hash may ask for. A hash is read from the env file,
 * and a typo in its cost must not turn every login into minutes of work or a
 * gigabyte allocation: 2^20 × r=16 tops out at 2 GiB worth of mixing.
 */
const MAX_COST = 2 ** 20;
const MAX_BLOCK_SIZE = 16;
const MAX_PARALLELIZATION = 4;

const isPowerOfTwo = (value: number): boolean => value > 1 && Number.isInteger(Math.log2(value));

const inRange = (value: number, max: number): boolean => value >= 1 && value <= max;

const parseHash = (encoded: string): ParsedHash | null => {
  const match = HASH_PATTERN.exec(encoded);
  if (match === null) {
    return null;
  }

  const params: ScryptParams = {
    cost: Number(match[1]),
    blockSize: Number(match[2]),
    parallelization: Number(match[3]),
  };
  const salt = Buffer.from(match[4] ?? '', 'base64url');
  const hash = Buffer.from(match[5] ?? '', 'base64url');

  if (
    !isPowerOfTwo(params.cost) ||
    params.cost > MAX_COST ||
    !inRange(params.blockSize, MAX_BLOCK_SIZE) ||
    !inRange(params.parallelization, MAX_PARALLELIZATION) ||
    salt.length === 0 ||
    hash.length === 0
  ) {
    return null;
  }

  return { params, salt, hash };
};

/** Whether a string is a password hash this module can check against. */
export const isPasswordHash = (encoded: string): boolean => parseHash(encoded) !== null;

const derive = (
  password: string,
  salt: Buffer,
  length: number,
  params: ScryptParams,
): Promise<Buffer> => {
  const options: ScryptOptions = {
    N: params.cost,
    r: params.blockSize,
    p: params.parallelization,
    // Twice what the parameters need, so the default cost never trips Node's limit.
    maxmem: 256 * params.cost * params.blockSize * params.parallelization,
  };

  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, length, options, (error, key) => {
      if (error === null) {
        resolve(key);
      } else {
        reject(error);
      }
    });
  });
};

export const hashPassword = async (
  password: string,
  params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Promise<string> => {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await derive(password, salt, KEY_LENGTH, params);

  return [
    PREFIX,
    params.cost,
    params.blockSize,
    params.parallelization,
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join(':');
};

/**
 * Checks a password against a stored hash in constant time. A malformed hash
 * never matches anything.
 */
export const verifyPassword = async (password: string, encoded: string): Promise<boolean> => {
  const parsed = parseHash(encoded);
  if (parsed === null) {
    return false;
  }

  const candidate = await derive(password, parsed.salt, parsed.hash.length, parsed.params);
  return timingSafeEqual(candidate, parsed.hash);
};
