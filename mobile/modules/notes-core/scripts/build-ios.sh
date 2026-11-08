#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
crate=rust
out=ios/NotesAgainCore.xcframework
profile="${PROFILE:-release}"
flag=""
[ "$profile" = release ] && flag="--release"

for target in aarch64-apple-ios aarch64-apple-ios-sim; do
  rustup target list --installed | grep -qx "$target" || rustup target add "$target"
  IPHONEOS_DEPLOYMENT_TARGET=16.4 cargo build --manifest-path "$crate/Cargo.toml" --lib $flag --target "$target"
done

rm -rf "$out"
xcodebuild -create-xcframework \
  -library "$crate/target/aarch64-apple-ios/$profile/libnotes_again_mobile.a" -headers "$crate/include" \
  -library "$crate/target/aarch64-apple-ios-sim/$profile/libnotes_again_mobile.a" -headers "$crate/include" \
  -output "$out"
echo "Built $out"
