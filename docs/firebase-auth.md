# Firebase sign-in

Notes Again signs in with a username and password by default. Use Firebase instead if you'd rather manage accounts in the Firebase console, or already have a Firebase project you want to reuse.

With Firebase, the browser signs in with Firebase email/password and gets an ID token. The server checks that token on every `/api` request using the Firebase Admin SDK. Only users you add in the Firebase console can sign in.

## 1. Create the Firebase project

1. Go to the [Firebase console](https://console.firebase.google.com) and create a project.
2. **Build → Authentication → Get started → Sign-in method**: enable **Email/Password**.
3. **Authentication → Users → Add user**: add your email and a password.
4. **Authentication → Settings → User actions**: turn **off** "Enable create (sign-up)". The web API key ships to every browser, so with sign-up on, anyone could create an account the server accepts.
5. **Authentication → Settings → Authorized domains**: add the hostname you serve Notes Again from, for example `notes.example.com`.

## 2. Get the two sets of credentials

1. **Project settings → General → Your apps**: add a **Web app** and copy its config values. They are public client config, not secrets.
2. **Project settings → Service accounts → Generate new private key**: save the JSON as `firebase-service-account.json` in the repo root. It is git-ignored. This one **is** a secret.

## 3. Configure the server

Add to `.env` in the repo root:

```sh
AUTH_MODE=firebase

VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=<project-id>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<project-id>

FIREBASE_CREDENTIALS_FILE=/run/secrets/firebase.json

# Mounts firebase-service-account.json into the container.
COMPOSE_FILE=docker-compose.yml:docker-compose.firebase.yml

# Optional second lock: only these emails may sign in, even if sign-up is
# ever turned back on by mistake. Tokens minted by removed addresses stop working.
ALLOWED_EMAILS=you@example.com
```

The server reads the web config at runtime and hands it to the browser, so you don't need to rebuild when these change. Restart after editing:

```sh
docker compose up -d --build
```

Running without Docker: `make run` always uses username and password sign-in, so start the backend yourself after `make build-frontend`, with the same variables set and `FIREBASE_CREDENTIALS_FILE` pointing at the JSON file on disk:

```sh
backend/.venv/bin/uvicorn --app-dir backend main:app --host 127.0.0.1 --port 8000
```

## Notes

- Data is single-user. Any account in your Firebase project that passes `ALLOWED_EMAILS` sees all notes.
- `AUTH_MODE=firebase` is required. Without it the Firebase settings are ignored and the server uses username and password sign-in.
- Going back to username and password: remove `AUTH_MODE=firebase`, then restart. The first launch prints a temporary `admin` password to the server logs.
