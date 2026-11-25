import { MongoClient } from 'mongodb';
import { makeAccess } from './access.ts';
import { accessServer } from './http.ts';
import { mongoOversight } from './oversight.ts';
import { mongoStore } from './mongo.ts';
import { httpsOrigin, httpsProviders } from './providers.ts';

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error('Missing ' + name);
  return value;
}

async function launch() {
  const mode = required('MYPRAYER_ENVIRONMENT');
  if (!['development', 'staging', 'production'].includes(mode) || (mode === 'development' && process.env.NODE_ENV === 'production')) {
    throw new Error('Invalid deployment environment');
  }
  const providers = httpsProviders(
    { url: httpsOrigin(required('PRIMARY_PROVIDER_ORIGIN')), token: required('PRIMARY_PROVIDER_TOKEN') },
    { url: httpsOrigin(required('PHOTO_PROVIDER_ORIGIN')), token: required('PHOTO_PROVIDER_TOKEN') },
    httpsOrigin(required('PHOTO_CAPTURE_ORIGIN')),
  );
  const origin = httpsOrigin(required('PORTAL_ORIGIN'));
  const port = Number(process.env.PORT ?? '8080');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  const db = new MongoClient(required('MONGODB_URI'), { serverSelectionTimeoutMS: 8000, retryWrites: true, writeConcern: { w: 'majority' } });
  try {
    await db.connect();
    const database = db.db(required('MONGODB_DB'));
    const [store, oversight] = await Promise.all([mongoStore(database), mongoOversight(database)]);
    const server = accessServer(makeAccess(store, providers, mode === 'development'), origin.origin, oversight);
    server.on('error', () => {
      console.error('staff_access_listener_failed');
      void db.close().finally(() => { process.exitCode = 1; });
    });
    server.listen(port, '0.0.0.0');
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.once(signal, () => server.close(() => { void db.close(); }));
    }
  } catch (error) {
    await db.close();
    throw error;
  }
}

launch().catch(() => {
  // Driver errors can contain connection details.
  console.error('staff_access_start_failed');
  process.exitCode = 1;
});
