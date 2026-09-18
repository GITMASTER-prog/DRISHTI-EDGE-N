/**
 * DRISHTI GCS — Application Controller & Interactive Event Handler
 * Connects UI inputs, mission control, graph rendering, and maintenance workflows.
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize core simulation & instruments
    initializeSimulation();

    // 2. Setup Navigation Routing
    setupNavigationRouting();

    // 3. Setup Sidebar & Mission Controls (Altitude, Throttle, Timing, Duration)
    setupMissionControls();

    // 4. Setup Fault Injection Controls
    setupFaultControls();

    // 5. Setup Annunciator & Cockpit Controls
    setupCockpitControls();

    // 6. Setup Tab Views & Auto-render All Graphs
    setupFleetView();
    setupPrognosticsView();
    setupReplayView();
    setupDebriefReport();
    setupMaintenanceView();
    setupSettingsView();

    // 7. Everything wired — signal readiness to the load-diagnostics watchdog
    document.body.dataset.drishtiReady = 'true';

    // Initial render of all view graphs so none are ever blank
    setTimeout(() => {
        renderFleetHealthChart('chart-fleet-health', FLEET_DATABASE);
        refreshPrognosticsView();
        refreshReplayCharts();
    }, 150);

    // Keep the whole sidebar constant & fully visible on screen:
    // measure its natural height, then scale it to exactly fill the
    // viewport so the Navigation / Mission Control / Fault Injection
    // sections never scroll or move during a demo.
    // Re-fit several times during startup (fonts/images change the
    // natural height) and on every window resize.
    fitSidebarToViewport();
    window.addEventListener('resize', fitSidebarToViewport);
    window.addEventListener('load', fitSidebarToViewport);
    [200, 500, 1000, 2000].forEach(t => setTimeout(fitSidebarToViewport, t));
    // Watch for late content changes (guidance text wraps, fonts settle)
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => fitSidebarToViewport());
        const sb = document.querySelector('.gcs-sidebar');
        if (sb) ro.observe(sb);
    }
});

/**
 * Sidebar Auto-Fit
 * Scales the left sidebar (uniformly, like a photocopier) so ALL of its
 * content fits the screen height at once. The sidebar itself never scrolls:
 * everything stays fixed and visible — ideal for presenting the GCS.
 * Prefers the standardized `zoom` property (affects layout, keeps the
 * 290px visual width); falls back to transform+margin where unsupported.
 */
const SIDEBAR_BASE_WIDTH = 290;
function fitSidebarToViewport() {
    const sidebar = document.querySelector('.gcs-sidebar');
    if (!sidebar) return;

    // Measure the natural (unscaled) content height first.
    // Guard against re-entrancy: the ResizeObserver fires when WE change
    // the zoom, so ignore runs triggered within 100ms of the last fit.
    const now = Date.now();
    if (fitSidebarToViewport._busy && now - fitSidebarToViewport._busy < 100) return;
    fitSidebarToViewport._busy = now;

    sidebar.style.zoom = '';
    sidebar.style.transform = '';
    sidebar.style.marginRight = '';
    sidebar.style.width = '';
    sidebar.style.minWidth = '';
    sidebar.style.height = '';
    const naturalH = sidebar.scrollHeight;
    if (!naturalH) return;

    const scale = Math.min(1, (window.innerHeight - 6) / naturalH);   // 6px safety margin
    if (scale >= 0.999) return;   // already fits — leave untouched

    // CRITICAL: zoom/scale would also shrink the sidebar's own 100vh box,
    // visually ending the column at scale*100vh and clipping the bottom.
    // Compensate the box height so the SCALED sidebar still fills the
    // viewport exactly edge-to-edge.
    sidebar.style.height = `${Math.round(window.innerHeight / scale)}px`;

    if ('zoom' in sidebar.style) {
        sidebar.style.zoom = String(scale);
    } else {
        const w = SIDEBAR_BASE_WIDTH / scale;
        sidebar.style.width = `${w}px`;
        sidebar.style.minWidth = `${w}px`;
        sidebar.style.transform = `scale(${scale})`;
        sidebar.style.transformOrigin = 'top left';
        sidebar.style.marginRight = `${-(w - SIDEBAR_BASE_WIDTH)}px`;
    }
}

/**
 * Tab Navigation Router
 */
function setupNavigationRouting() {
    const navLinks = document.querySelectorAll('.nav-tab-link, .sidebar-nav-btn');
    const views = document.querySelectorAll('.gcs-view-panel');

    function switchTab(targetTab) {
        navLinks.forEach(link => {
            if (link.dataset.tab === targetTab) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        views.forEach(v => {
            if (v.id === `view-${targetTab}`) {
                v.classList.add('active');
            } else {
                v.classList.remove('active');
            }
        });

        // Trigger redraws when views become visible
        if (targetTab === 'fleet') {
            renderFleetHealthChart('chart-fleet-health', FLEET_DATABASE);
        } else if (targetTab === 'prediction') {
            refreshPrognosticsView();
        } else if (targetTab === 'replay') {
            refreshReplayCharts();
        } else if (targetTab === 'debrief') {
            const container = document.getElementById('report-markdown-content');
            if (container && typeof window.createDebriefReport === 'function') {
                container.textContent = window.createDebriefReport();
            }
        } else if (targetTab === 'cockpit') {
            if (riskGauge) riskGauge.resize();
            if (syntheticVision) syntheticVision.resize();
            if (liveTelemetryChart) liveTelemetryChart.resize();
            Object.values(GAUGES).forEach(g => g.resize());
            Object.values(TAPES).forEach(t => t.resize());
        }
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = link.dataset.tab;
            if (tab) switchTab(tab);
        });
    });
}

/**
 * Sidebar Mission & Optimization Controls
 * Includes Altitude, Throttle, Injection Timing, and Mission Duration.
 */
function setupMissionControls() {
    const uavSelect = document.getElementById('select-uav');
    const modeRadios = document.querySelectorAll('input[name="mission-mode"]');
    const presetSelect = document.getElementById('select-mission-preset');
    const presetRow = document.getElementById('preset-selection-row');
    const manualSliders = document.getElementById('manual-sliders-group');

    const altSlider = document.getElementById('slider-altitude');
    const altVal = document.getElementById('val-altitude');
    const thSlider = document.getElementById('slider-throttle');
    const thVal = document.getElementById('val-throttle');
    const injSlider = document.getElementById('slider-injection-timing');
    const injVal = document.getElementById('val-injection');
    const durSlider = document.getElementById('slider-duration');
    const durVal = document.getElementById('val-duration');

    const guidanceCard = document.getElementById('drishti-guidance-text');
    const isaCard = document.getElementById('drishti-isa-text');

    if (uavSelect) {
        uavSelect.addEventListener('change', (e) => {
            SIM_STATE.selectedUAV = e.target.value;
        });
    }

    modeRadios.forEach(r => {
        r.addEventListener('change', (e) => {
            SIM_STATE.missionMode = e.target.value;
            if (e.target.value === "Preset") {
                if (presetRow) presetRow.style.display = 'block';
                if (manualSliders) manualSliders.style.opacity = '0.5';
                applyPreset(presetSelect ? presetSelect.value : "ISR Long-Endurance Cruise");
            } else {
                if (presetRow) presetRow.style.display = 'none';
                if (manualSliders) manualSliders.style.opacity = '1.0';
            }
        });
    });

    function applyPreset(name) {
        const cfg = MISSION_PRESETS[name];
        if (!cfg) return;
        SIM_STATE.presetName = name;
        SIM_STATE.altitude_ft = cfg.altitude_ft;
        SIM_STATE.throttle_pct = cfg.throttle_pct;
        SIM_STATE.duration_h = cfg.duration_h;
        SIM_STATE.injection_timing_deg = cfg.injection_deg || 24.5;

        if (altSlider) altSlider.value = cfg.altitude_ft;
        if (altVal) altVal.textContent = `${cfg.altitude_ft.toFixed(0)} ft`;
        if (thSlider) thSlider.value = cfg.throttle_pct;
        if (thVal) thVal.textContent = `${cfg.throttle_pct.toFixed(0)}%`;
        if (injSlider) injSlider.value = SIM_STATE.injection_timing_deg;
        if (injVal) injVal.textContent = `${SIM_STATE.injection_timing_deg.toFixed(1)}° BTDC`;
        if (durSlider) durSlider.value = cfg.duration_h;
        if (durVal) durVal.textContent = `${cfg.duration_h.toFixed(2)} hr`;

        updateGuidance(cfg.altitude_ft);
    }

    if (presetSelect) {
        presetSelect.addEventListener('change', (e) => {
            applyPreset(e.target.value);
        });
    }

    function updateGuidance(alt) {
        const isa = isaTemperatureC(alt);
        if (isaCard) isaCard.textContent = `ISA at ${Math.round(alt).toLocaleString()} ft: ${isa.toFixed(1)} °C`;

        let recTh = 55;
        let recEnd = 7.9;
        if (alt !== 10000) {
            recTh = Math.round(Math.max(30, Math.min(100, 55 + (alt - 10000) / 1000 * 2)));
            recEnd = Math.max(2.0, 8.0 - (alt - 10000) / 5000 * 1.5);
        }
        if (guidanceCard) {
            guidanceCard.textContent = `At ${Math.round(alt).toLocaleString()} ft, recommended ${recTh}% throttle for optimum efficiency. Estimated endurance: ${recEnd.toFixed(1)} hr`;
        }
    }

    // Altitude Slider
    if (altSlider) {
        altSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            SIM_STATE.altitude_ft = val;
            if (altVal) altVal.textContent = `${val.toFixed(0)} ft`;
            updateGuidance(val);
        });
    }

    // Throttle Slider (Sidebar)
    if (thSlider) {
        thSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            SIM_STATE.throttle_pct = val;
            if (thVal) thVal.textContent = `${val.toFixed(0)}%`;
        });
    }

    // Injection / Ignition Timing Slider (Sidebar)
    if (injSlider) {
        injSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            SIM_STATE.injection_timing_deg = val;
            if (injVal) injVal.textContent = `${val.toFixed(1)}° BTDC`;
        });
    }

    // Duration Slider
    if (durSlider) {
        durSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            SIM_STATE.duration_h = val;
            if (durVal) durVal.textContent = `${val.toFixed(2)} hr`;
        });
    }
}

/**
 * Fault Injection Simulator Controls
 */
function setupFaultControls() {
    const faultKeys = ["misfire", "thermal", "mechanical", "sensor_drift", "lubrication", "combustion", "coding"];

    faultKeys.forEach(k => {
        const chk = document.getElementById(`chk-fault-${k}`);
        if (chk) {
            chk.addEventListener('change', (e) => {
                SIM_STATE.faults[k] = e.target.checked;
                // Manual checkbox changes always start from a clean slate:
                // a freshly ticked fault is unmitigated; an unticked one is cleared.
                SIM_STATE.rectifications[k] = false;
                updateCorrectiveActionBadges();
            });
        }
    });

    const multiChk = document.getElementById('chk-fault-multiple');
    if (multiChk) {
        multiChk.addEventListener('change', (e) => {
            const active = e.target.checked;
            faultKeys.forEach(k => {
                SIM_STATE.faults[k] = active;
                SIM_STATE.rectifications[k] = false;
                const chk = document.getElementById(`chk-fault-${k}`);
                if (chk) chk.checked = active;
            });
            updateCorrectiveActionBadges();
        });
    }

    const resetBtn = document.getElementById('btn-reset-faults');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            faultKeys.forEach(k => {
                SIM_STATE.faults[k] = false;
                SIM_STATE.rectifications[k] = false;
                const chk = document.getElementById(`chk-fault-${k}`);
                if (chk) chk.checked = false;
            });
            if (multiChk) multiChk.checked = false;
            updateCorrectiveActionBadges();
        });
    }
}

function updateCorrectiveActionBadges() {
    const container = document.getElementById('corrective-measures-container');
    if (!container) return;

    const activeInjections = Object.keys(SIM_STATE.faults).filter(k => SIM_STATE.faults[k]);
    if (activeInjections.length === 0) {
        container.innerHTML = `<div class="info-card-empty">No active fault simulations injected. All systems operating nominally.</div>`;
        return;
    }

    container.innerHTML = activeInjections.map(k => {
        const isFixed = SIM_STATE.rectifications[k];
        const measure = CORRECTIVE_MEASURES[k] || "Inspect Subsystem";
        return `
            <div class="corrective-action-card ${isFixed ? 'fixed' : 'alert'}">
                <div class="action-header">
                    <span class="fault-tag">${k.replace('_', ' ').toUpperCase()}</span>
                    <span class="action-status">${isFixed ? '✅ MITIGATED' : '⚠️ ACTION REQUIRED'}</span>
                </div>
                <div class="action-body">
                    <strong>Drishti Guidance:</strong> ${measure}
                </div>
                <div class="action-footer">
                    <button class="btn-rectify" onclick="toggleRectify('${k}')">
                        ${isFixed ? 'Re-engage Fault' : 'Apply Measure'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

window.toggleRectify = function(k) {
    SIM_STATE.rectifications[k] = !SIM_STATE.rectifications[k];

    // Applying a corrective measure resolves the injected anomaly: the
    // sidebar checkbox must untick so the fault is no longer active.
    // ('Re-engage Fault' re-ticks it to re-inject the fault.)
    const chk = document.getElementById(`chk-fault-${k}`);
    if (chk) chk.checked = !SIM_STATE.rectifications[k];

    // 'Multiple Faults (All Above)' master switch unticks when every
    // individual fault has been cleared by Apply Measure.
    const anyActive = Object.keys(SIM_STATE.faults).some(key => SIM_STATE.faults[key] && !SIM_STATE.rectifications[key]);
    const multiChk = document.getElementById('chk-fault-multiple');
    if (multiChk) multiChk.checked = anyActive;

    updateCorrectiveActionBadges();
};

/**
 * Annunciator Test & Acknowledge Controls
 */
function setupCockpitControls() {
    const annunTestBtn = document.getElementById('annun-test');
    if (annunTestBtn) {
        annunTestBtn.addEventListener('mousedown', () => {
            SIM_STATE.annunTestActive = true;
        });
        window.addEventListener('mouseup', () => {
            SIM_STATE.annunTestActive = false;
        });
    }

    const warnAnnun = document.getElementById('annun-master-warning');
    if (warnAnnun) {
        warnAnnun.addEventListener('click', () => {
            warnAnnun.classList.remove('active');
        });
    }
}

/**
 * Fleet Overview Tab
 */
function setupFleetView() {
    const tableBody = document.getElementById('fleet-table-body');
    if (!tableBody) return;

    const rows = Object.keys(FLEET_DATABASE).map(tail => {
        // Single source of truth shared with the cockpit summary cards so
        // Health %, RUL and Risk Tier are always identical in both views.
        const m = computeFleetMetrics(tail);
        const health = m.health;
        const rul = m.rul.toFixed(1);
        const risk = m.risk;

        const statusClass = risk.toLowerCase();

        return `
            <tr>
                <td class="tail-col"><strong>${tail}</strong></td>
                <td>Rotax 914 UL/F</td>
                <td><span class="badge-health ${health >= 85 ? 'good' : (health >= 65 ? 'mid' : 'bad')}">${health}%</span></td>
                <td>${rul} h</td>
                <td><span class="fleet-risk-tag ${statusClass}">${risk}</span></td>
                <td>${m.state}</td>
                <td>${m.baseHours.toFixed(1)} h / 2000 h</td>
            </tr>
        `;
    }).join('');

    tableBody.innerHTML = rows;
}

/**
 * Mission Replay View with Canvas Chart
 * (Rebuilt: playback engine, timeline, events and charts live in js/replay.js)
 */

/**
 * Post-Flight Debrief Report
 */
function setupDebriefReport() {
    const downloadBtn = document.getElementById('btn-download-report');
    const reportContainer = document.getElementById('report-markdown-content');

    function createReportContent() {
        const f = SIM_STATE.currentFrame || {};
        const p = SIM_STATE.prognostics || {};
        const d = new Date().toISOString();

        return `
# DRISHTI GCS — Rotax 914 Flight Debrief Report
**Timestamp:** ${d}
**Selected Aircraft:** ${SIM_STATE.selectedUAV}
**Engine Serial / Model:** Rotax 914 UL/F Turbocharged (S/N 914-8842)
**Mission Profile:** ${SIM_STATE.missionMode === 'Preset' ? SIM_STATE.presetName : 'Manual Profile'}

---

## 1. Flight Telemetry Executive Summary
- **Cruising Altitude:** ${Math.round(SIM_STATE.altitude_ft).toLocaleString()} ft
- **Average Throttle Command:** ${Math.round(SIM_STATE.throttle_pct)}%
- **ECU Injection Timing:** ${SIM_STATE.injection_timing_deg.toFixed(1)}° BTDC
- **Mission Flight Time:** ${(SIM_STATE.elapsed_sec / 3600).toFixed(2)} hours (of ${SIM_STATE.duration_h.toFixed(2)}h planned)
- **Final Engine Health Index:** ${SIM_STATE.subsystems.overall || 93}%
- **Predicted RUL Remaining:** ${p.rul_h || 145} hours
- **Total Wear / Degradation Rate:** ${(p.degradationRate || 0.035).toFixed(3)} %/hour

---

## 2. Propulsion Peak Parameters
- **Peak Cylinder Head Temperature (CHT):** ${(f.cht || 85.2).toFixed(1)} °C (OEM Limit: 135.0 °C)
- **Peak Exhaust Gas Temperature (EGT):** ${(f.egt || 672).toFixed(0)} °C (OEM Limit: 950.0 °C)
- **Oil Pressure Range:** ${(f.oil_press || 3.2).toFixed(2)} bar (Normal Band: 2.0 - 5.0 bar)
- **Maximum Vibration Amplitude:** ${(f.vibration || 1.09).toFixed(2)} mm/s (Warning Limit: 1.89 mm/s)
- **Peak Mechanical Power Output:** ${(f.power_kw || 38.1).toFixed(1)} kW (OEM Max: 84.8 kW)

---

## 3. Digital Twin Diagnostics & XAI Root Cause
- **Active Fault Status:** ${SIM_STATE.currentFaults.length === 0 ? 'NO ACTIVE EXCEEDANCES' : `${SIM_STATE.currentFaults.length} FAULT(S) RECORDED`}
- **Advisory Status:** ${p.advisory || 'CONTINUE MISSION'}
- **Primary Stress Factor:** Thermal load on Turbocharger Intercooler & Cowl Duct.

## 4. Real-Time ML Fault Diagnosis (DRISHTI Analytics Models)
- **Model Pipeline:** Random Forest ×40 + Isolation Forest ×100 (trained on 300,000-frame DRISHTI_Engine_Telemetry.csv, held-out accuracy 99.99%)
- **ML Fault Prediction:** ${SIM_STATE.mlDiagnosis ? SIM_STATE.mlDiagnosis.rf.name : 'n/a'}
- **Classifier Confidence:** ${SIM_STATE.mlDiagnosis ? (SIM_STATE.mlDiagnosis.rf.conf * 100).toFixed(1) + '%' : 'n/a'}
- **Isolation-Forest Anomaly Score:** ${SIM_STATE.mlDiagnosis ? SIM_STATE.mlDiagnosis.anomaly.pct.toFixed(1) + '%' + (SIM_STATE.mlDiagnosis.anomaly.flagged ? ' (OUT OF ENVELOPE)' : '') : 'n/a'}
- **Cross-Check Verdict:** ${SIM_STATE.mlDiagnosis ? `${SIM_STATE.mlDiagnosis.verdict.status} — ${SIM_STATE.mlDiagnosis.verdict.text}` : 'n/a'}

*Certified by DRISHTI Autonomous Digital Twin GCS — SIH 2026 Edition.*
        `.trim();
    }

    // Expose the report builder so the view auto-generates on entry
    window.createDebriefReport = createReportContent;
    if (reportContainer) reportContainer.textContent = createReportContent();

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const blob = new Blob([createReportContent()], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `DRISHTI_Debrief_${SIM_STATE.selectedUAV.split(' ')[0]}.md`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }
}

/**
 * Maintenance Planner
 */
function setupMaintenanceView() {
    const orderBtn = document.getElementById('btn-order-spares');
    const orderMsg = document.getElementById('spares-order-status');

    if (orderBtn) {
        orderBtn.addEventListener('click', () => {
            if (orderMsg) {
                orderMsg.style.display = 'block';
                orderMsg.innerHTML = "✅ Requisition #ORD-914-7741 dispatched to Depot Logistics. Parts assigned to UAV-01.";
            }
        });
    }
}

/**
 * Settings View
 */
function setupSettingsView() {
    const roleSelect = document.getElementById('select-user-role');
    const muteBtn = document.getElementById('btn-mute-audio');

    if (roleSelect) {
        roleSelect.addEventListener('change', (e) => {
            SIM_STATE.userRole = e.target.value;
            const rbacBadge = document.getElementById('rbac-role-badge');
            if (rbacBadge) rbacBadge.textContent = e.target.value;
        });
    }

    if (muteBtn) {
        muteBtn.addEventListener('click', () => {
            SIM_STATE.audioMuted = !SIM_STATE.audioMuted;
            muteBtn.textContent = SIM_STATE.audioMuted ? "🔇 Audio Muted" : "🔊 Audio Alarms Enabled";
        });
    }
}
