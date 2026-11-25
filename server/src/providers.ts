import { AccessError } from './access.ts';
import type { Providers } from './access.ts';

type Service = { url: URL; token: string };

export function httpsOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Expected an HTTPS origin');
  }
  return url;
}

async function request(service: Service, path: string, body: object): Promise<Record<string, unknown>> {
  const response = await fetch(new URL(path, service.url), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: { authorization: 'Bearer ' + service.token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (response.status === 401 || response.status === 403) throw new AccessError(401, 'provider_rejected');
  if (!response.ok) throw new Error('Provider unavailable');
  const result: unknown = await response.json();
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid provider result');
  return result as Record<string, unknown>;
}

function requiredString(value: unknown) {
  if (typeof value !== 'string' || !value || value.length > 4096) throw new Error('Invalid provider result');
  return value;
}

export function httpsProviders(primary: Service, photo: Service, captureOrigin: URL): Providers {
  return {
    async primary(proof) {
      const result = await request(primary, '/v1/verify-proof', { proof });
      const method = result.method;
      if (method !== 'otp' && method !== 'password') throw new Error('Invalid first factor');
      return {
        accountId: requiredString(result.accountId), receipt: requiredString(result.receipt), method,
        authenticatedAt: new Date(requiredString(result.authenticatedAt)),
      };
    },
    async startPhoto(attemptId, enrollment) {
      const result = await request(photo, '/v1/photo-challenges', { attemptId, enrollment });
      const captureUrl = new URL(requiredString(result.captureUrl));
      if (captureUrl.origin !== captureOrigin.origin || captureUrl.username || captureUrl.password) {
        throw new Error('Unapproved photo capture origin');
      }
      return { id: requiredString(result.id), captureUrl: captureUrl.href };
    },
    async photoResult(id) {
      const result = await request(photo, '/v1/photo-results', { id });
      return {
        attemptId: requiredString(result.attemptId), photoId: requiredString(result.photoId),
        enrollment: requiredString(result.enrollment), liveness: result.liveness === true, match: result.match === true,
      };
    },
  };
}
