// Run inside an isolated development deployment with the operator's consent.
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { MongoClient } from 'mongodb';
import { hashStaffPassword, mongoCredentials } from './credentials.ts';
import { mongoStore } from './mongo.ts';
import { developmentAssignments } from './roles.ts';

async function provision() {
  if (process.env.MYPRAYER_ENVIRONMENT !== 'development' || process.env.NODE_ENV === 'production') throw Error('Development only');
  const [login, enrollment, institution, jurisdiction] = process.argv.slice(2);
  if (![login, enrollment, institution, jurisdiction].every(v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v))) {
    throw Error('Supply login, enrollment key, institution and jurisdiction');
  }
  await access(join(process.env.PHOTO_REFERENCE_DIR!, enrollment + '.jpg'));
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const hash = await hashStaffPassword(Buffer.concat(chunks).toString().trimEnd());
  const client = new MongoClient(process.env.MONGODB_URI!, {serverSelectionTimeoutMS:8000});
  try {
    if (!process.env.MONGODB_DB) throw Error('Database required');
    const db = client.db(process.env.MONGODB_DB);
    await Promise.all([mongoStore(db), mongoCredentials(db)]);
    await client.withSession(session => session.withTransaction(async () => {
      await db.collection('staff_accounts').insertOne({id:'development-tester', personId:'development-tester',
        enabled:true, developmentTester:true, enrollment, assignments:developmentAssignments(institution, jurisdiction)}, {session});
      await db.collection('staff_credentials').insertOne({accountId:'development-tester', login:login.toLowerCase(),
        demoOtpPhone:'demo-000001', passwordHash:hash}, {session});
    }));
  } finally { await client.close(); }
}
provision().catch(() => { console.error('Tester creation failed. Check development configuration, enrollment and existing accounts.'); process.exitCode = 1; });
