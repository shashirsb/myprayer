import { createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Db } from 'mongodb';
import { MongoServerError } from 'mongodb';
import { AccessError } from './access.ts';
import type { PrimaryProof } from './access.ts';

const derive = promisify(scrypt);
const otpLifetime = 180000;
type Credential = { accountId: string; login: string; passwordHash?: string; demoOtpPhone?: string };
type Otp = { id: string; accountId: string; digest: string; expiresAt: Date };
export interface CredentialStore {
  find(field: 'login' | 'demoOtpPhone', value: string): Promise<Credential | null>;
  limit(key: string, now: Date, maximum: number): Promise<boolean>;
  issue(otp: Otp): Promise<void>;
  consume(id: string, digest: string, now: Date): Promise<Otp | null>;
}

export async function hashStaffPassword(password: string) {
  if (password.length < 15 || password.length > 256) throw new Error('Password length must be 15 to 256 characters');
  const salt = randomBytes(16);
  return salt.toString('hex') + ':' + (await derive(password, salt, 64) as Buffer).toString('hex');
}

async function passwordMatches(password: string, stored: string | undefined) {
  const valid = typeof stored === 'string' && /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored);
  const [salt, hash] = (valid ? stored! : '0'.repeat(32) + ':' + '0'.repeat(128)).split(':');
  const actual = await derive(password, Buffer.from(salt, 'hex'), 64) as Buffer;
  return timingSafeEqual(actual, Buffer.from(hash, 'hex')) && valid;
}

export function credentialService(store: CredentialStore, key: string, development: boolean, clock = () => new Date()) {
  const hmac = (value: string) => createHmac('sha256', key).update(value).digest('hex');
  async function throttle(label: string, maximum: number) {
    if (!await store.limit(hmac(label), clock(), maximum)) throw new AccessError(429, 'retry_later');
  }
  function proof(accountId: string, method: PrimaryProof['method']): PrimaryProof {
    return {accountId, method, receipt: 'myp-' + randomBytes(32).toString('base64url'), authenticatedAt: clock()};
  }
  return {
    async password(login: string, password: string) {
      login = login.trim().toLowerCase();
      await throttle('password:all', 100);
      await throttle('password:' + login, 5);
      const staff = await store.find('login', login);
      if (!await passwordMatches(password, staff?.passwordHash) || !staff) throw new AccessError(401, 'first_factor_rejected');
      return proof(staff.accountId, 'password');
    },
    async requestOtp(phone: string) {
      // Numbers in this reserved demo namespace never leave MyPrayer.
      if (!development) throw new AccessError(404, 'not_found');
      if (!/^demo-[0-9]{6}$/.test(phone)) throw new AccessError(400, 'demo_number_required');
      await throttle('otp:send:' + phone, 3);
      const staff = await store.find('demoOtpPhone', phone);
      const id = randomBytes(24).toString('base64url');
      if (!staff) return { id };
      const demoCode = randomInt(0, 1000000).toString().padStart(6, '0');
      await store.issue({ id, accountId: staff.accountId, digest: hmac(id + ':' + demoCode), expiresAt: new Date(clock().getTime() + otpLifetime) });
      return { id, demoCode };
    },
    async verifyOtp(id: string, code: string) {
      if (!development) throw new AccessError(404, 'not_found');
      if (!/^[A-Za-z0-9_-]{32}$/.test(id) || !/^\d{6}$/.test(code)) throw new AccessError(401, 'first_factor_rejected');
      await throttle('otp:verify:' + id, 5);
      const verified = await store.consume(id, hmac(id + ':' + code), clock());
      if (!verified) throw new AccessError(401, 'first_factor_rejected');
      return proof(verified.accountId, 'otp');
    },
  };
}

export async function mongoCredentials(db: Db): Promise<CredentialStore> {
  const credentials = db.collection<Credential>('staff_credentials');
  const codes = db.collection<Otp>('staff_demo_otp');
  const limits = db.collection<{ _id: string; count: number; expiresAt: Date }>('staff_auth_limits');
  await Promise.all([
    credentials.createIndex({login:1}, {unique:true}),
    credentials.createIndex({demoOtpPhone:1}, {unique:true,sparse:true}),
    codes.createIndex({id:1}, {unique:true}),
    codes.createIndex({expiresAt:1}, {expireAfterSeconds:0}),
    limits.createIndex({expiresAt:1}, {expireAfterSeconds:0}),
  ]);
  return {
    find: (field, value) => credentials.findOne({[field]:value}),
    async limit(key, now, maximum) {
      const minute = Math.floor(now.getTime() / 60000);
      try {
        return !!await limits.findOneAndUpdate(
          {_id: key + ':' + minute, count: {$lt:maximum}},
          {$inc:{count:1}, $setOnInsert:{expiresAt:new Date((minute+2)*60000)}},
          {upsert:true, returnDocument:'after'},
        );
      } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000) return false;
        throw error;
      }
    },
    async issue(otp) { await codes.insertOne(otp); },
    consume: (id, digest, now) => codes.findOneAndDelete({id,digest,expiresAt:{$gt:now}}),
  };
}
