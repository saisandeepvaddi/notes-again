#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
crate=rust
out=ios/NotesAgainCore.xcframework
profile="${PROFILE:-release}"
flag=""
[ "$profile" = release ] && flag="--release"
lib=libnotes_again_mobile.a

for target in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios; do
  rustup target list --installed | grep -qx "$target" || rustup target add "$target"
  IPHONEOS_DEPLOYMENT_TARGET=16.4 cargo build --manifest-path "$crate/Cargo.toml" --lib $flag --target "$target"
done

simulator="$crate/target/ios-simulator/$profile"
mkdir -p "$simulator"
lipo -create \
  "$crate/target/aarch64-apple-ios-sim/$profile/$lib" \
  "$crate/target/x86_64-apple-ios/$profile/$lib" \
  -output "$simulator/$lib"

rm -rf "$out"
xcodebuild -create-xcframework \
  -library "$crate/target/aarch64-apple-ios/$profile/$lib" -headers "$crate/include" \
  -library "$simulator/$lib" -headers "$crate/include" \
  -output "$out"
echo "Built $out"
