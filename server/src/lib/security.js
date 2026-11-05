import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import config from '../config.js';

export const hashPassword = (plain) => bcrypt.hashSync(plain, 11);
export const verifyPassword = (plain, hash) => bcrypt.compareSync(plain, hash);
export const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export function signAccessToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role, name: user.name }, config.jwt.secret, {
    expiresIn: config.jwt.accessTtl,
    issuer: 'henongyun',
    audience: 'henongyun-web',
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.secret, { issuer: 'henongyun', audience: 'henongyun-web' });
}

export function randomNumericCode(length = 6) {
  let s = '';
  const buf = crypto.randomBytes(length * 2);
  for (let i = 0; i < length; i++) s += String(buf[i] % 10);
  return s;
}

export function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
