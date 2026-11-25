import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { makeAccess } from '../src/access.ts';
import type { Account, Attempt, Audit, PhotoEvidence, Providers, Session, Store } from '../src/access.ts';
import { accessServer } from '../src/http.ts';

function fixture(development = false) {
  const now = new Date();
  const account: Account = {
    id: 'operator', personId: 'staff-001', enabled: true, enrollment: 'enrollment-001',
    assignments: [
      { id: 'counter', role: 'print-operator', institution: 'kabbalamma', station: 'counter-01',
        permissions: ['ticket.print'], validFrom: new Date(now.getTime() - 1000) },
    ],
  };
  const attempts = new Map<string, Attempt>();
  const sessions = new Map<string, Session>();
  const audit: Audit[] = [];
  const consumed = new Set<string>();
  const photo = new Map<string, PhotoEvidence>();
  const store: Store = {
    async account(id) { return id === account.id ? account : null; },
    async newAttempt(attempt) {
      if ([...attempts.values()].some(item => item.primaryReceipt === attempt.primaryReceipt)) return false;
      attempts.set(attempt.key, attempt);
      return true;
    },
    async consumeAttempt(key, date) {
      const value = attempts.get(key);
      if (!value || value.expiresAt <= date || consumed.has(key)) return null;
      consumed.add(key);
      return value;
    },
    async newSession(session) { sessions.set(session.key, session); },
    async session(key, date) {
      const value = sessions.get(key);
      return value && value.expiresAt > date ? value : null;
    },
    async rotateSession(key, session, date) {
      if (!await this.session(key, date) || !sessions.delete(key)) return false;
      sessions.set(session.key, session);
      return true;
    },
    async deleteSession(key) { sessions.delete(key); },
    async audit(event) { audit.push(event); },
  };
  const providers: Providers = {
    async primary(proof) {
      return { accountId: account.id, receipt: proof, method: proof.startsWith('otp') ? 'otp' : 'password', authenticatedAt: now };
    },
    async startPhoto(attemptId, enrollment) {
      const photoId = 'capture-' + attemptId;
      photo.set(photoId, { attemptId, photoId, enrollment, liveness: true, match: true });
      return { id: photoId, captureUrl: 'https://capture.example.test/' + photoId };
    },
    async photoResult(id) { return photo.get(id)!; },
  };
  return { access: makeAccess(store, providers, development, () => now), account, audit, photo, providers, now };
}

const scope = { institution: 'kabbalamma', station: 'counter-01' };

for (const method of ['password', 'otp']) {
  test(method + ' still requires fresh verified liveness and match', async () => {
    const {access, audit} = fixture();
    const {attempt} = await access.start(method + '-proof');
    await assert.rejects(access.authorize(attempt, 'ticket.print', scope), {status: 401});
    const {session, needsAssignment} = await access.complete(attempt);
    assert.equal(needsAssignment, false);
    assert.equal((await access.authorize(session, 'ticket.print', scope)).actor, 'staff-001');
    await assert.rejects(access.complete(attempt), {status: 401});
    await assert.rejects(access.start(method + '-proof'), {status: 401});
    assert.equal(audit.filter(event => event.event === 'photo' && event.outcome === 'allowed').length, 1);
    assert.doesNotMatch(JSON.stringify(audit), /enrollment-001|password-proof|otp-proof/);
  });
}

test('mismatch, absent liveness, unavailable provider and expired challenge fail closed', async () => {
  for (const mode of ['mismatch', 'liveness', 'unavailable', 'expired', 'unbound']) {
    const {access, photo, providers, now} = fixture();
    const {attempt} = await access.start('password-' + mode);
    const result = [...photo.values()][0];
    if (mode === 'mismatch') result.match = false;
    if (mode === 'liveness') result.liveness = false;
    if (mode === 'unbound') result.attemptId = 'different-attempt';
    if (mode === 'unavailable') providers.photoResult = async () => { throw new Error('unavailable'); };
    if (mode === 'expired') now.setMinutes(now.getMinutes() + 4);
    await assert.rejects(access.complete(attempt), {status: mode === 'unavailable' ? 503 : mode === 'expired' ? 401 : 403});
  }
});

test('an account loses access when its station, institution, permission or assignment no longer applies', async () => {
  const {access, account} = fixture();
  const {attempt} = await access.start('otp-proof');
  const {session} = await access.complete(attempt);
  await assert.rejects(access.authorize(session, 'ticket.print', {...scope, station: 'counter-02'}), {status: 403});
  await assert.rejects(access.authorize(session, 'ticket.print', {...scope, institution: 'elsewhere'}), {status: 403});
  await assert.rejects(access.authorize(session, 'ticket.refund', scope), {status: 403});
  account.assignments[0].revoked = true;
  await assert.rejects(access.authorize(session, 'ticket.print', scope), {status: 403});
  account.enrollment = 'replaced';
  await assert.rejects(access.profile(session), {status: 401});
});

test('development role selection rotates the session and preserves the audit actor', async () => {
  const production = fixture();
  production.account.developmentTester = true;
  await assert.rejects(production.access.start('password-proof'), {status: 401});
  const {access, account, audit} = fixture(true);
  account.developmentTester = true;
  const {attempt} = await access.start('password-proof');
  const {session, needsAssignment} = await access.complete(attempt);
  assert.equal(needsAssignment, true);
  await assert.rejects(access.authorize(session, 'ticket.print', scope), {status: 403});
  const next = await access.select(session, 'counter');
  await assert.rejects(access.profile(session), {status: 401});
  assert.equal((await access.authorize(next, 'ticket.print', scope)).actor, 'staff-001');
  assert.equal(audit.find(event => event.event === 'assignment')?.actor, 'staff-001');
});

test('HTTP requires a complete staff session and a same-origin POST', async t => {
  const {access} = fixture();
  const origin = 'https://portal.example.test';
  const server = accessServer(access, origin).listen(0, '127.0.0.1');
  t.after(() => { server.close(); });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = 'http://127.0.0.1:' + address.port;
  const post = (path: string, body: object, cookie = '', requestOrigin = origin) => fetch(base + path, {
    method: 'POST', headers: {'content-type':'application/json', origin:requestOrigin, cookie}, body: JSON.stringify(body),
  });
  assert.equal((await post('/v1/sign-in', {proof:'otp-proof'}, '', 'https://elsewhere.example.test')).status, 403);
  assert.equal((await fetch(base + '/ministry')).status, 401);
  const start = await post('/v1/sign-in', {proof:'otp-proof'});
  assert.equal(start.status, 200);
  const challenge = start.headers.getSetCookie().find(header => header.startsWith('__Host-myp_attempt='))!;
  assert.match(challenge, /HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await post('/v1/access/check', {permission:'ticket.print', ...scope}, challenge.split(';')[0])).status, 401);
  const finish = await post('/v1/photo/complete', {}, challenge.split(';')[0]);
  assert.equal(finish.status, 200);
  const session = finish.headers.getSetCookie().find(header => header.startsWith('__Host-myp_session='))!.split(';')[0];
  assert.equal((await post('/v1/access/check', {permission:'ticket.print', ...scope}, session)).status, 200);
  assert.equal((await fetch(base + '/ministry', {headers:{cookie:session}})).status, 403);
  assert.equal((await post('/v1/sign-out', {}, session)).status, 200);
  assert.equal((await post('/v1/access/check', {permission:'ticket.print', ...scope}, session)).status, 401);
});

test('role selection changes the workspace, invalidates the old session and does not combine permissions', async () => {
  const {access, account} = fixture(true);
  account.developmentTester = true;
  account.assignments.push({
    id: 'district', role: 'deputy-commissioner', permissions: ['oversight.jurisdiction.read', 'ticket.print'],
    institution: 'district-office', jurisdiction: 'district-a', validFrom: account.assignments[0].validFrom,
  });
  const {attempt} = await access.start('otp-workspaces');
  const {session} = await access.complete(attempt);
  assert.equal((await access.profile(session)).active, null);
  const ministry = await access.select(session, 'district');
  const profile = await access.profile(ministry);
  assert.equal(profile.active?.workspace, 'ministry');
  assert.deepEqual(profile.active?.permissions, ['oversight.jurisdiction.read']);
  await access.authorize(ministry, 'oversight.jurisdiction.read', {institution: 'temple-in-district-a', jurisdiction: 'district-a'});
  await assert.rejects(access.authorize(ministry, 'oversight.jurisdiction.read', {institution: 'other', jurisdiction: 'district-b'}), {status: 403});
  await assert.rejects(access.authorize(ministry, 'ticket.print', scope), {status: 403});
  const temple = await access.select(ministry, 'counter');
  assert.equal((await access.profile(temple)).active?.workspace, 'temple');
  await access.authorize(temple, 'ticket.print', scope);
  await assert.rejects(access.authorize(temple, 'oversight.jurisdiction.read', {institution: 'district-office', jurisdiction: 'district-a'}), {status: 403});
  await assert.rejects(access.profile(ministry), {status: 401});
});

test('case decisions reject self-approval, missing authority and amounts over the recorded limit', async () => {
  const {access, account, now, audit} = fixture();
  account.assignments[0] = {
    id: 'sanctioner', role: 'sanctioner', permissions: ['government.case.decide'], caseId: 'case-01',
    institution: 'kabbalamma', validFrom: new Date(now.getTime() - 1000), authority: [{
      reference: 'DEMO-ORDER', permission: 'government.case.decide', validFrom: new Date(now.getTime() - 1000),
      validUntil: new Date(now.getTime() + 30000), maximumAmountMinor: 10000,
    }],
  };
  const {attempt} = await access.start('password-case');
  const {session} = await access.complete(attempt);
  const resource = {institution: 'kabbalamma', caseId: 'case-01', initiatorPersonId: 'other-staff', amountMinor: 5000};
  for (const patch of [{caseId: 'case-02'}, {initiatorPersonId: account.personId}, {initiatorPersonId: undefined}, {amountMinor: 10001}]) {
    await assert.rejects(access.authorize(session, 'government.case.decide', { ...resource, ...patch }), {status: 403});
  }
  await access.authorize(session, 'government.case.decide', resource);
  const decision = audit.find(event => event.event === 'authorization' && event.outcome === 'allowed');
  assert.equal(decision?.authorityReference, 'DEMO-ORDER');
  assert.equal(decision?.policyVersion, 'roles-blueprint-v2');
  account.assignments[0].authority = [];
  await assert.rejects(access.authorize(session, 'government.case.decide', resource), {status: 403});
});

test('a contractor can submit evidence for the assigned work order only', async () => {
  const {access, account} = fixture();
  account.assignments[0] = {
    id: 'works', role: 'works-contractor', permissions: ['work.order.submit', 'ticket.print'],
    institution: 'kabbalamma', workOrderId: 'works-01', validFrom: account.assignments[0].validFrom,
  };
  const {attempt} = await access.start('otp-contract');
  const {session} = await access.complete(attempt);
  await access.authorize(session, 'work.order.submit', {institution: 'kabbalamma', workOrderId: 'works-01'});
  await assert.rejects(access.authorize(session, 'work.order.submit', {institution: 'kabbalamma', workOrderId: 'works-02'}), {status: 403});
  await assert.rejects(access.authorize(session, 'ticket.print', scope), {status: 403});
});

test('Ministry preview renders assigned modules and rejects an ungranted module URL', async () => {
  const { ministryPage, ministryImage } = await import('../src/ministry.ts');
  const profile = { role:'deputy-commissioner', institution:'district', jurisdiction:'district-a',
    permissions:['oversight.jurisdiction.read'] };
  assert.match(ministryPage(profile, null, false)!, /Ministry oversight[\s\S]+Temple registry/);
  assert.doesNotMatch(ministryPage(profile, null, false)!, /Finance oversight/);
  assert.equal(ministryPage(profile, 'finance', false), null);
  assert.match(ministryPage(profile, 'registry', true)!, /District oversight[\s\S]+Temples in scope[\s\S]+Close drawer/);
  assert.ok((await ministryImage('registry'))!.length > 0);
});

test('Ministry district pages list only scoped Atlas-shaped records and deny direct out-of-scope links', async t => {
  const { oversightFilter } = await import('../src/oversight.ts');
  const { access, account } = fixture();
  account.assignments[0] = {
    id: 'district', role: 'deputy-commissioner', permissions: ['oversight.jurisdiction.read'],
    institution: 'district-office', jurisdiction: 'ka-district-a', validFrom: account.assignments[0].validFrom,
  };
  const records = [
    { id:'temple-a', name:'Temple A', institution:'temple-a', jurisdiction:'ka-district-a', stateScope:'ka', inspection:'Due' as const, exceptions:2 },
    { id:'temple-b', name:'Temple B', institution:'temple-b', jurisdiction:'ka-district-b', stateScope:'ka', inspection:'Current' as const, exceptions:0 },
  ];
  const {attempt} = await access.start('otp-district');
  const {session} = await access.complete(attempt);
  const server = accessServer(access, 'https://portal.example.test', {
    async list(assignment) {
      const scope = oversightFilter(assignment);
      return scope ? records.filter(record => Object.entries(scope).every(([key, value]) => Reflect.get(record, key) === value)) : [];
    },
  }).listen(0, '127.0.0.1');
  t.after(() => { server.close(); });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = 'http://127.0.0.1:' + address.port;
  const get = (query: string) => fetch(base + '/ministry' + query, { headers: {cookie:'__Host-myp_session=' + session} });
  const page = await get('?view=districts');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Temple A/);
  assert.doesNotMatch(html, /Temple B/);
  const detail = await get('?view=districts&temple=temple-a');
  assert.match(await detail.text(), /Inspection status: Due/);
  assert.equal((await get('?view=districts&temple=temple-b')).status, 404);
  assert.deepEqual(oversightFilter({institution:'ka', permissions:['oversight.state.read']}), {stateScope:'ka'});
  assert.equal(oversightFilter({institution:'ka', permissions:['finance.oversight.read']}), null);
});

test('MyPrayer password and dummy OTP require photo verification and OTP is single-use', async () => {
  const { credentialService, hashStaffPassword } = await import('../src/credentials.ts');
  const { access, now } = fixture();
  const staff = {
    login:'operator', accountId:'operator', demoOtpPhone:'demo-000001',
    passwordHash:await hashStaffPassword('test password for staging'),
  };
  const codes = new Map<string, {id:string;accountId:string;digest:string;expiresAt:Date}>();
  const store: import('../src/credentials.ts').CredentialStore = {
    async find(field, value) { return staff[field]===value ? staff : null; },
    async limit() { return true; },
    async issue(otp) { codes.set(otp.id,otp); },
    async consume(id,digest,date) {
      const otp=codes.get(id);
      if (!otp || otp.digest!==digest || otp.expiresAt<=date) return null;
      codes.delete(id);
      return otp;
    },
  };
  const credentials=credentialService(store, 'synthetic-test-key', true, () => now);
  await assert.rejects(credentials.password('operator','incorrect'), {status:401});
  const {attempt}=await access.startVerified(() => credentials.password('operator','test password for staging'));
  await assert.rejects(access.authorize(attempt,'ticket.print',scope), {status:401});
  const demo=await credentials.requestOtp('demo-000001');
  assert.match(demo.demoCode!, /^\d{6}$/);
  assert.notEqual(codes.get(demo.id)?.digest,demo.demoCode);
  const otp=await access.startVerified(() => credentials.verifyOtp(demo.id,demo.demoCode!));
  await assert.rejects(access.authorize(otp.attempt,'ticket.print',scope), {status:401});
  await assert.rejects(credentials.verifyOtp(demo.id,demo.demoCode!), {status:401});
  await assert.rejects(credentialService(store,'synthetic-test-key',false).requestOtp('demo-000001'), {status:404});
});
