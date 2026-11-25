#!/usr/bin/env bash
# CI-only isolated stack. The caller has already built myprayer-check.
set -euo pipefail
project=mypci
tmp=$(mktemp -d)
export MYPRAYER_ENV_FILE="$tmp/runtime.env" MYPRAYER_ENROLLMENTS="$tmp/refs"
compose=(docker compose -p "$project" -f deploy/wave2/compose.yaml)
cleanup() {
  docker rm -f myp-ci-mongo >/dev/null 2>&1 || true
  "${compose[@]}" down >/dev/null 2>&1 || true
  docker network rm mypci_default >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
mkdir "$MYPRAYER_ENROLLMENTS"
touch "$MYPRAYER_ENROLLMENTS/fixture.jpg"
cat > "$MYPRAYER_ENV_FILE" <<ENV
MYPRAYER_ENVIRONMENT=development
NODE_ENV=development
MONGODB_URI=mongodb://myp-ci-mongo:27017/?replicaSet=rs0
MONGODB_DB=ci_staff
PORTAL_ORIGIN=https://portal.example.test
STAFF_CREDENTIAL_HMAC_KEY=$(openssl rand -hex 32)
ENV
docker tag myprayer-check mypci-staff
"${compose[@]}" create --no-build staff
docker run -d --name myp-ci-mongo --network mypci_default mongo:7 mongod --replSet rs0 --bind_ip_all
for i in {1..60}; do
  if docker exec myp-ci-mongo mongosh --quiet --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec myp-ci-mongo mongosh --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"myp-ci-mongo:27017"}]})'
for i in {1..60}; do
  if docker exec myp-ci-mongo mongosh --quiet --eval 'quit(db.hello().isWritablePrimary ? 0 : 1)' >/dev/null 2>&1; then break; fi
  sleep 1
done
"${compose[@]}" up -d --no-build
for i in {1..30}; do
  if curl -fsS http://127.0.0.1:8080/healthz >/dev/null; then break; fi
  sleep 1
done
export CI_STAFF_PASSWORD=$(openssl rand -hex 24)
printf '%s' "$CI_STAFF_PASSWORD" | "${compose[@]}" exec -T staff node src/provision-tester.ts tester fixture temple district
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
const origin = 'https://portal.example.test';
const base = 'http://127.0.0.1:8080';
const get = path => fetch(base + path);
const post = (path, body, cookie = '') => fetch(base + path, {method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(body)});
assert.match(await (await get('/')).text(), /meta name="myprayer-staff-service"/);
assert.match(await (await get('/staff/sign-in')).text(), /Live camera preview/);
assert.equal((await get('/temple')).status, 401);
assert.equal((await get('/ministry')).status, 401);
const start = await post('/v1/password', {login:'tester',password:process.env.CI_STAFF_PASSWORD});
assert.equal(start.status, 200);
assert.match((await start.json()).captureUrl, /#camera-(left|right)$/);
const cookie = start.headers.getSetCookie().find(h=>h.startsWith('__Host-myp_attempt=')).split(';')[0];
assert.equal((await post('/v1/photo/complete', {}, cookie)).status, 403);
assert.equal((await post('/v1/photo/complete', {}, cookie)).status, 401);
const otp = await (await post('/v1/otp/request',{phone:'demo-000001'})).json();
assert.match(otp.demoCode,/^\d{6}$/);
assert.equal((await post('/v1/otp/verify',{id:otp.id,code:otp.demoCode})).status,200);
assert.equal((await post('/v1/otp/verify',{id:otp.id,code:otp.demoCode})).status,401);
JS
