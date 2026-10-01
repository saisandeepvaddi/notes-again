# Notes Again mobile

An iOS and Android app for the parts of Notes Again you want on your phone:
reviewing what's due, reading notes, quick edits, and writing new notes. Organizing,
importing, the trash and settings stay in the web app.

Built with [Expo](https://expo.dev) and React Native.

## Connect to your server

Open the app and enter the address you use for Notes Again in a browser
(`notes.example.com`, or `http://192.168.1.20:8000` for a server on your network).
The app checks how the server signs people in:

- **Username and password** (the default `local` sign-in): sign in as you would on
  the web. The app gets its own token, listed under Settings → API tokens as
  "Mobile app (device name)". Signing out of the app revokes it.
- **API token**: in the web app, open Settings → API tokens, create a token with
  **Full access**, and paste it into the app. Use this for Firebase, proxy or
  Cloudflare Access sign-in, or if you'd rather not type your password on the phone.
  Capture-only tokens made for the browser extension won't work here.
- **Sign-in turned off**: the app connects straight away.

A server behind Cloudflare Access or a sign-in proxy has to let the app's requests
reach `/api`, for example with a separate Access application for the `/api` path that
uses a Bypass policy. The app can't complete those browser sign-in pages itself, and
the server still requires its API token on every request.

## Run it

```sh
cd mobile
pnpm install
pnpm start          # then press i (iOS simulator), a (Android) or scan the QR code with Expo Go
```

From a phone, the server address must be reachable from the phone, so use your
computer's LAN address rather than `localhost`. For a local backend that phones can
reach, start it with `--host 0.0.0.0`.

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
