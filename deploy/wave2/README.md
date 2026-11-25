# Run the Wave 2 portal

This stack serves the existing visitor site and the staff service on one origin.
Staff links open password or development OTP sign-in. The internal camera flow asks for a front view and a randomly chosen turn. Both images must match the enrolled face, pass the presentation-attack classifier and satisfy the requested pose change. Camera JPEGs exist only in request and worker memory. A failed, expired or consumed challenge requires fresh sign-in.

1. Prepare an isolated Atlas database and a private directory outside the repository containing a consented, single-face enrollment JPEG named after its opaque enrollment key. The runtime user (UID 1000) needs read access. Restrict administrative write access. Replace the enrollment key on the account when re-enrolling so existing sessions become invalid.
2. Create a private environment file containing MONGODB_URI, MONGODB_DB, STAFF_CREDENTIAL_HMAC_KEY (a random secret of at least 32 bytes), PORTAL_ORIGIN (the browser-visible HTTPS origin), MYPRAYER_ENVIRONMENT=development and NODE_ENV=development. Production uses production for both settings and disables the test account and dummy OTP.
3. Export MYPRAYER_ENV_FILE and MYPRAYER_ENROLLMENTS as absolute paths, and run the commands below from the repository root. Configure the existing HTTPS reverse proxy or private Cloud Shell web preview to forward the configured origin to the stack on loopback port 8080.
4. For a first development deployment, create the test operator using an enrolled person's reference image and a new password of 15–256 characters. Creation is transactional and refuses duplicate accounts. The command reads the password on stdin.

```bash
docker compose -f deploy/wave2/compose.yaml up -d --build
read -rsp 'New test operator password: ' test_password
printf '%s' "$test_password" | docker compose -f deploy/wave2/compose.yaml exec -T staff \
  node src/provision-tester.ts tester enrollment-key temple-key district-key
unset test_password
```

Open the visitor site and choose Staff login. Complete either the password or development OTP (demo-000001), allow the camera, follow both poses, and explicitly confirm a role. Use My assignment to switch between Ministry and Temple workspaces or to sign out. District records come from ministry_temple_summary.

Test on the intended cameras with consenting subjects before operational use. Measure false matches, false rejections and presentation attacks against the application's thresholds. The model smoke check only verifies loading and inference. The UI and demo OTP do not establish the identity of a new enrollee. Enrollment and assignment of ordinary staff use the existing trusted administrative data process.
