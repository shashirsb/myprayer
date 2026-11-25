#!/usr/bin/env bash
set -euo pipefail
umask 022

repository=${MYPRAYER_REPOSITORY:-https://github.com/shashirsb/myprayer.git}
root=${MYPRAYER_SITE_ROOT:-/var/lib/myprayer}
install -d -m 0755 "$root" "$root/releases"
exec 9>"$root/sync.lock"
flock -n 9 || exit 0

remote_revision=$(git ls-remote --exit-code "$repository" refs/heads/main | cut -f1)
if [[ $(readlink "$root/current" || true) == "releases/$remote_revision" ]]; then
  exit 0
fi

candidate=$(mktemp -d "$root/releases/.candidate.XXXXXXXX")
trap 'rm -rf -- "$candidate"' EXIT

git -C "$candidate" init -q
git -C "$candidate" -c advice.detachedHead=false fetch -q --depth=1 "$repository" refs/heads/main
revision=$(git -C "$candidate" rev-parse --verify FETCH_HEAD)
if [[ $(readlink "$root/current" || true) == "releases/$revision" ]]; then
  exit 0
fi

git -C "$candidate" archive "$revision" site | tar -x -C "$candidate"
test -z "$(find "$candidate/site" -type l -print -quit)"
test -s "$candidate/site/index.html"
for image in temple-hero temple-feature temple-login module-{1..6} ticket-{1..6}; do
  test -s "$candidate/site/assets/$image.jpg"
done
printf '%s\n' "$revision" > "$candidate/site/revision.txt"
if [[ ! -d "$root/releases/$revision" ]]; then
  mv "$candidate/site" "$root/releases/$revision"
fi
ln -s "releases/$revision" "$candidate/current"
mv -Tf "$candidate/current" "$root/current"

# Keep the active release and the two most recent previous releases.
find "$root/releases" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -printf '%T@ %f\n' |
  sort -nr | awk -v current="$revision" '$2 != current && ++previous > 2 {print $2}' |
  while IFS= read -r old; do
    [[ "$old" =~ ^[a-f0-9]{40}$ ]] && rm -rf -- "$root/releases/$old"
  done
