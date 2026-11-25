# MyPrayer

Wave 1 is a static portal with simulated staff login. Use sample credentials during review.

## Compute Engine

The Google Cloud setup uses a single Debian e2-micro VM with nginx and a standard disk. The VM fetches the public GitHub main branch approximately once a minute and switches to a validated copy of the portal. The deployed commit SHA is available at /revision.txt. The VM needs outbound Internet access to fetch GitHub and Debian packages.

Run the provisioning script in an authorized, billing-enabled MyPrayer Google Cloud project.

```sh
bash deploy/gcp/provision.sh PROJECT_ID us-central1-a
```

The firewall allows SSH and HTTP through Identity-Aware Proxy for the private preview. Preview access requires the IAP tunnel permission in the target project. Use Cloud Shell or an authenticated Google Cloud CLI to open the tunnel.

```sh
gcloud compute start-iap-tunnel myprayer-web 80 \
  --project=PROJECT_ID --zone=us-central1-a --local-host-port=localhost:8080
```

Open http://localhost:8080 and check /revision.txt against the GitHub main commit. To diagnose a failed update, check the myprayer-sync systemd service and timer on the VM.
