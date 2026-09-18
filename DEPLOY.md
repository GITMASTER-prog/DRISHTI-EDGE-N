DRISHTI GCS — GitHub Pages deployment
=====================================

WHY YOUR LAST DEPLOY WAS BROKEN
-------------------------------
Only index.html and styles.css reached GitHub Pages. The js/ and assets/
folders were missed, so the page rendered its static placeholder values
(93%, 1541.5 h, frozen clock "21 May 2025") but had no JavaScript:
no gauges, no live telemetry, no working buttons.

THE FIX — two options
---------------------

Option A (recommended, foolproof): deploy the single-file build

    1. Rebuild after any code change:
           python tools/build_singlefile.py
       (run from the drishti-gcs/ folder; needs any Python 3.x)

    2. Upload ONLY this one file to your repo / Pages:
           deploy/index.html        (~2.3 MB, everything inlined)

    3. GitHub Pages serves it — done. No folders to forget.

    Tip: your local python launcher opens the Microsoft Store; use the
    full path instead:
        %LOCALAPPDATA%\Programs\Python\Python313\python.exe tools\build_singlefile.py

Option B: deploy the whole folder, structure intact

    Upload the ENTIRE contents of drishti-gcs/ to the repo root:

        index.html
        styles.css
        js/        (all 11 .js files, including the new diagnostics.js)
        assets/    (emblem, logo, ico, cockpit_sky.jpg)

    All references are relative and correctly cased, so if every file
    lands in the repo the site works on Pages.

SAFETY NET (added in this fix)
------------------------------
js/diagnostics.js now ships with the app. If any file 404s on the deployed
site, a full-screen banner appears naming the missing files and how to fix
them — instead of silently showing a dead dashboard. It stays quiet when
everything loads correctly.

WHAT TO CHECK AFTER DEPLOYING
-----------------------------
1. Clock top-right shows the real current date/time and ticks.
2. RPM gauge needle sweeps and the value changes continuously.
3. Eagle emblem appears top-left; sky background behind the gauges.
4. All 8 sidebar items switch views (bottom taskbar was removed earlier).
5. Browser DevTools → Network tab shows no 404s.
