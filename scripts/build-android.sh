#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -z "${JAVA_HOME:-}" && -d /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ]]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
fi

if [[ -z "${ANDROID_HOME:-}" && -d /opt/homebrew/share/android-commandlinetools ]]; then
  export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
fi

if [[ -z "${ANDROID_HOME:-}" ]]; then
  echo "ANDROID_HOME 未设置，请先安装 Android SDK。" >&2
  exit 1
fi

printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties

pnpm build
pnpm exec cap sync android
(cd android && ./gradlew assembleDebug)

mkdir -p release
cp android/app/build/outputs/apk/debug/app-debug.apk release/Wargrid-0.1.0-debug.apk
echo "APK: $ROOT_DIR/release/Wargrid-0.1.0-debug.apk"
