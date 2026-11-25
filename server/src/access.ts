import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { assignmentWorkspace, grantedPermissions, policyVersion, roleDecision } from './roles.ts';
import type { Assignment, Resource } from './roles.ts';
export type { Assignment, Scope } from './roles.ts';

export type Account = {
  id: string;
  personId: string;
  enabled: boolean;
  enrollment: string | null;
  developmentTester?: boolean;
  assignments: Assignment[];
};
export type PrimaryProof = { accountId: string; receipt: string; method: 'password' | 'otp'; authenticatedAt: Date };
export type Attempt = {
  id: string;
  key: string;
  primaryReceipt: string;
  accountId: string;
  enrollment: string;
  photoId: string;
  expiresAt: Date;
};
export type Session = { key: string; attemptId: string; accountId: string; assignmentId?: string; enrollment: string; expiresAt: Date };
export type Audit = {
  attemptId: string;
  event: string;
  at: Date;
  outcome: 'allowed' | 'denied' | 'pending';
  reason?: string;
  actor?: string;
  assignmentId?: string;
  permission?: string;
  institution?: string;
  station?: string;
  policyVersion?: string;
  authorityReference?: string;
};
export type PhotoEvidence = { attemptId: string; photoId: string; enrollment: string; liveness: boolean; match: boolean };
export interface Providers {
  primary(proof: string): Promise<PrimaryProof>;
  startPhoto(attemptId: string, enrollment: string): Promise<{ id: string; captureUrl: string }>;
  photoResult(id: string, attempt?: Attempt, frames?: string[]): Promise<PhotoEvidence>;
}
export interface Store {
  account(id: string): Promise<Account | null>;
  newAttempt(attempt: Attempt): Promise<boolean>;
  consumeAttempt(key: string, now: Date): Promise<Attempt | null>;
  newSession(session: Session): Promise<void>;
  session(key: string, now: Date): Promise<Session | null>;
  rotateSession(oldKey: string, session: Session, now: Date): Promise<boolean>;
  deleteSession(key: string): Promise<void>;
  audit(event: Audit): Promise<void>;
}
export class AccessError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const attemptSeconds = 180;
export const sessionSeconds = 4 * 60 * 60;
const keyOf = (value: string) => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const after = (date: Date, seconds: number) => new Date(date.getTime() + seconds * 1000);
const openAssignments = (account: Account, now: Date) => account.assignments.filter(
  item => !item.revoked && item.validFrom <= now && (!item.validUntil || item.validUntil > now) && grantedPermissions(item).length > 0,
);

export function makeAccess(store: Store, providers: Providers, development: boolean, clock = () => new Date()) {
  async function eligibleAccount(id: string) {
    const account = await store.account(id);
    return account?.enabled && (!account.developmentTester || development) ? account : null;
  }
  function record(event: Omit<Audit, 'at'>) {
    return store.audit({ ...event, at: clock() });
  }
  async function deny(attemptId: string, event: string, status: number, reason: string, actor?: string): Promise<never> {
    await record({ attemptId, event, outcome: 'denied', reason, actor });
    throw new AccessError(status, reason);
  }
  async function context(raw: string) {
    const now = clock();
    const session = raw && await store.session(keyOf(raw), now);
    if (!session) throw new AccessError(401, 'staff_session_required');
    const account = await eligibleAccount(session.accountId);
    if (!account) return deny(session.attemptId, 'access', 401, 'staff_session_required');
    if (account.enrollment !== session.enrollment) return deny(session.attemptId, 'access', 401, 'photo_enrollment_changed', account.personId);
    const assignments = openAssignments(account, now);
    const assignment = assignments.find(item => item.id === session.assignmentId);
    return { session, account, assignments, assignment };
  }
  async function start(firstFactor: () => Promise<PrimaryProof>) {
      const id = randomUUID();
      const primary = await firstFactor().catch((error: unknown) =>
        deny(id, 'first_factor', error instanceof AccessError ? error.status : 503,
          error instanceof AccessError && error.status < 500 ? error.message : 'first_factor_unavailable'),
      );
      const now = clock();
      if (!['password', 'otp'].includes(primary.method) || !(primary.authenticatedAt <= now && primary.authenticatedAt > after(now, -60))) {
        return deny(id, 'first_factor', 401, 'fresh_first_factor_required');
      }
      const account = await eligibleAccount(primary.accountId);
      if (!account) return deny(id, 'first_factor', 401, 'first_factor_rejected');
      await record({ attemptId: id, actor: account.personId, event: 'first_factor', outcome: 'allowed' });
      if (!account.enrollment) return deny(id, 'photo', 403, 'photo_enrollment_required', account.personId);
      const raw = token();
      const photo = await providers.startPhoto(id, account.enrollment).catch(() =>
        deny(id, 'photo', 503, 'photo_provider_unavailable', account.personId),
      );
      if (!await store.newAttempt({
        id, key: keyOf(raw), primaryReceipt: keyOf(primary.receipt), accountId: account.id,
        enrollment: account.enrollment, photoId: photo.id, expiresAt: after(now, attemptSeconds),
      })) return deny(id, 'first_factor', 401, 'first_factor_already_used', account.personId);
      await record({ attemptId: id, actor: account.personId, event: 'photo', outcome: 'pending' });
      return { attempt: raw, captureUrl: photo.captureUrl };
  }
  return {
    start: (proof: string) => start(() => providers.primary(proof)),
    startVerified: start,
    async complete(raw: string, frames?: string[]) {
      const attempt = raw && await store.consumeAttempt(keyOf(raw), clock());
      if (!attempt) throw new AccessError(401, 'photo_challenge_required');
      const account = await eligibleAccount(attempt.accountId);
      if (!account || account.enrollment !== attempt.enrollment) return deny(attempt.id, 'photo', 403, 'photo_enrollment_changed');
      const evidence = await providers.photoResult(attempt.photoId, attempt, frames).catch(() =>
        deny(attempt.id, 'photo', 503, 'photo_provider_unavailable', account.personId),
      );
      if (evidence.attemptId !== attempt.id || evidence.photoId !== attempt.photoId || evidence.enrollment !== attempt.enrollment ||
          evidence.liveness !== true || evidence.match !== true || attempt.expiresAt <= clock()) {
        return deny(attempt.id, 'photo', 403, 'photo_verification_failed', account.personId);
      }
      await record({ attemptId: attempt.id, actor: account.personId, event: 'photo', outcome: 'allowed' });
      const assignments = openAssignments(account, clock());
      if (!assignments.length) return deny(attempt.id, 'access', 403, 'no_active_assignment', account.personId);
      const assignmentId = !account.developmentTester && assignments.length === 1 ? assignments[0].id : undefined;
      const session = token();
      await record({ attemptId: attempt.id, actor: account.personId, event: 'session', outcome: 'allowed', assignmentId });
      await store.newSession({
        key: keyOf(session), attemptId: attempt.id, accountId: account.id, assignmentId, enrollment: attempt.enrollment, expiresAt: after(clock(), sessionSeconds),
      });
      return { session, needsAssignment: !assignmentId };
    },
    async profile(raw: string) {
      const { assignment, assignments } = await context(raw);
      const summary = ({ id, role, institution, jurisdiction, station, shift, caseId, workOrderId }: Assignment) => ({
        id, role, workspace: assignmentWorkspace(role), institution, jurisdiction, station, shift, caseId, workOrderId,
      });
      return { active: assignment ? { ...summary(assignment), permissions: grantedPermissions(assignment) } : null, assignments: assignments.map(summary) };
    },
    async select(raw: string, assignmentId: string) {
      const { account, session, assignments } = await context(raw);
      const selected = assignments.find(item => item.id === assignmentId);
      if (!selected) return deny(session.attemptId, 'assignment', 403, 'assignment_denied', account.personId);
      const next = token();
      await record({ attemptId: session.attemptId, actor: account.personId, event: 'assignment', outcome: 'allowed', assignmentId });
      if (!await store.rotateSession(keyOf(raw), { ...session, key: keyOf(next), assignmentId }, clock())) {
        throw new AccessError(401, 'staff_session_required');
      }
      return next;
    },
    async authorize(raw: string, permission: string, resource: Resource) {
      const { account, session, assignment } = await context(raw);
      const decision = assignment && roleDecision(assignment, permission, resource, account.personId, clock());
      if (!assignment || !decision) {
        return deny(session.attemptId, 'authorization', 403, 'permission_denied', account.personId);
      }
      await record({
        attemptId: session.attemptId, actor: account.personId, event: 'authorization', outcome: 'allowed',
        assignmentId: assignment.id, permission, institution: assignment.institution,
        station: assignment.station, policyVersion, authorityReference: decision.authorityReference,
      });
      return { actor: account.personId, assignment };
    },
    async logout(raw: string, pending = '') {
      if (raw) await store.deleteSession(keyOf(raw));
      if (pending) await store.consumeAttempt(keyOf(pending), clock());
    },
  };
}
