// Trusted operator CLI. Accepts the password on stdin and an approved assignment file.
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { mongoStore } from './mongo.ts';
import { hashStaffPassword, mongoCredentials } from './credentials.ts';
import { grantedPermissions } from './roles.ts';
import type { Assignment } from './roles.ts';

function identifier(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(value)) throw Error('Invalid identifier');
  return value;
}
function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid record');
  return input as Record<string, unknown>;
}
function date(value: unknown) {
  if (typeof value !== 'string' || !value.endsWith('Z')) throw Error('UTC timestamp required');
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw Error('Invalid timestamp');
  return result;
}
export function readRoster(input: unknown) {
  const row = record(input);
  const login = typeof row.login === 'string' ? row.login.toLowerCase().trim() : '';
  if (!login || login.length > 160 || /\s/.test(login)) throw Error('Invalid login');
  const personId = identifier(row.personId);
  const enrollment = identifier(row.enrollment);
  if (!Array.isArray(row.assignments) || !row.assignments.length) throw Error('Missing assignments');
  const ids = new Set<string>();
  const assignments = row.assignments.map((item: unknown) => {
    const a = record(item);
    const permissions = a.permissions;
    if (!Array.isArray(permissions) || !permissions.length || !permissions.every(v => typeof v === 'string')) throw Error('Invalid permissions');
    const assignment: Assignment = {
      id: identifier(a.id), role: identifier(a.role), institution: identifier(a.institution),
      permissions: [...new Set<string>(permissions)], validFrom: date(a.validFrom),
    };
    for (const field of ['jurisdiction','station','shift','caseId','workOrderId'] as const) {
      if (a[field] !== undefined) assignment[field] = identifier(a[field]);
    }
    if (a.validUntil !== undefined) {
      assignment.validUntil = date(a.validUntil);
      if (assignment.validUntil <= assignment.validFrom) throw Error('Invalid assignment period');
    }
    if (ids.has(assignment.id) || grantedPermissions(assignment).length !== assignment.permissions.length) throw Error('Invalid assignment');
    if (a.authority !== undefined) throw Error('Use the approved authority process for financial and statutory limits');
    ids.add(assignment.id);
    return assignment;
  });
  return {personId, enrollment, login, assignments};
}

async function provision() {
  const row = readRoster(JSON.parse(await readFile(process.argv[2], 'utf8')));
  if (!process.env.MONGODB_DB) throw Error('Database required');
  await access(join(process.env.PHOTO_REFERENCE_DIR!, row.enrollment + '.jpg'));
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const passwordHash = await hashStaffPassword(Buffer.concat(chunks).toString().trimEnd());
  const client = new MongoClient(process.env.MONGODB_URI!, {serverSelectionTimeoutMS:8000});
  try {
    const db = client.db(process.env.MONGODB_DB);
    await Promise.all([mongoStore(db), mongoCredentials(db)]);
    const accountId = randomUUID();
    await client.withSession(session => session.withTransaction(async () => {
      await db.collection('staff_accounts').insertOne({id:accountId, personId:row.personId, enrollment:row.enrollment, enabled:true, assignments:row.assignments}, {session});
      await db.collection('staff_credentials').insertOne({accountId, login:row.login, passwordHash}, {session});
    }));
  } finally { await client.close(); }
}
if (import.meta.main) provision().catch(() => { console.error('Staff creation failed. Check the roster, enrollment, runtime configuration and duplicate login.'); process.exitCode = 1; });
