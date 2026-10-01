# Notes Again mobile

Expo SDK 57 app (React Native 0.86, Expo Router, TanStack Query, Zod 4). Its own pnpm root. The repo-root [AGENTS.md](../AGENTS.md) conventions apply here too (no code comments; run formatters only on files you touch).

## Expo changes every SDK

Don't trust remembered Expo or React Native APIs. Check the `expo` major in `package.json` and read the versioned docs (`https://docs.expo.dev/versions/v57.0.0/`). The installed `.d.ts` files are the final word. Add dependencies with `npx expo install <pkg>`, not `pnpm add`, so versions match the SDK.

## Layout

- `src/app/`: routes only. `connect` shows when there's no stored connection, `(app)` when there is (`Stack.Protected` in `src/app/_layout.tsx`). `(app)/(tabs)` holds the native tabs. Today and Notes share one stack layout through the `(index,notes)` group. Note detail, review, new and edit notes sit on the `(app)` stack so they cover the tab bar.
- `src/screens/`: screen bodies the routes render.
- `src/api/`: `client.ts` (fetch + Zod parsing, bearer token, 401 → back to Connect), `connection-store.ts` (SecureStore), `connect.ts` (server probe and sign-in), `notes.ts` (query hooks). Query keys use the web app's families (`["notes"]`, `["due-notes"]`, `["projects"]`, `["tags"]`).
- `src/components/note-markdown.tsx` is an Expo DOM component (`"use dom"`): note bodies render in a webview with the same `markdown-exit` + Shiki setup and `.markdown-content` styles as the web app's `NoteContent`. It reports its height back through `onHeight`, because `matchContents` collapses inside a ScrollView.
- `src/theme.ts`: the web app's tokens (DESIGN.md) as hex values for light and dark.

## Sharing code with the web app

`@web/*` maps to `../frontend/src/*`. Import only pure modules from it. `metro.config.js` resolves bare imports in those files (like `zod`) from `mobile/node_modules`, and `tsconfig.json` maps `zod` to the app's copy so types line up. A shared file that picks up a `@/` import or a web-only package breaks the mobile bundle.

## Design

Follow [DESIGN.md](../DESIGN.md), sized for touch: 44pt minimum targets, 15–17pt body text, serif (Literata) for note titles, page titles and note bodies, sans (Inter) for chrome, green only for action, selection and focus, flat cards with hairline borders, pill badges for difficulty, rating and tags.

## Known platform quirks

- iOS 26: setting `headerStyle.backgroundColor` hides large titles. The header picks up the paper color from the navigation theme instead.
- `<Link asChild>` drops a `Pressable`'s function `style`, so rows navigate with `router.push`.

## Verify

`pnpm typecheck`, `pnpm lint`, and `pnpm doctor` after dependency or `app.json` changes. Run the app against a throwaway backend (`DB_PATH=/tmp/x.db ADMIN_PASSWORD=… backend/.venv/bin/uvicorn --app-dir backend main:app --host 0.0.0.0 --port 8300`) and check the screen you changed in a simulator.
