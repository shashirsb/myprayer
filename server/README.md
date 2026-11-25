# MyPrayer staff access service

This Wave 2 service manages staff sign-in challenges, scoped sessions and access decisions. It runs separately from the currently deployed static portal. The integration tests use synthetic provider evidence and an in-memory store.

## Run the checks

Use Node.js 22.18 or later.

```sh
npm ci
npm run check
npm test
```

## Connect a staging environment

Provide an isolated MongoDB Atlas database. The service creates indexes for account lookups, one-time challenges, sessions and access events. Challenge and session reads enforce expiry directly. TTL indexes remove expired records afterward. Keep provider credentials and the MongoDB URI in the deployment's secret store.

| Environment variable | Value |
| --- | --- |
| `MYPRAYER_ENVIRONMENT` | `development`, `staging` or `production` |
| `MONGODB_URI`, `MONGODB_DB` | Connection secret and database name |
| `PORTAL_ORIGIN` | HTTPS origin shared by the frontend and its reverse-proxied API |
| `PRIMARY_PROVIDER_ORIGIN`, `PRIMARY_PROVIDER_TOKEN` | First-factor gateway HTTPS origin and service token |
| `PHOTO_PROVIDER_ORIGIN`, `PHOTO_PROVIDER_TOKEN` | Photo verification gateway HTTPS origin and service token |
| `PHOTO_CAPTURE_ORIGIN` | Approved HTTPS origin for the camera flow |
| `PORT` | Listening port, default 8080 |

Run `npm start` after connecting the gateways. The service expects a TLS-terminating reverse proxy. Configure request rate limits for sign-in and verification at that proxy and in the gateways before exposing the API.

### Gateway contracts

The primary gateway resolves the login identifier to an enrolled account and performs password or single-use OTP verification. The portal gets an opaque proof only after first-factor verification. The access service sends the proof to `POST /v1/verify-proof` with a service bearer token. Success returns `accountId`, `method` (`password` or `otp`), `authenticatedAt` (ISO 8601), and a unique per-authentication `receipt`. The MyPrayer service accepts a proof authenticated within the last minute and records the hashed receipt to prevent replay.

The photo gateway accepts `{attemptId, enrollment}` at `POST /v1/photo-challenges` and returns `{id, captureUrl}`. It binds the resulting fresh camera session to the enrolled person and attempt. After the camera flow completes, the service requests `POST /v1/photo-results` with `{id}`. The result contains `{attemptId, photoId, enrollment, liveness, match}`. Only completed, successful liveness and one-to-one match results for the same attempt can create a session. Keep reference photos and biometric templates within the photo service. The access service receives only the opaque enrollment reference and verification outcome.

### Portal contract

- `POST /v1/sign-in` accepts `{proof}` and returns the capture URL with a short-lived challenge cookie.
- `POST /v1/photo/complete` checks server-side evidence after the camera flow and returns a staff session cookie.
- `GET /v1/session` returns the current assignment and available assignments.
- `POST /v1/assignment` accepts `{assignment}` and rotates the session token on confirmation.
- `POST /v1/access/check` accepts `{permission, institution, station?}` and returns an access decision. Business handlers must call the same server-side authorization function with scope resolved from their own records.
- `POST /v1/sign-out` invalidates the session and pending challenge.

Development test accounts require photo verification and explicit assignment selection. Provision their synthetic assignments only in an isolated development database.

### Staging acceptance

Connect the real first-factor and photo gateways and wire the portal sign-in, camera and role-selection screens. Test real provider responses and Atlas indexes in a staging environment. Wire business handlers to server-side resource lookup and scope checks, including a separate fresh operator verification for counter printing. Verify enrollment, revocation, station/shift rules and the appearance of audit events before enabling production staff access.
