import { readFile } from 'node:fs/promises';
import type { credentialService } from './credentials.ts';
import type { OversightStore } from './oversight.ts';
import { templePage } from './temple.ts';
import { ministryImage, ministryPage } from './ministry.ts';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccessError, attemptSeconds, sessionSeconds } from './access.ts';
import type { makeAccess } from './access.ts';

const attemptCookie = '__Host-myp_attempt';
const staffCookie = '__Host-myp_session';

function cookie(name: string, value = '', age = 0) {
  return `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`;
}

function readCookie(req: IncomingMessage, name: string) {
  const entries = (req.headers.cookie ?? '').split(';').map(value => value.trim())
    .filter(value => value.startsWith(name + '='));
  const value = entries.length === 1 ? entries[0].slice(name.length + 1) : '';
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '';
}

function respond(res: ServerResponse, status: number, body: object, cookies: string[] = []) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...(cookies.length ? { 'set-cookie': cookies } : {}),
  });
  res.end(JSON.stringify(body));
}

async function json(req: IncomingMessage, limit = 16384) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    throw new AccessError(415, 'json_required');
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > limit) throw new AccessError(413, 'request_too_large');
    chunks.push(chunk);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* Reject malformed input below. */ }
  throw new AccessError(400, 'invalid_json');
}

function field(value: unknown, max: number) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) throw new AccessError(400, 'invalid_field');
  return value;
}

export function accessServer(access: ReturnType<typeof makeAccess>, portalOrigin: string, oversight?: OversightStore, credentials?: ReturnType<typeof credentialService>, demoOtp = false) {
  const server = createServer(async (req, res) => {
    try {
      const path = req.url?.split('?')[0];
      const session = readCookie(req, staffCookie);
      const attempt = readCookie(req, attemptCookie);

      if (req.method === 'GET' && path === '/') { res.writeHead(302, {location: '/staff/sign-in'}); return res.end(); }
      if (req.method === 'GET' && path === '/v1/staff-config') return respond(res, 200, { demoOtp: !!credentials && demoOtp });
      if (req.method === 'GET' && (path === '/staff/sign-in' || path === '/staff/sign-in.js' || path === '/staff/sign-in.css' || path === '/staff/temple.css')) {
        const [file, type] = path.endsWith('.js') ? ['sign-in.js', 'text/javascript']
          : path.endsWith('.css') ? [path.slice('/staff/'.length), 'text/css'] : ['sign-in.html', 'text/html'];
        const content = await readFile(new URL('../assets/staff/' + file, import.meta.url));
        res.writeHead(200, {
          'content-type': type + '; charset=utf-8', 'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self' blob: mediastream:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        });
        return res.end(content);
      }
      if (req.method === 'GET' && path === '/temple') {
        const { active } = await access.profile(session);
        if (active?.workspace !== 'temple') throw new AccessError(403, 'temple_assignment_required');
        const selected = new URLSearchParams(req.url?.split('?')[1]).get('area');
        const content = templePage(active, selected);
        if (!content) return respond(res, 404, {error:'not_found'});
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
          'content-security-policy': "default-src 'none'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'",
        });
        return res.end(content);
      }
      if (req.method === 'GET' && (path === '/ministry' || path?.startsWith('/ministry/art/'))) {
        const { active } = await access.profile(session);
        if (active?.workspace !== 'ministry') throw new AccessError(403, 'ministry_assignment_required');
        const query = new URLSearchParams(req.url?.split('?')[1]);
        const districts = query.get('view') === 'districts';
        const temples = districts && path === '/ministry' && oversight ? await oversight.list(active) : [];
        const content = path === '/ministry'
          ? ministryPage(active, query.get('module'), districts, temples, query.get('temple'))
          : await ministryImage(path.slice('/ministry/art/'.length));
        if (content === null) return respond(res, 404, { error: 'not_found' });
        res.writeHead(200, {
          'content-type': typeof content === 'string' ? 'text/html; charset=utf-8' : 'image/jpeg',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
        });
        return res.end(content);
      }
      if (req.method === 'GET' && path === '/healthz') return respond(res, 200, { ok: true });
      if (req.method === 'GET' && path === '/v1/session') return respond(res, 200, await access.profile(session));
      if (req.method !== 'POST') return respond(res, 404, { error: 'not_found' });
      if (req.headers.origin !== portalOrigin) throw new AccessError(403, 'origin_denied');

      switch (path) {
        case '/v1/otp/request': {
          if (!credentials) throw new AccessError(404, 'not_found');
          const body = await json(req);
          return respond(res, 200, await credentials.requestOtp(field(body.phone, 40)));
        }
        case '/v1/otp/verify':
        case '/v1/password': {
          if (!credentials) throw new AccessError(404, 'not_found');
          const body = await json(req);
          const outcome = await access.startVerified(() => path === '/v1/password'
            ? credentials.password(field(body.login, 160), field(body.password, 256))
            : credentials.verifyOtp(field(body.id, 40), field(body.code, 6)));
          await access.logout(session, attempt);
          return respond(res, 200, { captureUrl: outcome.captureUrl }, [cookie(staffCookie), cookie(attemptCookie, outcome.attempt, attemptSeconds)]);
        }
        case '/v1/sign-in': {
          const body = await json(req);
          const outcome = await access.start(field(body.proof, 12000));
          await access.logout(session, attempt);
          return respond(res, 200, { captureUrl: outcome.captureUrl }, [cookie(staffCookie), cookie(attemptCookie, outcome.attempt, attemptSeconds)]);
        }
        case '/v1/photo/complete': {
          if (!attempt) throw new AccessError(401, 'photo_challenge_required');
          let frames: string[] | undefined;
          if (req.headers['content-type']?.split(';')[0] === 'application/json') {
            const body = await json(req, 450000);
            if (body.frames !== undefined) {
              if (!Array.isArray(body.frames) || body.frames.length !== 2) throw new AccessError(400, 'invalid_capture');
              frames = body.frames.map(value => field(value, 210000));
            }
          }
          const outcome = await access.complete(attempt, frames);
          return respond(res, 200, { needsAssignment: outcome.needsAssignment }, [cookie(attemptCookie), cookie(staffCookie, outcome.session, sessionSeconds)]);
        }
        case '/v1/assignment': {
          const body = await json(req);
          const next = await access.select(session, field(body.assignment, 120));
          return respond(res, 200, await access.profile(next), [cookie(staffCookie, next, sessionSeconds)]);
        }
        case '/v1/access/check': {
          const body = await json(req);
          await access.authorize(session, field(body.permission, 120), {
            institution: field(body.institution, 120),
            station: body.station === undefined ? undefined : field(body.station, 120),
          });
          return respond(res, 200, { allowed: true });
        }
        case '/v1/sign-out':
          await access.logout(session, attempt);
          return respond(res, 200, { ok: true }, [cookie(staffCookie), cookie(attemptCookie)]);
        default:
          return respond(res, 404, { error: 'not_found' });
      }
    } catch (error) {
      if (error instanceof AccessError) return respond(res, error.status, { error: error.message });
      console.error('staff_access_request_failed');
      return respond(res, 503, { error: 'access_service_unavailable' });
    }
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 15000;
  return server;
}
