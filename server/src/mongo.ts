import { MongoServerError } from 'mongodb';
import type { Db } from 'mongodb';
import type { Account, Attempt, Audit, Session, Store } from './access.ts';

export async function mongoStore(db: Db): Promise<Store> {
  const accounts = db.collection<Account>('staff_accounts');
  const attempts = db.collection<Attempt & { consumedAt?: Date }>('staff_sign_in_attempts');
  const sessions = db.collection<Session>('staff_sessions');
  const events = db.collection<Audit>('staff_access_events');
  await Promise.all([
    accounts.createIndex({ id: 1 }, { unique: true }),
    attempts.createIndex({ key: 1 }, { unique: true }),
    attempts.createIndex({ primaryReceipt: 1 }, { unique: true }),
    attempts.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    sessions.createIndex({ key: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    events.createIndex({ attemptId: 1, at: 1 }),
  ]);
  return {
    account: id => accounts.findOne({ id }),
    async newAttempt(attempt) {
      try {
        await attempts.insertOne(attempt);
        return true;
      } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000) return false;
        throw error;
      }
    },
    consumeAttempt: (key, now) => attempts.findOneAndUpdate(
      { key, expiresAt: { $gt: now }, consumedAt: { $exists: false } }, { $set: { consumedAt: now } },
    ),
    async newSession(session) { await sessions.insertOne(session); },
    session: (key, now) => sessions.findOne({ key, expiresAt: { $gt: now } }),
    async rotateSession(oldKey, session, now) {
      const result = await sessions.updateOne(
        { key: oldKey, expiresAt: { $gt: now } }, { $set: { key: session.key, assignmentId: session.assignmentId } },
      );
      return result.modifiedCount === 1;
    },
    async deleteSession(key) { await sessions.deleteOne({ key }); },
    async audit(event) { await events.insertOne(event); },
  };
}
