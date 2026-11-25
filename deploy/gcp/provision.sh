#!/usr/bin/env bash
set -euo pipefail

project=${1:?Usage: bash deploy/gcp/provision.sh PROJECT_ID [ZONE]}
zone=${2:-us-central1-a}
region=${zone%-*}
network=myprayer-vpc
subnet=myprayer-subnet
instance=myprayer-web
source_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
startup=$(mktemp)
trap 'rm -f "$startup"' EXIT
{
  printf '#!/usr/bin/env bash\nMYPRAYER_SYNC_BASE64=%s\n' "$(base64 < "$source_dir/sync-site.sh" | tr -d '\n')"
  tail -n +2 "$source_dir/bootstrap.sh"
} > "$startup"
bash -n "$startup"

gc() { gcloud --quiet --project="$project" "$@"; }
gc projects describe "$project" --format='value(projectId)'
gc services enable compute.googleapis.com iap.googleapis.com oslogin.googleapis.com

if ! gc compute networks describe "$network" >/dev/null 2>&1; then
  gc compute networks create "$network" --subnet-mode=custom
fi
if ! gc compute networks subnets describe "$subnet" --region="$region" >/dev/null 2>&1; then
  gc compute networks subnets create "$subnet" --network="$network" --region="$region" --range=10.72.0.0/24
fi
if ! gc compute firewall-rules describe myprayer-iap >/dev/null 2>&1; then
  gc compute firewall-rules create myprayer-iap --network="$network" \
    --allow=tcp:22,tcp:80 --source-ranges=35.235.240.0/20 --target-tags=myprayer-web
fi
if ! gc compute instances describe "$instance" --zone="$zone" >/dev/null 2>&1; then
  gc compute instances create "$instance" --zone="$zone" --machine-type=e2-micro \
    --subnet="$subnet" --tags=myprayer-web --image-family=debian-12 --image-project=debian-cloud \
    --boot-disk-type=pd-standard --boot-disk-size=10GB --no-service-account --no-scopes \
    --metadata=enable-oslogin=TRUE --metadata-from-file=startup-script="$startup"
fi
gc compute instances describe "$instance" --zone="$zone" --format='yaml(name,status,zone,machineType)'
