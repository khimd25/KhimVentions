# Building KhimVentions as a personal iOS app (Capacitor)

This wraps the existing web app (launcher + tracker + KhimVentures) into a
real iOS app for **your own iPhone** — no App Store. Your web code is reused
as-is; the web/PWA version keeps working too.

> You only need to do steps 1–2 once. After that, day-to-day rebuilds are
> just `npm run ios`.

## 1. One-time: install the tools (on your Mac)

- **Xcode** — from the Mac App Store, then open it once to finish setup.
- **Xcode command-line tools**: `xcode-select --install`
- **Node 18+**: https://nodejs.org (or `brew install node`)
- **CocoaPods**: `brew install cocoapods`

## 2. One-time: create the iOS project

```bash
git clone <your repo>          # or: git pull
git checkout claude/clever-gates-AWDls
npm install                    # installs Capacitor + plugins
npm run build:web              # copies the web app into www/
npx cap add ios                # generates the native ios/ project
```

## 3. Build & run on your phone

```bash
npm run ios                    # rebuilds www/, syncs, opens Xcode
```

In Xcode:
1. Select the **App** target → **Signing & Capabilities**.
2. Tick **Automatically manage signing**, set **Team** to your Apple ID.
   - *Free Apple ID:* works, but the app stops opening after **7 days** —
     just re-run from Xcode to re-sign (your data is preserved as long as you
     don't delete the app).
   - *Apple Developer ($99/yr):* signs for a year, no 7-day dance.
3. Plug in your iPhone, pick it as the run destination, press ▶.
4. First launch: trust the certificate on the phone at
   **Settings → General → VPN & Device Management**.

Done — KhimVentions is on your home screen as a native app. 🎉

## 4. What's next (after the shell runs)

These are the native unlocks we wire up once the basic app builds:

- **Reliable notifications** — `@capacitor/local-notifications` for meds /
  reminders that fire even when the app is closed (add usage strings to
  `Info.plist`).
- **Live Calendar + Reminders** — read your real schedule via EventKit (a
  calendar/reminders Capacitor plugin + permission strings in `Info.plist`).
  This replaces exporting Structured files.
- **Backup safety** — Export/Import JSON in the game, and optionally
  iCloud-backed storage so progress survives even a clean reinstall.

## Notes

- `www/` and `ios/` are git-ignored (generated locally). The repo root stays
  the source of truth and GitHub Pages keeps serving the web version.
- App identifier: `com.khimdeeee.khimventions` (change in
  `capacitor.config.json` if you like).
