# Draw Master — Mobile (Capacitor)

Wraps the existing `frontend/` React SPA in a native Android/iOS shell via [Capacitor](https://capacitorjs.com/). No UI rewrite — this project just packages `frontend/dist` as a native app and syncs it into the platform projects below.

## Rebuilding after a frontend change

```bash
cd frontend && npm run build
cd ../mobile && npx cap sync
```

`cap sync` copies the fresh `frontend/dist` output into `android/app/src/main/assets/public` (and `ios/` once that platform is added) and updates native plugins. Run it after every frontend change you want reflected in the app — it is not automatic.

## Pointing the app at a real backend

The web SPA uses relative `/api/...` paths because Nginx serves it same-origin. A packaged mobile app has no origin, so it needs an absolute gateway URL — set via `frontend/.env` (see `frontend/.env.example`):

```
VITE_API_BASE_URL=http://<LAN-IP-of-docker-host>:80
```

`docker-compose.yml` only exposes `api-gateway` on the host (port 80) — it isn't reachable from a phone/emulator via `localhost`, so use the host machine's LAN IP when testing on a physical device, or `10.0.2.2` for the Android emulator talking to the host's `localhost`. Rebuild the frontend (`npm run build`) after changing `.env`, then `npx cap sync`.

## Android

```bash
npx cap open android   # opens the android/ project in Android Studio
```

Requires Android Studio + an SDK/emulator locally — buildable entirely on Windows. Build a signed `.aab` via Android Studio's Build > Generate Signed Bundle when ready to publish to Google Play (internal testing track first).

## iOS

Not yet added (`npx cap add ios`). Building requires either a Mac or a cloud build service (Codemagic, or a GitHub Actions `macos-latest` runner), since Xcode doesn't run on Windows — see the mobile app plan for details.
