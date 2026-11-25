import { execFile } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AccessError } from './access.ts';
import type { Providers } from './access.ts';

const runner = fileURLToPath(new URL('../photo-model/verify.py', import.meta.url));

function infer(reference: string, direction: string, frames: string[]) {
  return new Promise<boolean>((accept, reject) => {
    const worker = execFile(process.env.PHOTO_PYTHON || 'python3', [runner, reference, direction],
      { timeout: 12000, killSignal: 'SIGKILL', maxBuffer: 4096 }, (error, stdout) => {
        if (error) return reject(new Error('Camera verifier unavailable'));
        accept(stdout.trim() === 'verified');
      });
    worker.stdin?.on('error', () => {}); // The exit callback reports an early worker failure.
    worker.stdin?.end(JSON.stringify(frames));
  });
}

export function localPhoto(origin: URL, references: string, verify = infer): Providers {
  let running = 0;
  return {
    async primary() { throw new AccessError(404, 'not_found'); },
    async startPhoto(_attempt, enrollment) {
      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(enrollment)) throw new Error('Invalid enrollment');
      const direction = randomInt(2) ? 'left' : 'right';
      return { id: direction + ':' + randomUUID(), captureUrl: origin.origin + '/staff/sign-in#camera-' + direction };
    },
    async photoResult(photoId, attempt, frames) {
      if (!attempt || attempt.photoId !== photoId || !/^[a-zA-Z0-9_-]{1,120}$/.test(attempt.enrollment)) throw new Error('Invalid challenge');
      const direction = photoId.split(':')[0];
      if (!['left', 'right'].includes(direction)) throw new Error('Invalid direction');
      if (running >= 2) throw new Error('Camera verifier busy');
      let verified = false;
      if (frames?.length === 2 && frames.every(frame => frame.length <= 210000 && /^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(frame))) {
        running++;
        try { verified = await verify(resolve(references, attempt.enrollment + '.jpg'), direction, frames); }
        finally { running--; }
      }
      return { photoId, attemptId: attempt.id, enrollment: attempt.enrollment, liveness: verified, match: verified };
    },
  };
}
