# KhimVentions 🧠✨

An ADHD-friendly tracker built for one person: you. Meds, vitamins, workouts,
chores, cat bonding, meal prep, errands, side projects — the *everything*.

It's a **phone-first web app** you add to your home screen. No login, no backend,
no monthly bill, nothing to break. Your data lives on your device.

## Why it's built this way (the ADHD design rules)

- **One tap to log.** No forms. Tap a card → done → little dopamine burst. 🎉
- **A cat that levels up with you.** Every habit and to-do you finish earns XP and
  floats a little `+XP`. Your cat companion (on the **Me** tab — tap to name it)
  grows through stages as you level up. Level-ups throw confetti and reward you with
  a real cat photo. There's a 🐾 **Give me a cat** button any time you want a hit.
- **Weekly wins, no misses.** The **Me** tab shows what you *did* this week —
  habits done, to-dos cleared, perfect days, people reached. Misses are never
  counted against you.
- **No guilt.** A missed day fades quietly. Streaks forgive "today not done yet"
  so you don't lose a 12-day streak just because it's 2pm. Get back on, no shame.
- **Lives where your eyes are.** Home-screen icon + reminder notifications so you
  don't have to *remember to remember*.
- **Capture from anywhere.** Once installed, KhimVentions shows up in your phone's
  **share sheet** — share a link, article, address, or selected text from any app
  and it lands here as a to-do (pre-filled in the brain dump so you can tweak it
  first). No copy-paste, no app-switching.
- **Important things look important.** Health (meds/vitamins) is colour-coded
  apart from "tidy one thing."
- **"Just one thing" mode.** Overwhelmed days freeze you at the *list*, not the task.
  Tap **🎯 Just one thing** on the Today screen and the whole app collapses to a
  single full-screen item — no scrolling, no choosing. It picks health-critical
  habits (meds/vitamins) first, then the rest. Finish it and the next one slides in;
  "show me another" if it's not the right one right now.
- **Brain dump button.** The big `＋` top-right captures a racing thought instantly
  so it stops bouncing around your head. Sort it later. **Tap the mic and just talk** —
  voice is transcribed live, and each pause becomes its own to-do, so saying
  "call the dentist… pick up cat food… text Sam" lands as three separate items.
  (Voice uses the browser's built-in speech recognition; works on Chrome/Safari,
  falls back to typing where unsupported. Needs HTTPS + mic permission.)

## How to use it

- **Today tab** — your daily + weekly habits and what's on your plate. Tap to complete.
- **Lists tab** — to-dos, side projects, and **People**.
  - The **People** list is the reply launcher: add someone once (name + how to reach
    them), and tapping their button opens the text / WhatsApp / email / call **already
    addressed** — no app-switching, no digging. The whole point is to delete the
    activation energy that makes "message people back" so hard.
  - People marked *needs a reply* surface in a **Reply to** block on the Today screen.
    Tapping to reach out clears it automatically and remembers when you last did.
- **Me tab** — streaks, a 2-week heatmap, edit your habits, turn on reminders,
  and back up your data.

It comes pre-loaded with your list (meds, vitamins, workout, cat bonding, tidy,
meal prep, "message people back"). Edit or delete anything on the **Me** tab.

## Get it on your phone

You need to host the files somewhere with HTTPS (required for "add to home screen"
and notifications). Easiest free option is **GitHub Pages**:

1. Push this repo to GitHub (already on branch `claude/clever-gates-AWDls`).
2. Repo **Settings → Pages → Source: deploy from branch** → pick the branch, `/root`.
3. Open the published URL on your phone.
4. **iPhone (Safari):** Share → *Add to Home Screen*.
   **Android (Chrome):** menu → *Install app* / *Add to Home Screen*.
5. Open it from the home-screen icon, go to **Me → Turn on reminders**, allow notifications.

### Try it locally first

```bash
python3 -m http.server 8000
# then open http://localhost:8000 in your browser
```

## A note on reminders

Reminders fire reliably while the app is open, and on Android Chrome (installed)
they can fire in the background via scheduled notifications. iOS is stricter about
background notifications for web apps — for now the most reliable nudge there is
having the icon on your home screen and a reminder time set. If you want
bulletproof push later (fires even when fully closed), that's the one feature
that needs a tiny backend — easy to add as v2.

## Back up your data

Data is stored in your browser's `localStorage`. On the **Me** tab, **Export backup**
downloads a JSON file. **Import backup** restores it (e.g. on a new phone). Do this
now and then so a lost device never costs you your streaks.

## Files

```
index.html              launcher — pick the Tracker or the game
tracker.html            the tracker app shell + views
css/styles.css          tracker styling (dark, calm, big tap targets)
js/app.js               tracker logic
game.html               KhimVentures — a dice roguelite side game
css/game.css            game styling
js/game.js              game logic (saves under kvg.*, never touches tracker data)
manifest.webmanifest    PWA manifest (share-sheet capture routes to tracker.html)
sw.js                   service worker (offline + reminder clicks)
icons/                  app icons (+ gen-icons.js to regenerate)
```

Regenerate icons after editing `icons/icon.svg`'s look: `node icons/gen-icons.js`.
