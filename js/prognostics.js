/**
 * DRISHTI GCS — Prognostic Mission Projection Module (FUTURE view)
 *
 * Answers: "If the aircraft continues with this mission profile, what is the
 * predicted engine condition, how will degradation evolve, and what is the
 * estimated remaining useful life?"
 *
 * Deterministic conceptual simulation — NOT a certified Rotax life model.
 * Confidence values are a prototype indicator, not validated accuracy.
 * The model is intentionally modular: computeProjection() can later be
 * replaced by a real ML/RUL model without touching the UI wiring.
 */

/* ---------------- Scenario presets ---------------- */

const PROG_SCENARIOS = {
    normal:  { label: "Normal Cruise",   alt: 8000,  th: 65, dur: 4.0, dT: 0,  cycle: "steady"   },
    highalt: { label: "High Altitude",   alt: 16000, th: 80, dur: 4.0, dT: 0,  cycle: "steady"   },
    hot:     { label: "Hot Weather",     alt: 5000,  th: 75, dur: 4.0, dT: 18, cycle: "steady"   },
    long:    { label: "Long Endurance",  alt: 10000, th: 55, dur: 8.0, dT: 0,  cycle: "moderate" },
    rapid:   { label: "Rapid Throttle",  alt: 8000,  th: 70, dur: 4.0, dT: 0,  cycle: "rapid"    },
    custom:  { label: "Custom Mission",  alt: null,  th: null, dur: null, dT: null, cycle: null }
};

const PROG_CYCLE_LABELS = { steady: "Steady", moderate: "Moderate cycling", rapid: "Rapid cycling" };

let progActiveScenario = "normal";

/* ---------------- Deterministic projection model ---------------- */

/**
 * Deterministic mission projection. Same inputs always produce the same
 * trajectory — no randomness, so sliders feel like a model, not noise.
 */
function computeProjection(alt_ft, throttle, dur_h, ambientDT, cycleProfile, current) {
    const N = 140;
    const tau = 0.35;              // thermal time constant (h)

    // Equilibrium CHT: throttle load + altitude cooling penalty + ambient soak
    const chtEq =
        66.0 + 0.55 * (throttle - 20.0) +
        0.62 * Math.max(0, alt_ft - 8000) / 1000.0 -
        0.30 * Math.max(0, 8000 - alt_ft) / 1000.0 +
        0.42 * ambientDT;

    // Throttle-profile oscillation (deterministic, not random)
    const cycAmp = cycleProfile === "rapid" ? 6.0 : (cycleProfile === "moderate" ? 2.5 : 0.0);
    const cycFreq = cycleProfile === "rapid" ? 8.0 : 4.0;

    const cht = [], stress = [], health = [], t = [];
    let accDeg = 0.0;
    let degSum = 0.0, stressSum = 0.0;
    let peakCht = -1e9, peakStress = -1e9;

    for (let i = 0; i < N; i++) {
        const ti = (i / (N - 1)) * dur_h;
        t.push(ti);
        const equil = chtEq + cycAmp * Math.sin(2 * Math.PI * cycFreq * ti) * Math.min(1, ti / 0.5);
        const c = current.cht + (equil - current.cht) * (1 - Math.exp(-ti / tau));
        cht.push(c);

        const s = clamp(((c - 60.0) / 75.0) * 100.0, 0, 100);
        stress.push(s);

        // Health degradation per hour (thresholds + powers => intentionally non-linear)
        const rate =
            0.35 +
            0.06 * Math.pow(Math.max(0, c - 95.0), 1.05) +
            0.05 * Math.max(0, s - 45.0) +
            0.9 * Math.max(0, throttle - 80.0) / 20.0 +
            (cycleProfile === "rapid" ? 0.9 : (cycleProfile === "moderate" ? 0.35 : 0.0));
        accDeg += (rate / 100.0) * (dur_h / (N - 1));
        health.push(Math.max(5, current.health - accDeg * 100.0));

        degSum += rate; stressSum += s;
        if (c > peakCht) peakCht = c;
        if (s > peakStress) peakStress = s;
    }

    const avgStress = stressSum / N;

    // RUL consumption: nominal engine "ages" 1 TBO-hour per flight hour.
    const rulFactor = 1.0 +
        0.9 * Math.max(0, avgStress - 45.0) / 55.0 +
        0.5 * Math.max(0, throttle - 75.0) / 25.0 +
        (cycleProfile === "rapid" ? 0.35 : (cycleProfile === "moderate" ? 0.15 : 0.0));
    const projectedRul = Math.max(2.0, current.rul - dur_h * rulFactor);

    // Prototype confidence indicator (NOT validated statistical accuracy)
    let confidence = 92.0;
    if (cycleProfile !== "steady") confidence -= 2.0;
    confidence -= Math.min(3.0, Math.abs(ambientDT) / 8.0);
    confidence -= Math.min(2.0, Math.max(0, alt_ft - 12000) / 2000.0);
    confidence = clamp(confidence, 78, 93);

    // Time-to-exceedance from the simulated trajectory (linear interp)
    function timeToCross(limit) {
        for (let i = 1; i < N; i++) {
            if (cht[i - 1] < limit && cht[i] >= limit) {
                const f = (limit - cht[i - 1]) / (cht[i] - cht[i - 1]);
                return t[i - 1] + f * (t[i] - t[i - 1]);
            }
        }
        return null;
    }
    const tWarn = timeToCross(120.0);
    const tLimit = timeToCross(135.0);

    // Degradation contributors (normalised to 100)
    const raw = [
        { name: "High CHT",        val: 30 + 1.1 * Math.max(0, peakCht - 100) + 0.4 * Math.max(0, ambientDT) },
        { name: "Thermal Cycling", val: 8 + (cycleProfile === "rapid" ? 46 : (cycleProfile === "moderate" ? 18 : 2)) },
        { name: "High Throttle",   val: 6 + 1.5 * Math.max(0, throttle - 60) },
        { name: "Mission Duration",val: 8 + 4.5 * Math.max(0, dur_h - 4) }
    ];
    const sum = raw.reduce((a, c) => a + c.val, 0);
    const contributors = raw.map(c => ({ name: c.name, pct: Math.round((c.val / sum) * 100) }));
    contributors[contributors.length - 1].pct = 100 - contributors.slice(0, -1).reduce((a, c) => a + c.pct, 0);

    // Dynamic condition sentence
    let condition;
    if (throttle >= 85) {
        condition = "Elevated throttle is expected to increase thermal loading and accelerate projected degradation.";
    } else if (dur_h >= 7.5) {
        condition = "Extended mission duration increases accumulated thermal exposure and reduces projected RUL.";
    } else if (ambientDT >= 12) {
        condition = "Elevated ambient conditions increase predicted thermal loading during sustained operation.";
    } else if (alt_ft >= 14000) {
        condition = "High-altitude operation reduces cooling effectiveness; projected thermal load is elevated for the set power output.";
    } else if (cycleProfile === "rapid") {
        condition = "Repeated throttle transients introduce thermal cycling stress, the dominant projected degradation driver for this profile.";
    } else {
        condition = "Projected thermal loading remains within the defined warning envelope for the selected mission.";
    }

    return {
        t, cht, stress, health, dur_h,
        startCht: current.cht,
        chtEq, peakCht, peakStress,
        projectedHealth: health[N - 1],
        projectedRul, rulChange: projectedRul - current.rul,
        rulFactor, confidence,
        maintWindowLo: Math.round(projectedRul * 0.72),
        maintWindowHi: Math.round(projectedRul * 0.85),
        tWarn, tLimit,
        contributors, condition,
        endHealthDeg: accDeg * 100.0
    };
}

/* ---------------- Live current-state access ---------------- */

function prognosticsCurrentState() {
    const f = (typeof SIM_STATE !== "undefined" && SIM_STATE.currentFrame) || null;
    const prog = (typeof SIM_STATE !== "undefined" && SIM_STATE.prognostics) || null;
    const subs = (typeof SIM_STATE !== "undefined" && SIM_STATE.subsystems) || null;
    return {
        health: subs && subs.overall ? Math.round(subs.overall) : 93,
        cht: f ? f.cht : 96.0,
        egt: f ? f.egt : 652.0,
        rpm: f ? Math.round(f.rpm) : 4303,
        rul: prog && prog.rul_h ? prog.rul_h : 154.0
    };
}

/* ---------------- View wiring ---------------- */

function setupPrognosticsView() {
    const ids = ["pred-alt-slider", "pred-th-slider", "pred-dur-slider", "pred-dt-slider", "pred-cycle-select"];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", () => { progActiveScenario = "custom"; syncScenarioChips(); refreshPrognosticsView(); });
        if (el) el.addEventListener("change", () => refreshPrognosticsView());
    });

    document.querySelectorAll(".scenario-chip").forEach(chip => {
        chip.addEventListener("click", () => applyProgScenario(chip.dataset.scenario));
    });

    const resetBtn = document.getElementById("prog-reset-btn");
    if (resetBtn) resetBtn.addEventListener("click", () => applyProgScenario("normal"));

    // Chart series toggles
    ["cht", "stress", "health"].forEach(key => {
        const cb = document.getElementById(`prog-series-${key}`);
        if (cb) cb.addEventListener("change", () => refreshPrognosticsView());
    });

    applyProgScenario("normal");
}

function applyProgScenario(key) {
    const sc = PROG_SCENARIOS[key];
    if (!sc) return;
    progActiveScenario = key;
    if (sc.alt !== null) document.getElementById("pred-alt-slider").value = sc.alt;
    if (sc.th !== null) document.getElementById("pred-th-slider").value = sc.th;
    if (sc.dur !== null) document.getElementById("pred-dur-slider").value = sc.dur;
    if (sc.dT !== null) document.getElementById("pred-dt-slider").value = sc.dT;
    if (sc.cycle !== null) document.getElementById("pred-cycle-select").value = sc.cycle;
    syncScenarioChips();
    refreshPrognosticsView();
}

function syncScenarioChips() {
    document.querySelectorAll(".scenario-chip").forEach(chip => {
        chip.classList.toggle("active", chip.dataset.scenario === progActiveScenario);
    });
}

function refreshPrognosticsView() {
    const alt = parseFloat(document.getElementById("pred-alt-slider").value);
    const th = parseFloat(document.getElementById("pred-th-slider").value);
    const dur = parseFloat(document.getElementById("pred-dur-slider").value);
    const dT = parseFloat(document.getElementById("pred-dt-slider").value);
    const cycle = document.getElementById("pred-cycle-select").value;

    // Live slider value labels
    document.getElementById("pred-val-alt").textContent = `${alt.toLocaleString()} ft`;
    document.getElementById("pred-val-th").textContent = `${Math.round(th)}%`;
    document.getElementById("pred-val-dur").textContent = `${dur.toFixed(1)} h`;
    document.getElementById("pred-val-dt").textContent = `${dT >= 0 ? "+" : ""}${dT} °C ISA`;

    const cur = prognosticsCurrentState();
    const P = computeProjection(alt, th, dur, dT, cycle, cur);

    // ---- Current engine state card ----
    document.getElementById("cur-health").textContent = `${cur.health}%`;
    document.getElementById("cur-cht").textContent = `${cur.cht.toFixed(1)} °C`;
    document.getElementById("cur-egt").textContent = `${Math.round(cur.egt)} °C`;
    document.getElementById("cur-rpm").textContent = `${cur.rpm}`;
    document.getElementById("cur-rul").textContent = `${cur.rul >= 100 ? Math.round(cur.rul) : cur.rul.toFixed(1)} h`;

    // ---- Projected engine state card ----
    const projHealthEl = document.getElementById("proj-health");
    projHealthEl.textContent = `${Math.round(P.projectedHealth)}%`;
    projHealthEl.style.color = P.projectedHealth < cur.health - 6 ? "#f59e0b" : "#4ade80";

    const peakChtEl = document.getElementById("proj-cht");
    peakChtEl.textContent = `${P.peakCht.toFixed(1)} °C`;
    peakChtEl.style.color = P.peakCht >= 120 ? "#ef4444" : (P.peakCht >= 110 ? "#f59e0b" : "#f8fafc");

    document.getElementById("proj-stress").textContent = `${P.peakStress.toFixed(0)} / 100`;

    const projRulEl = document.getElementById("proj-rul");
    projRulEl.textContent = `${P.projectedRul >= 100 ? Math.round(P.projectedRul) : P.projectedRul.toFixed(1)} h`;

    const rulChg = document.getElementById("proj-rul-change");
    rulChg.textContent = `${P.rulChange >= 0 ? "+" : ""}${P.rulChange.toFixed(1)} h vs current`;
    rulChg.style.color = P.rulChange < 0 ? "#f59e0b" : "#4ade80";

    // ---- RUL card ----
    document.getElementById("rul-proj-val").textContent = `${P.projectedRul >= 100 ? Math.round(P.projectedRul) : P.projectedRul.toFixed(1)}`;
    document.getElementById("rul-conf-val").textContent = `${Math.round(P.confidence)}%`;
    const rulChg2 = document.getElementById("rul-change-val");
    rulChg2.textContent = `${P.rulChange >= 0 ? "+" : ""}${P.rulChange.toFixed(1)} h from current baseline`;
    rulChg2.style.color = P.rulChange < 0 ? "#f59e0b" : "#4ade80";
    document.getElementById("rul-maint-window").textContent = `${P.maintWindowLo}–${P.maintWindowHi} flight hours`;

    // ---- Time to threshold ----
    const fmt = v => v === null ? "Not reached within projected mission" : `${v.toFixed(1)} h into mission`;
    const warnEl = document.getElementById("tte-warn");
    warnEl.textContent = fmt(P.tWarn);
    warnEl.style.color = P.tWarn === null ? "#94a3b8" : "#f59e0b";
    const limEl = document.getElementById("tte-limit");
    limEl.textContent = fmt(P.tLimit);
    limEl.style.color = P.tLimit === null ? "#94a3b8" : "#ef4444";

    // ---- Contributors ----
    const contBody = document.getElementById("prog-contributors");
    contBody.innerHTML = P.contributors.map(c => `
        <div class="contrib-row">
            <span class="contrib-name">${c.name}</span>
            <div class="contrib-track"><div class="contrib-fill" style="width:${c.pct}%"></div></div>
            <span class="contrib-pct">${c.pct}%</span>
        </div>
    `).join("");

    // ---- Condition text ----
    const condEl = document.getElementById("prog-condition-text");
    condEl.textContent = P.condition;
    condEl.className = "prog-condition " +
        (P.peakCht >= 120 ? "crit" : (P.peakCht >= 110 || P.projectedHealth < cur.health - 6 ? "warn" : "ok"));

    drawPrognosticTrajectory("canvas-prognostic-trajectory", P);
}

/* ---------------- Trajectory chart ---------------- */

function drawPrognosticTrajectory(canvasId, P) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width || 640, h = rect.height || 300;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const padL = 46, padR = 46, padT = 34, padB = 34;
    const pw = w - padL - padR, ph = h - padT - padB;

    ctx.fillStyle = "#070a10";
    ctx.fillRect(0, 0, w, h);

    // Grid + dual axes: left = CHT °C (50-140), right = % (0-100)
    ctx.font = '500 8.5px "Share Tech Mono", monospace';
    for (let i = 0; i <= 4; i++) {
        const y = padT + (i / 4) * ph;
        ctx.strokeStyle = "#151d2a";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
        ctx.textAlign = "right"; ctx.fillStyle = "#64748b";
        ctx.fillText(`${Math.round(140 - i * 22.5)}°C`, padL - 6, y + 3);
        ctx.textAlign = "left";
        ctx.fillText(`${Math.round(100 - i * 25)}%`, w - padR + 6, y + 3);
    }

    // X axis matches projected duration
    const stepH = P.dur_h <= 6 ? 1 : (P.dur_h <= 12 ? 2 : 4);
    ctx.textAlign = "center"; ctx.fillStyle = "#64748b";
    for (let th = 0; th <= P.dur_h + 1e-9; th += stepH) {
        const x = padL + (th / P.dur_h) * pw;
        ctx.fillText(`${Math.round(th * 10) / 10}h`, x, h - padB + 14);
    }

    const getX = i => padL + (i / (P.t.length - 1)) * pw;
    const yCht = v => padT + (1 - clamp((v - 50) / 90, 0, 1)) * ph;   // 50-140 °C
    const yPct = v => padT + (1 - clamp(v / 100, 0, 1)) * ph;          // 0-100 %

    // Threshold reference lines
    function threshold(limit, color, label) {
        const y = yCht(limit);
        ctx.strokeStyle = color; ctx.lineWidth = 1.2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '700 8px "Inter", sans-serif'; ctx.fillStyle = color; ctx.textAlign = "left";
        ctx.fillText(label, padL + 6, y - 4);
    }
    threshold(135, "#ef4444", "ROTAX OEM CHT MAX 135°C");
    threshold(120, "#f59e0b", "DRISHTI WARN 120°C");

    // Series
    function plot(data, yFn, color, width) {
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
            const x = getX(i), y = yFn(data[i]);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color; ctx.lineWidth = width;
        ctx.lineJoin = "round";
        ctx.stroke();
    }

    const show = k => { const el = document.getElementById(`prog-series-${k}`); return !el || el.checked; };
    if (show("stress")) plot(P.stress, yPct, "#eab308", 1.4);
    if (show("health")) plot(P.health, yPct, "#38bdf8", 2.0);
    if (show("cht")) plot(P.cht, yCht, "#f59e0b", 2.2);

    // Start-state marker: where the live Digital Twin hands over to projection
    const x0 = padL;
    ctx.strokeStyle = "rgba(74, 222, 128, 0.7)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x0, padT); ctx.lineTo(x0, h - padB); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '700 8px "Inter", sans-serif';
    ctx.fillStyle = "#4ade80"; ctx.textAlign = "left";
    ctx.fillText("NOW", x0 + 4, padT + 10);

    // Legend chips are HTML; canvas note for scale clarity
    ctx.font = '500 8px "Share Tech Mono", monospace';
    ctx.fillStyle = "#475569"; ctx.textAlign = "right";
    ctx.fillText("left: CHT °C · right: %", w - padR - 4, padT - 6);
}
