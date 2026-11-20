#!/bin/sh
# Development only: keep a local HackDesk on the newest unsigned GitHub build.
# This is not a supported install or update path for users; see docs/install.md.
#
# Usage: scripts/update-macos.sh [beta|main]   (default: beta)
#   beta  newest v2.* pre-release
#   main  newest main-<commit> preview
# Set HACKDESK_APP_DIR to install somewhere other than /Applications.
#
# `gh release download` does not set com.apple.quarantine, so the installed
# app opens without the `xattr -dr com.apple.quarantine` step a browser
# download needs. Requires an authenticated GitHub CLI (`gh auth login`).
set -eu

repo=EastSun5566/hackdesk
channel=${1:-beta}
dest=${HACKDESK_APP_DIR:-/Applications}
app="$dest/HackDesk.app"

[ "$(uname -s)" = Darwin ] || { echo "macOS only" >&2; exit 2; }
case "$(uname -m)" in arm64) arch=arm64 ;; *) arch=x64 ;; esac
case "$channel" in
  beta) prefix=v2. ;;
  main) prefix=main- ;;
  *) echo "unknown channel: $channel (use beta or main)" >&2; exit 2 ;;
esac

tag=$(gh release list -R "$repo" --exclude-drafts -L 100 --json tagName,publishedAt \
  -q "[.[] | select(.tagName | startswith(\"$prefix\"))] | sort_by(.publishedAt) | last | .tagName // empty")
[ -n "$tag" ] || { echo "no $channel release found" >&2; exit 1; }

asset=$(gh release view "$tag" -R "$repo" --json assets \
  -q ".assets[].name | select(startswith(\"HackDesk-\") and endswith(\"-$arch.zip\"))")
[ -n "$asset" ] || { echo "$tag has no $arch zip" >&2; exit 1; }
latest=$(printf '%s\n' "$asset" | sed -E "s/^HackDesk-(.*)-$arch\\.zip\$/\\1/")
current=$(defaults read "$app/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || true)

if [ "$current" = "$latest" ]; then
  echo "HackDesk $current is up to date"
  exit 0
fi
if pgrep -qf "$app/Contents/MacOS/HackDesk"; then
  echo "HackDesk $latest is available; quit HackDesk and rerun to install" >&2
  exit 75
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
echo "Installing HackDesk $latest ($tag) over ${current:-nothing} in $dest"
gh release download "$tag" -R "$repo" -p "$asset" -D "$tmp"
ditto -x -k "$tmp/$asset" "$tmp/extracted"
[ -d "$tmp/extracted/HackDesk.app" ] || { echo "$asset has no HackDesk.app" >&2; exit 1; }
rm -rf "$app"
ditto "$tmp/extracted/HackDesk.app" "$app"
echo "Installed $app"
