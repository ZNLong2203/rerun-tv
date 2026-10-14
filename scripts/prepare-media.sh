#!/usr/bin/env bash
# Download a title's source video, transcode it to a TV-friendly MP4 and grab a
# poster frame. Re-runnable: downloads resume and finished steps are skipped.
#
#   scripts/prepare-media.sh tears-of-steel [poster-second]
set -euo pipefail

id="${1:?usage: scripts/prepare-media.sh <title-id> [poster-second]}"
poster_at="${2:-150}"
root="$(cd "$(dirname "$0")/.." && pwd)"
meta="$root/content/$id/meta.json"
media="$root/media"
mkdir -p "$media"

read_meta() { node -e "const m=require(process.argv[1]); console.log($1)" "$meta"; }
src_url="$(read_meta 'm.video.sourceUrl')"
out="$media/$(read_meta 'm.video.file')"
raw="$media/$id.source.${src_url##*.}"

if [ ! -f "$out" ]; then
  echo "→ downloading $src_url (resumes if interrupted)"
  curl -L --fail --retry 5 -C - -o "$raw" "$src_url"

  # H.264 High@4.1 + AAC stereo, keyframe every 2 s so seeking to a line is
  # quick, and the index at the front (faststart) for byte-range playback.
  echo "→ transcoding to $out"
  ffmpeg -hide_banner -loglevel warning -y -i "$raw" \
    -map 0:v:0 -map 0:a:0 \
    -c:v libx264 -profile:v high -level 4.1 -pix_fmt yuv420p -preset slow -crf 22 \
    -vf "scale=-2:720" -g 48 -keyint_min 48 -sc_threshold 0 \
    -c:a aac -b:a 160k -ac 2 \
    -movflags +faststart "$out"
fi

poster="$media/$id.jpg"
if [ ! -f "$poster" ]; then
  echo "→ poster at ${poster_at}s"
  ffmpeg -hide_banner -loglevel warning -y -ss "$poster_at" -i "$out" -frames:v 1 -vf "scale=1120:-2" -q:v 3 "$poster"
fi

ls -lh "$out" "$poster"
