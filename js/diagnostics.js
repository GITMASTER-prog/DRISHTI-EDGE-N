/**
 * DRISHTI GCS — Asset Load Diagnostics
 * Detects any script/stylesheet/image that failed to load (e.g. a GitHub Pages
 * upload where the js/ or assets/ folders were missed) and shows a full-screen
 * banner explaining exactly what is missing, instead of failing silently.
 */
(function () {
    'use strict';

    var failures = [];
    var TOTAL_EXPECTED = window.__DRISHTI_EXPECT_SCRIPTS__ || 10;

    function isLocalFilePage() {
        return window.location.protocol === 'file:';
    }

    function showBanner() {
        var existing = document.getElementById('drishti-load-diagnostics');
        if (existing) existing.remove();

        var banner = document.createElement('div');
        banner.id = 'drishti-load-diagnostics';
        banner.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:99999',
            'background:rgba(2,6,23,0.96)', 'color:#e2e8f0',
            'font-family:monospace', 'padding:32px', 'overflow:auto'
        ].join(';');

        var listHtml = failures.map(function (f) {
            return '<li style="margin:6px 0;color:#f87171">' + f + '</li>';
        }).join('');

        banner.innerHTML =
            '<div style="max-width:820px;margin:40px auto">' +
            '<h1 style="color:#fbbf24;font-size:20px;margin:0 0 12px">&#9888; DRISHTI GCS &mdash; missing application files</h1>' +
            '<p style="font-size:13px;line-height:1.6;margin:0 0 14px">' +
            'The page loaded, but ' + failures.length + ' required file(s) returned 404. ' +
            'This usually means <code style="color:#38bdf8">js/</code> and/or <code style="color:#38bdf8">assets/</code> ' +
            'were not uploaded to the deployment. Upload the <b>entire contents</b> of the ' +
            '<code style="color:#38bdf8">drishti-gcs/</code> folder (keeping the folder structure), ' +
            'or deploy the single-file build at <code style="color:#38bdf8">deploy/index.html</code> which needs nothing else.' +
            '</p>' +
            '<ul style="font-size:12px;padding-left:20px;margin:0 0 16px">' + listHtml + '</ul>' +
            '<p style="font-size:11px;color:#94a3b8;margin:0">Open the browser DevTools &rarr; Network tab (filter: 404) to confirm.</p>' +
            '</div>';

        document.body.appendChild(banner);
    }

    // 1. Detect failed scripts/images: any <script>/<img> that finished without success.
    window.addEventListener('error', function (e) {
        var t = e.target;
        if (t && t.tagName === 'SCRIPT' && t.src) {
            failures.push('script: ' + t.getAttribute('src'));
        } else if (t && t.tagName === 'IMG' && t.src && !t.dataset.diagOptional) {
            failures.push('image: ' + t.getAttribute('src'));
        }
    }, true); // capture phase: resource errors do not bubble

    // 2. Detect a failed stylesheet (link elements do not fire the error event reliably).
    window.addEventListener('load', function () {
        setTimeout(function () {
            var links = document.querySelectorAll('link[rel="stylesheet"]');
            links.forEach(function (link) {
                // A loaded stylesheet exposes its ruleset; a 404 sheet has none.
                var css = link.sheet;
                var loaded = css && (css.cssRules === undefined || css.cssRules.length > 0);
                if (!loaded) failures.push('stylesheet: ' + link.getAttribute('href'));
            });

            if (failures.length > 0 && !isLocalFilePage()) {
                showBanner();
            }
        }, 1200);
    });

    // 3. Backup check: if the main app never signalled readiness, something is broken.
    window.addEventListener('load', function () {
        setTimeout(function () {
            var appReady = document.body && document.body.dataset.drishtiReady === 'true';
            if (!appReady && failures.length === 0 && !isLocalFilePage()) {
                failures.push('application scripts loaded but did not initialise (check DevTools console)');
                showBanner();
            }
        }, 4000);
    });
})();
