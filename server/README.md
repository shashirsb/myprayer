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
| `STAFF_CREDENTIAL_HMAC_KEY` | At least 32 bytes of random secret material for keyed credential limits and demo OTP digests |
| `PHOTO_PROVIDER_ORIGIN`, `PHOTO_PROVIDER_TOKEN` | Photo verification gateway HTTPS origin and service token |
| `PHOTO_CAPTURE_ORIGIN` | Approved HTTPS origin for the camera flow |
| `PORT` | Listening port, default 8080 |

Run `npm start` after connecting the gateways. The service expects a TLS-terminating reverse proxy. Configure request rate limits for sign-in and verification at that proxy and in the gateways before exposing the API.

### Gateway contracts

The photo gateway accepts `{attemptId, enrollment}` at `POST /v1/photo-challenges` and returns `{id, captureUrl}`. It binds the resulting fresh camera session to the enrolled person and attempt. After the camera flow completes, the service requests `POST /v1/photo-results` with `{id}`. The result contains `{attemptId, photoId, enrollment, liveness, match}`. Only completed, successful liveness and one-to-one match results for the same attempt can create a session. Keep reference photos and biometric templates within the photo service. The access service receives only the opaque enrollment reference and verification outcome.

### Portal contract

- `POST /v1/password` and development-only `POST /v1/otp/verify` return the capture URL with a short-lived challenge cookie.
- `POST /v1/photo/complete` checks server-side evidence after the camera flow and returns a staff session cookie.
- `GET /v1/session` returns the current assignment and available assignments.
- `POST /v1/assignment` accepts `{assignment}` and rotates the session token on confirmation.
- `POST /v1/access/check` accepts `{permission, institution, station?}` and returns an access decision. Business handlers must call the same server-side authorization function with scope resolved from their own records.
- `POST /v1/sign-out` invalidates the session and pending challenge.

Development test accounts require photo verification and explicit assignment selection. Provision their synthetic assignments only in an isolated development database.

### Staging acceptance

Connect the real first-factor and photo gateways and wire the portal sign-in, camera and role-selection screens. Test real provider responses and Atlas indexes in a staging environment. Wire business handlers to server-side resource lookup and scope checks, including a separate fresh operator verification for counter printing. Verify enrollment, revocation, station/shift rules and the appearance of audit events before enabling production staff access.

### Role catalogue and workspaces

Assignments store the stable role identifiers in `src/roles.ts` and an explicit subset of permitted actions. The role template caps the assignment's grants. Staff with multiple assignments select one active assignment, and changing it rotates the session.

The session response identifies the workspace for each assignment. **Temple** covers local temple operations and workforce access. **Ministry** covers departmental and jurisdictional oversight and assigned government cases. Jurisdiction aggregate access is checked independently of case and temple operations. Project-core membership has no operational grants.

Each protected business handler must resolve institution, jurisdiction, station, shift, case and work order from server-side records. Sensitive approvals additionally need their own current authority instrument, any applicable amount limit, and a different underlying initiator. The generic access check intentionally takes only institution and station and cannot grant access to approvals that require trusted case or authority context. The catalogue does not establish statutory authority. Load approved authority instruments and routing for the target institutions before enabling those actions.

The protected staging preview at `GET /ministry` reads the active Ministry assignment from the staff session. Module cards and their detail drawers reflect its candidate permissions. Live registry, inspection, finance and report feeds remain to be integrated. Test data and artwork are illustrative.

### District registry feed and container

The staging container uses the `server/` directory as its build context. Build it with `docker build -t myprayer-access ./server`. Configure secrets at runtime. The image defaults to production mode and rejects development test accounts.

The Ministry district view reads bounded summaries from `ministry_temple_summary`. An authorized import writes `id`, `name`, `institution`, `jurisdiction`, `stateScope`, `inspection` (Due or Current) and `exceptions` (nonnegative count). Use stable, globally namespaced jurisdiction IDs and the assigned state scope key. Keep personal and financial details in their own approved evidence systems. The current table displays up to 100 summaries per scope. Direct temple links resolve only from the same scoped result set. State and district scopes never come from URL parameters.

### MyPrayer password and demo OTP

The access service verifies passwords internally via `POST /v1/password` with
`{login,password}`. Store lowercase login identifiers in `staff_credentials`,
linked to `staff_accounts.id`. Use `hashStaffPassword` from `src/credentials.ts`
when provisioning a credential. Set `STAFF_CREDENTIAL_HMAC_KEY` via the
deployment secret store. The previous external first-factor proof endpoint
is disabled in the configured service.

Development only, a synthetic account may have a unique `demoOtpPhone` like
`demo-000001`. Call `POST /v1/otp/request` with `{phone}`, then
`POST /v1/otp/verify` with `{id,code}` from that same challenge. No SMS is sent.
Both password and demo OTP return a photo challenge. They cannot create a
staff session on their own. Production and staging reject the demo OTP
routes.

### Local face comparison trial

Install OpenCV with DNN face bindings and obtain the YuNet and SFace ONNX
files from the OpenCV Zoo. Run the model only with consenting test fixtures.

```sh
python3 photo-model/match.py --detector models/yunet.onnx \
  --recognizer models/sface.onnx --reference fixture-reference.jpg \
  --capture fixture-capture.jpg
```

The default threshold is for demonstration and must be evaluated on the
target cameras. The runner checks one-to-one face similarity; it emits
`liveness: null` and is deliberately separate from the login authorization path.
The camera flow and a validated liveness check remain required to issue a
staff session.

Open `/staff/sign-in` on the HTTPS origin serving the Wave 2 backend. The UI
uses the same-origin APIs and secure cookies. Complete the camera check in its
own tab before continuing. Multi-assignment staff choose a workspace after
verification. Ministry opens the protected preview. Temple opens a protected
landing page while its operational modules are being integrated.
