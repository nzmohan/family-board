# Our Family Board

A shared family Kanban board for ideas, to-dos and plans — built for Mo & family.

- **Live app:** https://nzmohan.github.io/family-board/
- **Columns:** Ideas → To Do → Doing → Done (renameable in Settings)
- **Sharing:** one family passcode; each person tags who they are on their own phone
- **Voice:** use the iPhone keyboard mic to dictate into the add box
- **Export to Claude:** the 📤 button copies the whole board as Markdown to paste into Claude

## Tech
- Static PWA (HTML/CSS/vanilla JS), no build step.
- Sync + storage: Supabase project **"Family Board"** (`yrnlbmdkdtwccqneungl`), tables `cards` + `settings`, realtime on.
- Hosted on GitHub Pages.

## Add to iPhone home screen
Open the live URL in Safari → Share → **Add to Home Screen**. It then opens full-screen like an app.

## Local dev
Serve the folder over http (any static server) and open `index.html`.
