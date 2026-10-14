#!/usr/bin/env bash
# Export the learner-subtitles library (packages/core + packages/react-native)
# into a standalone repository layout. Rerun is the source of truth; the
# library repo is regenerated from it.
#
#   scripts/export-oss.sh ../learner-subtitles
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
dest="${1:?usage: scripts/export-oss.sh <dest-dir>}"
mkdir -p "$dest"
dest="$(cd "$dest" && pwd)"

# Library-only files kept in this repo under oss/.
rsync -a --exclude node_modules "$root/oss/learner-subtitles/" "$dest/"

rm -rf "$dest/src" "$dest/test"
mkdir -p "$dest/src/core" "$dest/src/react-native" "$dest/test"
cp "$root"/packages/core/src/*.ts "$dest/src/core/"
cp "$root"/packages/react-native/src/*.ts* "$dest/src/react-native/"
cp "$root"/packages/core/test/*.test.ts "$dest/test/"

# Inside the library the core is a sibling folder, not a package.
sed -i '' 's#from "@rerun/core"#from "../core"#' "$dest"/src/react-native/*.ts*
# Tests import ../src/<module>; the core now lives in ../src/core/.
sed -i '' -E 's#from "\.\./src/([a-z]+)(\.js)?"#from "../src/core/\1"#' "$dest"/test/*.test.ts

echo "exported to $dest"
