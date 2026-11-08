#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
command -v cargo-ndk >/dev/null 2>&1 || {
  echo "Needs cargo-ndk (cargo install cargo-ndk) and the Android NDK (ANDROID_NDK_HOME)." >&2
  exit 1
}
for target in aarch64-linux-android armv7-linux-androideabi x86_64-linux-android; do
  rustup target list --installed | grep -qx "$target" || rustup target add "$target"
done
cargo ndk --manifest-path rust/Cargo.toml \
  -t arm64-v8a -t armeabi-v7a -t x86_64 \
  -o android/src/main/jniLibs \
  build --release --lib
echo "Built android/src/main/jniLibs"
