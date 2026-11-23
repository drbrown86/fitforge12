# FitForge 12 — installable offline fitness PWA

## Files
- `index.html`: app entry
- `style.css`: mobile-first dark UI
- `app.js`: workouts, food logging, measurements, settings, local backup
- `manifest.webmanifest`: install metadata
- `sw.js`: offline cache
- `icons/`: app icons

## Publish using ONLY your Samsung phone (GitHub Pages)
1. Download and unzip `FitForge12_PWA.zip` on your phone (Samsung My Files > Downloads > Extract).
2. In Chrome, sign into https://github.com and create a **public** repository named `fitforge12` (GitHub Pages on GitHub Free requires a public repo).
3. Open the repository. Choose **Add file > Upload files** (on a phone you may need Chrome's **Desktop site** option).
4. Upload `index.html`, `style.css`, `app.js`, `sw.js`, `manifest.webmanifest` into the repository root. Upload `icon-192.png` and `icon-512.png` into a folder named `icons` (GitHub's web upload supports dragging a folder in desktop mode, or you can create `icons/placeholder` first and then upload icons into that folder). Keep the folder paths exactly as in the ZIP.
5. Commit the uploads. In repository **Settings > Pages**, choose **Deploy from a branch**, `main`, `/ (root)`, then **Save**.
6. Wait for Pages deployment, then visit `https://YOUR-USERNAME.github.io/fitforge12/` in **Chrome** on your phone. Replace YOUR-USERNAME with your GitHub username. Pages deployment may take a few minutes.
7. In Chrome menu (⋮), tap **Install app** or **Add to Home screen**. Launch FitForge 12 from your home screen.
8. Open the app once while online to cache it. It can then run offline on the same phone.

**Important:** GitHub Pages is public hosting for the APP CODE only. Food, workout and body measurements remain in the browser's localStorage and are not uploaded by this app. Do not upload your exported backup JSON to GitHub. Back up your data from Settings > Export JSON backup. Clearing browser site data can erase local progress.

## Alternative hosting
Any HTTPS static hosting service that preserves the file paths works. Opening `index.html` directly from your phone's file manager is not sufficient for service-worker-based installation/offline support.

## Notes
- No accounts, advertisements, analytics, or third-party scripts.
- Targets are editable and are not medical advice.
- Week number is derived from program start date and capped at week 12.
- Exercises have text instructions, not videos or illustrations.
- Nutrition is manual entry; no food database or barcode scanner.
- Step counts are manual entry; no Health Connect integration.
- The rest timer runs while the app is active. Background tabs may throttle timers.
