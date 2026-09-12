#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "$0")/.." && pwd)"
output_dir="$root_dir/public/audio"
mkdir -p "$output_dir"

# These are original offline callouts generated with macOS Chinese system voices.
# Runtime playback uses the checked-in MP3 files and needs no speech service.
lines=(
  'slash|Eddy (Chinese (China mainland))|杀！'
  'dodge|Tingting|闪！'
  'peach|Tingting|桃！'
  'nullify|Eddy (Chinese (China mainland))|无懈可击！'
  'duel|Eddy (Chinese (China mainland))|决斗！'
  'arrows|Eddy (Chinese (China mainland))|万箭齐发！'
  'barbarians|Eddy (Chinese (China mainland))|南蛮入侵！'
  'harvest|Tingting|五谷丰登！'
  'peachGarden|Tingting|桃园结义！'
  'drawTwo|Tingting|无中生有！'
  'indulgence|Tingting|乐不思蜀！'
  'lightning|Eddy (Chinese (China mainland))|闪电！'
  'equipment|Eddy (Chinese (China mainland))|装备！'
  'victory|Tingting|大获全胜！'
  'defeat|Eddy (Chinese (China mainland))|胜败乃兵家常事。'
)

for line in "${lines[@]}"; do
  IFS='|' read -r name voice words <<< "$line"
  input="$(mktemp "${TMPDIR:-/tmp}/wargrid-voice.XXXXXX.aiff")"
  say -v "$voice" -r 225 -o "$input" "$words"
  ffmpeg -hide_banner -loglevel error -y -i "$input" \
    -af 'highpass=f=110,acompressor=threshold=-22dB:ratio=2.5:attack=8:release=90' \
    -c:a libmp3lame -q:a 5 "$output_dir/$name.mp3"
  rm -f "$input"
done
