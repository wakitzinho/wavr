#!/bin/bash
# wavr-yt — Download YouTube audio → ~/Music/Wavr
# Usage:
#   wavr-yt <URL>                        single video
#   wavr-yt <playlist-URL>               full playlist
#   wavr-yt <URL1> <URL2> ...            multiple videos
#
# Dependencies: yt-dlp, ffmpeg
#   sudo pacman -S yt-dlp ffmpeg

set -euo pipefail

WAVR_DIR="$HOME/Music/Wavr"
BOLD='\033[1m'
GREEN='\033[38;5;154m'
DIM='\033[2m'
RED='\033[31m'
RESET='\033[0m'

# ── check deps ────────────────────────────────────────────────────────────────
for cmd in yt-dlp ffmpeg; do
  if ! command -v "$cmd" &>/dev/null; then
    echo -e "${RED}Missing: $cmd${RESET}"
    echo "Install with: sudo pacman -S $cmd"
    exit 1
  fi
done

if [[ $# -eq 0 ]]; then
  echo -e "${BOLD}wavr-yt${RESET} — download YouTube audio to Wavr"
  echo ""
  echo "Usage: wavr-yt <YouTube URL> [URL2] [URL3] ..."
  echo ""
  echo "Examples:"
  echo "  wavr-yt https://youtu.be/dQw4w9WgXcQ"
  echo "  wavr-yt 'https://youtube.com/playlist?list=...'"
  echo "  wavr-yt https://youtu.be/abc https://youtu.be/xyz"
  exit 0
fi

mkdir -p "$WAVR_DIR"

echo -e "${GREEN}${BOLD}wavr-yt${RESET}"
echo -e "${DIM}Output: $WAVR_DIR${RESET}"
echo ""

# ── download ──────────────────────────────────────────────────────────────────
# We use a temp dir so yt-dlp doesn't write partial files directly into Wavr.
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

YTDLP_EXIT=0
yt-dlp \
  --extract-audio \
  --audio-format mp3 \
  --audio-quality 0 \
  --embed-thumbnail \
  --embed-metadata \
  --add-metadata \
  --parse-metadata "%(title)s:%(meta_title)s" \
  --parse-metadata "%(uploader)s:%(meta_artist)s" \
  --output "$TMP_DIR/%(title)s.%(ext)s" \
  --no-playlist-reverse \
  --ignore-errors \
  --no-warnings \
  --progress \
  "$@" || YTDLP_EXIT=$?

if [[ $YTDLP_EXIT -ne 0 ]]; then
  echo -e "${DIM}(some videos in the batch/playlist were unavailable or failed — continuing with what downloaded)${RESET}"
fi

# ── move to Wavr dir ──────────────────────────────────────────────────────────
MOVED=0
SKIPPED=0

for f in "$TMP_DIR"/*.mp3; do
  [[ -e "$f" ]] || continue
  base="$(basename "$f")"
  dest="$WAVR_DIR/$base"

  if [[ -f "$dest" ]]; then
    echo -e "${DIM}Skipped (exists): $base${RESET}"
    ((SKIPPED++)) || true
  else
    mv "$f" "$dest"
    echo -e "${GREEN}✓${RESET} $base"
    ((MOVED++)) || true
  fi
done

echo ""
if [[ $MOVED -gt 0 ]]; then
  echo -e "${GREEN}${BOLD}Done!${RESET} $MOVED song$([ $MOVED -ne 1 ] && echo 's') saved to ~/Music/Wavr"
  echo -e "${DIM}Open Wavr and click \"Add songs\" → navigate to ~/Music/Wavr to import them.${RESET}"
else
  echo -e "${DIM}Nothing new downloaded.${RESET}"
fi
[[ $SKIPPED -gt 0 ]] && echo -e "${DIM}$SKIPPED already existed, skipped.${RESET}"
