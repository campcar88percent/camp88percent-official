'use strict';

const crypto = require('crypto');

const plain = process.argv[2];
if (!plain) {
  console.error('Usage: node scripts/generate-admin-hash.js "your-admin-password"');
  process.exit(1);
}

const N = 16384;
const r = 8;
const p = 1;
const keylen = 64;
const salt = crypto.randomBytes(16).toString('hex');

const hash = crypto.scryptSync(plain, Buffer.from(salt, 'hex'), keylen, {
  N,
  r,
  p,
  maxmem: 64 * 1024 * 1024
}).toString('hex');

const out = `scrypt$${N}$${r}$${p}$${salt}$${hash}`;
console.log(out);
