/**
 * DRISHTI GCS — Mission Flight Replay Module (PAST view)
 *
 * Answers: "What happened during the mission, when did it happen, how did
 * the engine respond, and what were the important events?"
 *
 * One deterministic simulated dataset (0 → 41.3 min) drives everything:
 * timeline, events, telemetry playback, charts, profile and summary.
 * SIMULATED TELEMETRY — not flight-test data.
 */

/* ---------------- Mission dataset ---------------- */

const REPLAY_DURATION_MIN = 41.3;

// Phase bands: [start_min, name, short]
const REPLAY_PHASES = [
    [0,    "Takeoff",          "TAKEOFF"],
    [3.2,  "Climb",            "CLIMB"],
    [7.5,  "Climb / Transition","CLIMB"],
    [11.8, "Cruise",           "CRUISE"],
    [22.0, "High-Load Cruise", "HIGH LOAD"],
    [27.2, "Anomaly / Degraded Ops", "FAULT"],
    [31.2, "Recovery / RTB",   "RTB"],
    [38.5, "Landing",          "LAND"]
];

// Mission events. severity: ok | warn | fault
const REPLAY_EVENTS = [
    { id: "takeoff",  icon: "✓", name: "Takeoff",             t: 0.0,   severity: "ok",   trigger: "Brake release / full power", response: "Nominal", detail: "Engine spooled to takeoff power. All parameters nominal." },
    { id: "climb",    icon: "✓", name: "Climb",               t: 4.5,   severity: "ok",   trigger: "Vz established", response: "Nominal", detail: "Steady climb at 75% power. CHT/EGT rising with load as expected." },
    { id: "cruise",   icon: "✓", name: "Cruise established",  t: 11.8,  severity: "ok",   trigger: "Altitude capture 10,000 ft", response: "Nominal", detail: "Levelled off, throttle trimmed to 55%. Temperatures stabilised." },
    { id: "thermal",  icon: "⚠", name: "Thermal Excursion",   t: 22.8,  severity: "warn", trigger: "Elevated CHT under sustained high load", response: "Monitor thermal loading / assess mission continuation", detail: "CHT climbed through the DRISHTI warning band during the high-load segment.", param: "CHT", before: 98, after: 112, healthBefore: 93, healthAfter: 89, anomBefore: 0.21, anomAfter: 0.78 },
    { id: "injector", icon: "⚠", name: "Injector Anomaly",    t: 27.4,  severity: "fault", trigger: "Fuel-flow / RPM signature deviation (Isolation Forest flag)", response: "Enrich mixture / plan precautionary RTB", detail: "Injector clog signature: RPM sag, fuel-flow instability, anomaly score spike.", param: "Fuel Flow", before: 23.5, after: 19.3, healthBefore: 89, healthAfter: 87, anomBefore: 0.42, anomAfter: 0.91 },
    { id: "recovery", icon: "✓", name: "Recovery initiated",  t: 31.2,  severity: "ok",   trigger: "Throttle reduction + mixture enrichment", response: "Parameters trending back to limits", detail: "Crew action: reduced load. CHT/EGT decaying, anomaly score falling." },
    { id: "landing",  icon: "✓", name: "Landing",             t: 41.3,  severity: "ok",   trigger: "Touchdown / shutdown", response: "Mission completed", detail: "Arrival and shutdown. Engine parameters stable through landing roll." }
];

/**
 * Deterministic telemetry sampler. Phase-driven equilibrium values blended
 * with smooth transitions — same time always yields the same frame.
 */
function replaySample(min) {
    const ph = (arr, a, b) => Math.min(1, Math.max(0, (min - a) / (b - a)));
    const smooth = x => x * x * (3 - 2 * x); // smoothstep

    // RPM equilibrium by phase
    let rpmEq, chtEq, egtEq, mapEq, ffEq, oilTEq, oilPEq, altEq, healthEq, anomEq, batEq;
    if (min < 3.2) {            // takeoff
        const k = smooth(ph(REPLAY_PHASES, 0, 3.2) || min / 3.2);
        rpmEq = 3200 + 1800 * k; chtEq = 72 + 20 * k; egtEq = 480 + 180 * k; mapEq = 22 + 12 * k;
        ffEq = 14 + 12 * k; oilTEq = 62 + 16 * k; oilPEq = 5.2 + 1.4 * k; altEq = 200 + 300 * k;
        healthEq = 97 - 1 * k; anomEq = 0.05 + 0.03 * k; batEq = 28.2 - 0.2 * k;
    } else if (min < 11.8) {    // climb / transition
        const k = smooth(ph(null, 3.2, 11.8) || (min - 3.2) / 8.6);
        rpmEq = 5000 + 250 * k; chtEq = 92 + 5 * k; egtEq = 660 + 25 * k; mapEq = 34 - 2 * k;
        ffEq = 26 - 4 * k; oilTEq = 78 + 8 * k; oilPEq = 6.6 - 0.4 * k; altEq = 500 + 9500 * k;
        healthEq = 96 - 2 * k; anomEq = 0.08 + 0.04 * k; batEq = 28.0 - 0.2 * k;
    } else if (min < 22.0) {    // cruise
        const k = smooth(ph(null, 11.8, 22.0) || (min - 11.8) / 10.2);
        rpmEq = 4900 - 500 * k; chtEq = 96 - 2 * k; egtEq = 655 - 20 * k; mapEq = 30 - 2 * k;
        ffEq = 21 - 2 * k; oilTEq = 86 + 2 * k; oilPEq = 5.6; altEq = 10000;
        healthEq = 94 - 1 * k; anomEq = 0.10 + 0.08 * k; batEq = 27.8;
    } else if (min < 27.2) {    // high-load segment (thermal excursion build)
        const k = smooth(ph(null, 22.0, 27.2) || (min - 22.0) / 5.2);
        rpmEq = 4550 + 350 * k; chtEq = 98 + 17 * k; egtEq = 680 + 60 * k; mapEq = 31 + 2 * k;
        ffEq = 21.5 + 2 * k; oilTEq = 88 + 8 * k; oilPEq = 5.5 - 0.2 * k; altEq = 10000;
        healthEq = 93 - 4 * k; anomEq = 0.21 + 0.55 * k; batEq = 27.7 - 0.2 * k;
    } else if (min < 31.2) {    // injector anomaly / degraded ops
        const k = smooth(ph(null, 27.2, 31.2) || (min - 27.2) / 4.0);
        const sag = 1 - 0.12 * Math.min(1, k * 1.4);   // RPM sag
        rpmEq = (4900 - 500 * k) * sag; chtEq = 115 - 3 * k; egtEq = 720 - 25 * k; mapEq = 32 - 3 * k;
        ffEq = 23.5 - 6.3 * k; oilTEq = 96 - 2 * k; oilPEq = 5.3 - 0.6 * k; altEq = 10000 - 400 * k;
        healthEq = 89 - 5 * k; anomEq = 0.78 + 0.18 * k; batEq = 27.5 - 0.3 * k;
    } else if (min < 38.5) {    // recovery / RTB
        const k = smooth(ph(null, 31.2, 38.5) || (min - 31.2) / 7.3);
        rpmEq = 4100 - 300 * k; chtEq = 110 - 22 * k; egtEq = 660 - 90 * k; mapEq = 27 - 2 * k;
        ffEq = 17.5 - 2.5 * k; oilTEq = 94 - 10 * k; oilPEq = 5.0 + 0.3 * k; altEq = 9600 - 1600 * k;
        healthEq = 84 + 5 * k; anomEq = 0.96 - 0.75 * k; batEq = 27.2 + 0.4 * k;
    } else {                    // landing
        const k = smooth((min - 38.5) / (REPLAY_DURATION_MIN - 38.5));
        rpmEq = 3800 - 1600 * k; chtEq = 88 - 10 * k; egtEq = 570 - 120 * k; mapEq = 25 - 6 * k;
        ffEq = 15 - 6 * k; oilTEq = 84 - 6 * k; oilPEq = 5.3 - 1.6 * k; altEq = 8000 - 7900 * k;
        healthEq = 89 + 1 * k; anomEq = 0.21 - 0.16 * k; batEq = 27.6 + 0.4 * k;
    }

    // Subtle deterministic texture (fixed frequencies — not random)
    const wob = Math.sin(min * 2.1) * 0.5 + Math.sin(min * 0.7) * 0.5;

    return {
        t: min,
        rpm: Math.round(rpmEq + wob * 14),
        cht: +(chtEq + wob * 0.7).toFixed(1),
        egt: Math.round(egtEq + wob * 5),
        map: +(mapEq + wob * 0.15).toFixed(2),
        ff: +(ffEq + wob * 0.25).toFixed(2),
        oil_temp: +(oilTEq + wob * 0.6).toFixed(1),
        oil_press: +(oilPEq + wob * 0.04).toFixed(2),
        bat: +(batEq + wob * 0.03).toFixed(2),
        alt: Math.round(altEq + wob * 40),
        health: +healthEq.toFixed(1),
        anomaly: +Math.min(1, Math.max(0, anomEq + wob * 0.015)).toFixed(3)
    };
}

function replayPhaseAt(min) {
    let name = REPLAY_PHASES[0][1], short = REPLAY_PHASES[0][2];
    for (const [t0, n, s] of REPLAY_PHASES) { if (min >= t0) { name = n; short = s; } }
    return { name, short };
}

/* ---------------- Playback state ---------------- */

const REPLAY_PLAYBACK = {
    time: 0,            // minutes
    playing: false,
    speed: 1.0,         // simulated minutes per real second
    selectedEvent: null,
    rafId: null,
    lastTs: null,
    series: { rpm: true, cht: true, egt: false, map: false, ff: true, oil_temp: false, oil_press: false, health: true, anomaly: true }
};

const REPLAY_SERIES_META = {
    rpm:      { label: "RPM",       color: "#38bdf8", min: 1000, max: 6000, unit: "" },
    cht:      { label: "CHT °C",    color: "#f59e0b", min: 50,  max: 135,  unit: "°C" },
    egt:      { label: "EGT °C",    color: "#fbbf24", min: 400, max: 800,  unit: "°C" },
    map:      { label: "MAP inHg",  color: "#a78bfa", min: 15,  max: 40,   unit: "" },
    ff:       { label: "Fuel L/h",  color: "#4ade80", min: 5,   max: 30,   unit: "" },
    oil_temp: { label: "Oil °C",    color: "#fb923c", min: 50,  max: 110,  unit: "°C" },
    oil_press:{ label: "Oil bar",   color: "#22d3ee", min: 2,   max: 8,    unit: "" },
    health:   { label: "Health %",  color: "#34d399", min: 70,  max: 100,  unit: "%" },
    anomaly:  { label: "Anomaly",   color: "#ef4444", min: 0,   max: 1,    unit: "" }
};

/* ---------------- View wiring ---------------- */

function setupReplayView() {
    // Playback controls
    const btnPlay = document.getElementById("rp-btn-play");
    const btnReset = document.getElementById("rp-btn-reset");
    if (btnPlay) btnPlay.addEventListener("click", toggleReplayPlay);
    if (btnReset) btnReset.addEventListener("click", resetReplay);

    document.querySelectorAll(".rp-speed-btn").forEach(b => {
        b.addEventListener("click", () => {
            REPLAY_PLAYBACK.speed = parseFloat(b.dataset.speed);
            document.querySelectorAll(".rp-speed-btn").forEach(x => x.classList.toggle("active", x === b));
            updateReplayFrame(true);
        });
    });

    // Scrubber
    const scrub = document.getElementById("replay-scrubber");
    if (scrub) {
        scrub.min = 0; scrub.max = REPLAY_DURATION_MIN * 10; scrub.step = 0.1; scrub.value = 0;
        scrub.addEventListener("input", () => {
            pauseReplay();
            REPLAY_PLAYBACK.time = parseFloat(scrub.value) / 10.0;
            REPLAY_PLAYBACK.selectedEvent = null;
            updateReplayFrame(true);
        });
    }

    // Series toggles
    Object.keys(REPLAY_SERIES_META).forEach(key => {
        const cb = document.getElementById(`rp-series-${key}`);
        if (cb) cb.addEventListener("change", () => {
            REPLAY_PLAYBACK.series[key] = cb.checked;
            drawReplayChart();
        });
    });

    // Event list + timeline markers
    buildReplayEventList();
    document.querySelectorAll(".rp-event-marker").forEach(m => {
        m.addEventListener("click", () => jumpToEvent(m.dataset.event));
    });

    // Phase segment clicks jump to phase start
    document.querySelectorAll(".rp-phase-seg").forEach(seg => {
        seg.addEventListener("click", () => {
            REPLAY_PLAYBACK.time = parseFloat(seg.dataset.start) + 0.1;
            updateReplayFrame(true);
        });
    });

    resetReplay(true);
}

function buildReplayEventList() {
    const list = document.getElementById("rp-event-list");
    if (list) {
        list.innerHTML = REPLAY_EVENTS.map(ev => `
            <div class="rp-event-item ${ev.severity}" data-event="${ev.id}">
                <span class="rp-ev-icon ${ev.severity}">${ev.icon}</span>
                <span class="rp-ev-name">${ev.name}</span>
                <span class="rp-ev-time">${fmtEventClock(ev.t)}</span>
            </div>
        `).join("");
        list.querySelectorAll(".rp-event-item").forEach(item => {
            item.addEventListener("click", () => jumpToEvent(item.dataset.event));
        });
    }
    // Timeline markers (positioned absolutely over the phase bar)
    const lane = document.getElementById("rp-timeline-events");
    if (lane) {
        lane.innerHTML = REPLAY_EVENTS.map(ev => `
            <div class="rp-event-marker ${ev.severity}" data-event="${ev.id}"
                 style="left:${(ev.t / REPLAY_DURATION_MIN) * 100}%;" title="${ev.name} — ${fmtEventClock(ev.t)}">
                <span class="mk-dot"></span><span class="mk-label">${ev.icon}</span>
            </div>
        `).join("");
        lane.querySelectorAll(".rp-event-marker").forEach(m => {
            m.addEventListener("click", (e) => { e.stopPropagation(); jumpToEvent(m.dataset.event); });
        });
    }
}

function fmtEventClock(min) {
    const total = Math.round(min * 60);
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    return `${mm}:${ss}`;
}

function jumpToEvent(id) {
    const ev = REPLAY_EVENTS.find(e => e.id === id);
    if (!ev) return;
    pauseReplay();
    REPLAY_PLAYBACK.time = Math.min(ev.t + 0.01, REPLAY_DURATION_MIN);
    REPLAY_PLAYBACK.selectedEvent = id;
    updateReplayFrame(true);
    renderEventDetails();
}

function toggleReplayPlay() {
    if (REPLAY_PLAYBACK.playing) pauseReplay();
    else startReplay();
}

function startReplay() {
    if (REPLAY_PLAYBACK.time >= REPLAY_DURATION_MIN) REPLAY_PLAYBACK.time = 0;
    REPLAY_PLAYBACK.playing = true;
    REPLAY_PLAYBACK.lastTs = null;
    REPLAY_PLAYBACK.selectedEvent = null;
    const btn = document.getElementById("rp-btn-play");
    if (btn) { btn.textContent = "⏸ PAUSE"; btn.classList.add("playing"); }
    REPLAY_PLAYBACK.rafId = requestAnimationFrame(replayTick);
}

function pauseReplay() {
    REPLAY_PLAYBACK.playing = false;
    if (REPLAY_PLAYBACK.rafId) cancelAnimationFrame(REPLAY_PLAYBACK.rafId);
    REPLAY_PLAYBACK.rafId = null;
    const btn = document.getElementById("rp-btn-play");
    if (btn) { btn.textContent = "▶ PLAY"; btn.classList.remove("playing"); }
}

function resetReplay(silent) {
    pauseReplay();
    REPLAY_PLAYBACK.time = 0;
    REPLAY_PLAYBACK.selectedEvent = null;
    updateReplayFrame(true);
    renderEventDetails();
}

function replayTick(ts) {
    if (!REPLAY_PLAYBACK.playing) return;
    if (REPLAY_PLAYBACK.lastTs === null) REPLAY_PLAYBACK.lastTs = ts;
    const dtSec = (ts - REPLAY_PLAYBACK.lastTs) / 1000.0;
    REPLAY_PLAYBACK.lastTs = ts;
    REPLAY_PLAYBACK.time += dtSec * REPLAY_PLAYBACK.speed;
    if (REPLAY_PLAYBACK.time >= REPLAY_DURATION_MIN) {
        REPLAY_PLAYBACK.time = REPLAY_DURATION_MIN;
        pauseReplay();
    }
    updateReplayFrame(false);
    if (REPLAY_PLAYBACK.playing) REPLAY_PLAYBACK.rafId = requestAnimationFrame(replayTick);
}

/** Update every replay output from the current playback time. */
function updateReplayFrame(redrawChart) {
    const min = REPLAY_PLAYBACK.time;
    const s = replaySample(min);
    const phase = replayPhaseAt(min);

    // Header clock: "27.4 min / 41.3 min"
    const lbl = document.getElementById("replay-time-label");
    if (lbl) lbl.textContent = `${min.toFixed(1)} min / ${REPLAY_DURATION_MIN} min`;

    // Scrubber position
    const scrub = document.getElementById("replay-scrubber");
    if (scrub && document.activeElement !== scrub) scrub.value = (min * 10).toFixed(1);

    // Red cursor over the phase timeline
    const cursor = document.getElementById("rp-timeline-cursor");
    if (cursor) cursor.style.left = `${(min / REPLAY_DURATION_MIN) * 100}%`;

    // Profile caption: current phase + time
    const cap = document.getElementById("rp-profile-caption");
    if (cap) cap.textContent = `${phase.name.toUpperCase()} — ${min.toFixed(1)} min · ${Math.round(s.alt).toLocaleString()} ft`;

    // Telemetry panel
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("rp-tel-rpm", `${s.rpm}`);
    set("rp-tel-map", `${s.map.toFixed(1)}`);
    set("rp-tel-ff", `${s.ff.toFixed(1)}`);
    set("rp-tel-cht", `${s.cht.toFixed(1)} °C`);
    set("rp-tel-egt", `${s.egt} °C`);
    set("rp-tel-oil-t", `${s.oil_temp.toFixed(1)} °C`);
    set("rp-tel-oil-p", `${s.oil_press.toFixed(2)} bar`);
    set("rp-tel-bat", `${s.bat.toFixed(1)} V`);
    set("rp-tel-health", `${s.health.toFixed(0)}%`);
    set("rp-tel-anom", s.anomaly.toFixed(2));

    // Replay state card
    set("rp-state-time", `${min.toFixed(1)} min`);
    set("rp-state-phase", phase.name);
    set("rp-state-rpm", `${s.rpm}`);
    set("rp-state-cht", `${s.cht.toFixed(1)} °C`);
    set("rp-state-speed", `${REPLAY_PLAYBACK.speed.toFixed(1)}× Real-time`);
    const healthEl = document.getElementById("rp-state-health");
    if (healthEl) { healthEl.textContent = `${s.health.toFixed(0)}%`; healthEl.style.color = s.health < 85 ? "#f59e0b" : "#4ade80"; }
    const anomEl = document.getElementById("rp-state-anom");
    if (anomEl) { anomEl.textContent = s.anomaly.toFixed(2); anomEl.style.color = s.anomaly > 0.6 ? "#ef4444" : (s.anomaly > 0.35 ? "#f59e0b" : "#4ade80"); }

    // Phase highlight on timeline
    document.querySelectorAll(".rp-phase-seg").forEach(seg => {
        seg.classList.toggle("active", seg.dataset.short === phase.short);
    });

    // Event marker highlighting: last event at/before current time
    let currentEvId = null;
    for (const ev of REPLAY_EVENTS) { if (min >= ev.t - 1e-9) currentEvId = ev.id; }
    document.querySelectorAll(".rp-event-marker, .rp-event-item").forEach(el => {
        el.classList.toggle("passed", !!currentEvId && el.dataset.event === currentEvId);
    });

    if (redrawChart || REPLAY_PLAYBACK.playing) drawReplayChart();
}

/* ---------------- Charts ---------------- */

function drawReplayChart() {
    const canvas = document.getElementById("canvas-replay-chart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width || 640, h = rect.height || 260;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const padL = 42, padR = 14, padT = 26, padB = 26;
    const pw = w - padL - padR, ph = h - padT - padB;
    ctx.fillStyle = "#070a10"; ctx.fillRect(0, 0, w, h);

    // Grid + X axis (mission time 0..41.3 min)
    ctx.font = '500 8px "Share Tech Mono", monospace';
    for (let i = 0; i <= 4; i++) {
        const y = padT + (i / 4) * ph;
        ctx.strokeStyle = "#151d2a"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    }
    ctx.textAlign = "center"; ctx.fillStyle = "#64748b";
    for (let m = 0; m <= REPLAY_DURATION_MIN; m += 10) {
        const x = padL + (m / REPLAY_DURATION_MIN) * pw;
        ctx.fillText(`${m}m`, x, h - padB + 12);
    }

    const N = 240;
    const series = Object.keys(REPLAY_SERIES_META).filter(k => REPLAY_PLAYBACK.series[k]);
    // Normalise each series to its own band so multiple parameters stack readably
    const bandH = ph / Math.max(1, series.length);
    series.forEach((key, si) => {
        const meta = REPLAY_SERIES_META[key];
        const yTop = padT + si * bandH, yBot = yTop + bandH;
        const yFn = v => yBot - clamp((v - meta.min) / (meta.max - meta.min), 0, 1) * (bandH - 6) - 3;
        // band separator + axis label
        ctx.strokeStyle = "#0f1622";
        ctx.beginPath(); ctx.moveTo(padL, yTop); ctx.lineTo(w - padR, yTop); ctx.stroke();
        ctx.textAlign = "right"; ctx.fillStyle = meta.color;
        ctx.fillText(meta.label, padL - 6, yTop + bandH / 2 + 3);

        ctx.beginPath();
        for (let i = 0; i < N; i++) {
            const t = (i / (N - 1)) * REPLAY_DURATION_MIN;
            const v = replaySample(t)[key];
            const x = padL + (t / REPLAY_DURATION_MIN) * pw;
            i === 0 ? ctx.moveTo(x, yFn(v)) : ctx.lineTo(x, yFn(v));
        }
        ctx.strokeStyle = meta.color; ctx.lineWidth = 1.6; ctx.lineJoin = "round";
        ctx.stroke();
    });

    // Event markers on chart
    REPLAY_EVENTS.forEach(ev => {
        if (ev.severity === "ok") return;
        const x = padL + (ev.t / REPLAY_DURATION_MIN) * pw;
        ctx.strokeStyle = ev.severity === "fault" ? "#ef4444" : "#f59e0b";
        ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, h - padB); ctx.stroke();
        ctx.setLineDash([]);
    });

    // Red timeline cursor at the replay position
    const cx = padL + (REPLAY_PLAYBACK.time / REPLAY_DURATION_MIN) * pw;
    ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(cx, padT - 6); ctx.lineTo(cx, h - padB + 6); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(cx, padT - 6, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ef4444"; ctx.fill();
}

function drawReplayProfile() {
    const canvas = document.getElementById("canvas-replay-profile");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width || 420, h = rect.height || 120;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const padL = 44, padR = 12, padT = 12, padB = 20;
    const pw = w - padL - padR, ph = h - padT - padB;
    ctx.fillStyle = "#070a10"; ctx.fillRect(0, 0, w, h);

    // Y labels 0 / 5k / 10k ft
    ctx.font = '500 8px "Share Tech Mono", monospace';
    ctx.fillStyle = "#64748b"; ctx.textAlign = "right";
    [[0, "0"], [5000, "5k"], [10000, "10k"]].forEach(([v, l]) => {
        const y = padT + (1 - v / 10000) * ph;
        ctx.fillText(`${l} ft`, padL - 6, y + 3);
        ctx.strokeStyle = "#151d2a";
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    });

    // Altitude curve
    ctx.beginPath();
    const N = 160;
    for (let i = 0; i < N; i++) {
        const t = (i / (N - 1)) * REPLAY_DURATION_MIN;
        const x = padL + (t / REPLAY_DURATION_MIN) * pw;
        const y = padT + (1 - clamp(replaySample(t).alt / 10000, 0, 1)) * ph;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 1.8; ctx.stroke();

    // Moving marker at current replay position
    const s = replaySample(REPLAY_PLAYBACK.time);
    const mx = padL + (REPLAY_PLAYBACK.time / REPLAY_DURATION_MIN) * pw;
    const my = padT + (1 - clamp(s.alt / 10000, 0, 1)) * ph;
    ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#ef4444"; ctx.fill();
    ctx.strokeStyle = "#fecaca"; ctx.lineWidth = 1; ctx.stroke();

    // X labels
    ctx.fillStyle = "#64748b"; ctx.textAlign = "center";
    for (let m = 0; m <= REPLAY_DURATION_MIN; m += 10) {
        const x = padL + (m / REPLAY_DURATION_MIN) * pw;
        ctx.fillText(`${m}`, x, h - padB + 11);
    }
    ctx.fillText("min", w - padR - 2, h - 6);
}

/* ---------------- Event details / comparison / summary ---------------- */

function renderEventDetails() {
    const id = REPLAY_PLAYBACK.selectedEvent;
    const panel = document.getElementById("rp-event-details");
    if (!panel) return;
    const ev = REPLAY_EVENTS.find(e => e.id === id);
    if (!ev) {
        panel.innerHTML = `<div class="rp-no-event">No mission event selected — click an event on the timeline or in the list.</div>`;
        document.getElementById("rp-beforeafter").innerHTML = "";
        return;
    }

    let paramRow = "";
    if (ev.param) {
        const unit = ev.param === "CHT" ? " °C" : (ev.param === "Fuel Flow" ? " L/h" : "");
        paramRow = `
            <div class="prog-kv"><span>Parameter Change (${ev.param})</span><b style="color:#f59e0b;">${ev.before}${unit} → ${ev.after}${unit}</b></div>
            <div class="prog-kv"><span>Engine Health</span><b>${ev.healthBefore}% → ${ev.healthAfter}%</b></div>
            <div class="prog-kv"><span>Anomaly Score</span><b>${ev.anomBefore.toFixed(2)} → ${ev.anomAfter.toFixed(2)}</b></div>`;
    }

    panel.innerHTML = `
        <div class="rp-ev-head"><span class="rp-ev-icon ${ev.severity}" style="font-size:14px;">${ev.icon}</span>
        <span class="rp-ev-title">${ev.name}</span>
        <span class="rp-sev-badge ${ev.severity}">${ev.severity === "ok" ? "INFO" : (ev.severity === "warn" ? "WARNING" : "FAULT")}</span></div>
        <div class="prog-kv"><span>Timestamp</span><b>${fmtEventClock(ev.t)} (${ev.t.toFixed(1)} min)</b></div>
        <div class="prog-kv"><span>Trigger</span><b>${ev.trigger}</b></div>
        ${paramRow}
        <div class="prog-kv"><span>Recommended Response</span><b style="color:#38bdf8;">${ev.response}</b></div>
        <div style="font-size:10px; color:#94a3b8; margin-top:6px; line-height:1.5;">${ev.detail}</div>`;

    // Before/after comparison (anomaly events only)
    const ba = document.getElementById("rp-beforeafter");
    if (ev.param) {
        const sB = replaySample(Math.max(0, ev.t - 0.5));
        const sA = replaySample(Math.min(REPLAY_DURATION_MIN, ev.t + 1.5));
        ba.innerHTML = `
            <div class="rp-ba-grid">
                <div class="rp-ba-col"><div class="lbl">BEFORE EVENT</div>
                    <div class="prog-kv"><span>RPM</span><b>${sB.rpm}</b></div>
                    <div class="prog-kv"><span>CHT</span><b>${sB.cht.toFixed(0)} °C</b></div>
                    <div class="prog-kv"><span>Health</span><b>${sB.health.toFixed(0)}%</b></div></div>
                <div class="rp-ba-arrow">↓</div>
                <div class="rp-ba-col"><div class="lbl">AFTER EVENT</div>
                    <div class="prog-kv"><span>RPM</span><b>${sA.rpm}</b></div>
                    <div class="prog-kv"><span>CHT</span><b>${sA.cht.toFixed(0)} °C</b></div>
                    <div class="prog-kv"><span>Health</span><b>${sA.health.toFixed(0)}%</b></div></div>
            </div>`;
    } else {
        ba.innerHTML = "";
    }
}

function renderReplaySummary() {
    // Computed from the dataset, not hand-typed
    let maxRpm = 0, maxCht = 0, maxEgt = 0, minHealth = 100, anomalies = 0, faults = 0;
    const N = 600;
    for (let i = 0; i < N; i++) {
        const s = replaySample((i / (N - 1)) * REPLAY_DURATION_MIN);
        if (s.rpm > maxRpm) maxRpm = s.rpm;
        if (s.cht > maxCht) maxCht = s.cht;
        if (s.egt > maxEgt) maxEgt = s.egt;
        if (s.health < minHealth) minHealth = s.health;
        if (s.anomaly > 0.5) anomalies++;
    }
    faults = REPLAY_EVENTS.filter(e => e.severity === "fault").length;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("rp-sum-duration", `${REPLAY_DURATION_MIN} min`);
    set("rp-sum-rpm", `${maxRpm}`);
    set("rp-sum-cht", `${maxCht.toFixed(1)} °C`);
    set("rp-sum-egt", `${maxEgt} °C`);
    set("rp-sum-anom", `Score > 0.5 for ${anomalies} samples`);
    set("rp-sum-faults", `${faults}`);
    set("rp-sum-health", `${minHealth.toFixed(0)}%`);
}

/** Redraw charts when the view becomes visible (canvases need layout). */
function refreshReplayCharts() {
    drawReplayChart();
    drawReplayProfile();
    renderReplaySummary();
    renderEventDetails();
    updateReplayFrame(false);
}
