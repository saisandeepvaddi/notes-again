# Notes Again mobile

An iOS and Android app with everything Notes Again does: reviewing, reading and
writing notes, projects and tags, the trash, import and export. Your notes are stored
on the phone, so it all works offline; sync keeps them in step with a server or the
desktop app.

Built with [Expo](https://expo.dev) and React Native. The phone runs the same Rust
server as the desktop app, inside the app (`modules/notes-core`), and the screens talk
to it on `127.0.0.1`.

## Sync

Settings → Sync connects the phone's notes to:

- **The desktop app**, with no server: in the desktop app turn on Settings → Phone &
  extension → Let my phone connect, tap Pair a phone, and scan the QR code. The phone
  syncs whenever both are on the same Wi-Fi and the desktop app is open.
- **A Notes Again server**: sign in with its username and password, or scan the QR code
  from the web app's Settings → API tokens (a token with **Full access**). Use the QR
  code for Firebase, proxy or Cloudflare Access sign-in.

Changes made offline sync when the phone can reach the other side again. A note edited
in two places shows up under Changed in two places in the Sync screen, where you pick
the version to keep.

A server behind Cloudflare Access or a sign-in proxy has to let the app's requests
reach `/api`, for example with a separate Access application for the `/api` path that
uses a Bypass policy.

## Run it

The app needs a development build (it includes native code, so Expo Go can't load it).
On a Mac with Xcode, Rust and CocoaPods:

```sh
cd mobile
pnpm install
modules/notes-core/scripts/build-ios.sh     # the Rust server as an XCFramework
pnpm ios                                     # prebuild, build and launch in the simulator
```

Android needs the Android SDK and NDK plus `cargo install cargo-ndk`, then
`modules/notes-core/scripts/build-android.sh` and `pnpm android`.

After the first build, `pnpm start` serves JavaScript changes to the installed
development build. Rebuild only when native code or `modules/notes-core` changes.

Without the native module (for example in Expo Go), the app falls back to connecting
straight to a server, as it did before it kept its own notes.

From a phone, the server address must be reachable from the phone, so use your
computer's LAN address rather than `localhost`. For a local backend that phones can
reach, start it with `--host 0.0.0.0`.

If the phone can't reach your computer over Wi-Fi (Expo Go keeps "taking much longer
than it should"), the router is probably isolating devices from each other. With
[Tailscale](https://tailscale.com) on both, run `pnpm start:tailscale` so the QR code
points at the computer's Tailscale address, and use `http://<that address>:8000` as
the server in the app.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm doctor         # Expo's dependency and config checks
```

## Building for devices

There's no store build set up yet. To install outside Expo Go, make a development or
release build with `npx expo run:ios` / `npx expo run:android`, or with
[EAS Build](https://docs.expo.dev/build/introduction/).
