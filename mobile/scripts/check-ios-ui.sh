#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/notes-again-ui.XXXXXX")
app_build=${IOS_UI_BUILD_DIR:-"$work/app-build"}
sim=

cleanup() {
  if [ -n "$sim" ]; then
    xcrun simctl shutdown "$sim" >/dev/null 2>&1 || true
    xcrun simctl delete "$sim" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf 'Build logs and test results: %s\n' "$work"
selection=$(xcrun simctl list runtimes -j | python3 -c '
import json,sys
runtimes = [r for r in json.load(sys.stdin)["runtimes"] if r.get("isAvailable") and r.get("platform") == "iOS"]
def preference(runtime):
    target = any(d["name"] == "iPhone 18 Pro" for d in runtime.get("supportedDeviceTypes", []))
    return tuple(map(int, runtime["version"].split("."))), target
for runtime in sorted(runtimes, key=preference, reverse=True):
    devices = [d for d in runtime.get("supportedDeviceTypes", []) if d.get("productFamily") == "iPhone"]
    if devices:
        device = next((d for d in devices if d["name"] == "iPhone 18 Pro"), devices[0])
        print(device["identifier"], runtime["identifier"])
        break
else:
    raise SystemExit("No installed iPhone simulator runtime is available")
')
device=${selection%% *}
runtime=${selection#* }
sim=$(xcrun simctl create "Notes Again writing safety audit" "$device" "$runtime")
xcrun simctl boot "$sim"
xcrun simctl bootstatus "$sim" -b > "$work/simulator-boot.log" 2>&1

if ! xcodebuild -workspace "$root/ios/NotesAgain.xcworkspace" -scheme NotesAgain \
  -configuration Release -sdk iphonesimulator -destination "id=$sim" \
  -derivedDataPath "$app_build" CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES ARCHS=arm64 \
  build > "$work/app-build.log" 2>&1; then
  tail -80 "$work/app-build.log"
  exit 1
fi
xcrun simctl install "$sim" "$app_build/Build/Products/Release-iphonesimulator/NotesAgain.app"
ruby "$root/scripts/create-ios-ui-project.rb" "$work/ui-project"
printf '' | xcrun simctl pbcopy "$sim"
xcodebuild -project "$work/ui-project/WritingSafety.xcodeproj" -scheme WritingSafety \
  -sdk iphonesimulator -destination "id=$sim" -derivedDataPath "$work/ui-build" \
  -resultBundlePath "$work/WritingSafety.xcresult" -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO test -quiet
xcrun simctl pbpaste "$sim" > "$work/shared-note.md"
python3 - "$work/shared-note.md" <<'PY'
import pathlib,sys
markdown = pathlib.Path(sys.argv[1]).read_text()
assert "Native share " in markdown, "Shared Markdown is missing the created note's title"
assert "Latest native edits." in markdown, "Shared Markdown is missing the latest editor changes"
print("Native sharing passed: simulator clipboard contains the title and latest edits.")
PY
