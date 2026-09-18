/**
 * DRISHTI GCS — Real-Time Simulation Engine & Telemetry Dispatcher
 * Synchronizes 60fps gauge animations, fault injection, live oscilloscope chart, and audio alarms.
 */

const SIM_STATE = {
    selectedUAV: "UAV-01 (Primary Testbed)",
    missionMode: "Manual",
    presetName: "ISR Long-Endurance Cruise",
    altitude_ft: 10000.0,
    throttle_pct: 55.0,
    injection_timing_deg: 24.5,
    duration_h: 4.0,
    elapsed_sec: 1200, // 20m00s into flight (matches the replay 0-20 min window)
    isRunning: true,
    userRole: "Flight Director",

    // Fault Injections
    faults: {
        misfire: false,
        thermal: false,
        mechanical: false,
        sensor_drift: false,
        lubrication: false,
        combustion: false,
        coding: false
    },

    // User corrective actions applied
    rectifications: {
        misfire: false,
        thermal: false,
        mechanical: false,
        sensor_drift: false,
        lubrication: false,
        combustion: false,
        coding: false
    },

    // System Annunciator States
    annunTestActive: false,
    audioMuted: false,

    // Current Computed Telemetry Frame
    currentFrame: null,
    currentFaults: [],
    subsystems: {},
    prognostics: {},
    xaiContributors: [],

    // Historical telemetry buffer for replay & analytics
    history: []
};

// Web Audio API Cockpit Alarm Synthesizer
let audioCtx = null;
let lastBeepTime = 0;

function playCockpitAlert(type = "warning") {
    if (SIM_STATE.audioMuted) return;
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const now = Date.now();
        if (now - lastBeepTime < 1500) return;
        lastBeepTime = now;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (type === "critical") {
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(880, audioCtx.currentTime);
            osc.frequency.setValueAtTime(1174.66, audioCtx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.35);
        } else {
            osc.type = "sine";
            osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.4);
        }
    } catch (e) {
        // Ignored if browser blocks unclicked autoplay
    }
}

let riskGauge = null;
let syntheticVision = null;
let liveTelemetryChart = null;

// Anti-flicker: an exceedance must persist this many consecutive frames
// (~200 ms) before it drives the annunciators/advisories. Sensor jitter
// around a limit therefore can no longer strobe the CAUTION light.
const EXCEEDANCE_DEBOUNCE_FRAMES = 12;
const exceedanceStreak = {};

function debounceFaultExceedances(list) {
    const seen = new Set(list.map(f => f.name));
    list.forEach(f => {
        exceedanceStreak[f.name] = (exceedanceStreak[f.name] || 0) + 1;
    });
    Object.keys(exceedanceStreak).forEach(name => {
        if (!seen.has(name)) exceedanceStreak[name] = 0;
    });
    return list.filter(f => exceedanceStreak[f.name] >= EXCEEDANCE_DEBOUNCE_FRAMES);
}

function initializeSimulation() {
    // 1. Initialize Analog Gauges & Vertical Tapes
    initializeAllGauges();
    initializeAllTapes();

    // 2. Initialize Canvas Visualizers
    riskGauge = new RadialRiskGauge('gauge-feasibility');
    syntheticVision = new SyntheticVisionCorridor('canvas-synthetic-vision');
    liveTelemetryChart = new LiveTelemetryChart('canvas-live-telemetry');

    // 3. Prepopulate historical flight data for mission replay
    generateInitialHistory();

    // 4. Main animation loop
    requestAnimationFrame(simulationLoop);
}

function generateInitialHistory() {
    SIM_STATE.history = [];
    const totalSamples = 120;
    const stepSec = (SIM_STATE.elapsed_sec) / totalSamples;
    for (let i = 0; i < totalSamples; i++) {
        const sec = i * stepSec;
        const frame = generateTelemetryFrame({
            altitude_ft: SIM_STATE.altitude_ft,
            throttle_pct: SIM_STATE.throttle_pct,
            injection_timing_deg: SIM_STATE.injection_timing_deg,
            mission_time_h: SIM_STATE.duration_h,
            elapsed_sec: sec,
            selected_uav: SIM_STATE.selectedUAV,
            faults: {},
            rectifications: {},
            noise_level: 0.01
        });
        SIM_STATE.history.push(frame);
    }
}

let lastTick = performance.now();
let lastChartPush = 0;

function simulationLoop(timestamp) {
    const dt = (timestamp - lastTick) / 1000;
    lastTick = timestamp;

    if (SIM_STATE.isRunning) {
        SIM_STATE.elapsed_sec += dt * 1.0;
    }

    // 1. Calculate physics frame
    const frame = generateTelemetryFrame({
        altitude_ft: SIM_STATE.altitude_ft,
        throttle_pct: SIM_STATE.throttle_pct,
        injection_timing_deg: SIM_STATE.injection_timing_deg,
        mission_time_h: SIM_STATE.duration_h,
        elapsed_sec: SIM_STATE.elapsed_sec,
        selected_uav: SIM_STATE.selectedUAV,
        faults: SIM_STATE.faults,
        rectifications: SIM_STATE.rectifications
    });
    SIM_STATE.currentFrame = frame;

    // 2. Push to live rolling telemetry chart every 250ms
    if (timestamp - lastChartPush > 250) {
        lastChartPush = timestamp;
        if (liveTelemetryChart) {
            liveTelemetryChart.pushSample(frame);
        }
    }

    // 3. Evaluate exceedances against ROTAX OEM limits (debounced against jitter)
    const activeFaults = debounceFaultExceedances(evaluateFaultExceedances(frame));
    SIM_STATE.currentFaults = activeFaults;

    // 4. Subsystem Health calculations
    const subs = calculateSubsystemsHealth(frame, activeFaults.length);
    SIM_STATE.subsystems = subs;

    // 5. Degradation and RUL prognostics. Completion probability uses the
    //    LIVE subsystem health (same value the Subsystem Health panel shows)
    //    so injected faults depress it immediately; the fleet-TBO RUL is only
    //    passed through for the RUL display and the time-margin check.
    const activeSimCount = Object.values(SIM_STATE.faults).filter(Boolean).length;
    const fleetMetrics = (typeof computeFleetMetrics === 'function')
        ? computeFleetMetrics(SIM_STATE.selectedUAV)
        : null;
    const fleetHealth = fleetMetrics ? fleetMetrics.health : subs.overall;
    // airframeHealth: the selected UAV's FLEET condition (Engine Health card)
    // caps the completion probability / master state, so a grounded or
    // maintenance-depot airframe can never present a NOMINAL mission —
    // matching exactly what the Fleet Digital Twin panel reports.
    const prognostics = calculatePrognostics(frame, subs.overall, activeFaults.length, activeSimCount,
        fleetMetrics ? fleetMetrics.rul : null, fleetMetrics ? fleetMetrics.health : null);
    SIM_STATE.prognostics = prognostics;

    // 6. XAI Top Risk Contributors
    const xaiList = calculateXAIRiskContributors(frame, activeFaults);
    SIM_STATE.xaiContributors = xaiList;

    // 6b. Real-time ML fault diagnosis — the models trained from
    //     DRISHTI_Engine_Telemetry.csv (DRISHTI_Analytics.py pipeline) run
    //     in-browser on every live frame and cross-check the injected faults.
    if (window.DRISHTI_ML && window.DRISHTI_ML.ready) {
        SIM_STATE.mlDiagnosis = window.DRISHTI_ML.diagnose(frame, SIM_STATE.faults, SIM_STATE.rectifications);
    }

    // 7. Update 9 Analog Gauges (Target values)
    if (GAUGES.rpm) GAUGES.rpm.setValue(frame.rpm);
    if (GAUGES.map) GAUGES.map.setValue(frame.map);
    if (GAUGES.cht) GAUGES.cht.setValue(frame.cht);
    if (GAUGES.egt) GAUGES.egt.setValue(frame.egt);
    if (GAUGES.power) GAUGES.power.setValue(frame.power_kw);
    if (GAUGES.oilPress) GAUGES.oilPress.setValue(frame.oil_press);
    if (GAUGES.oilTemp) GAUGES.oilTemp.setValue(frame.oil_temp);
    if (GAUGES.vibration) GAUGES.vibration.setValue(frame.vibration);
    if (GAUGES.alternator) GAUGES.alternator.setValue(frame.alternator_health);

    Object.values(GAUGES).forEach(g => g.update());

    // 8. Update Vertical Tapes
    if (TAPES.fuelFlow) TAPES.fuelFlow.setValue(frame.fuel_flow_lh);
    if (TAPES.busVoltage) TAPES.busVoltage.setValue(frame.bus_voltage);
    if (TAPES.altHealth) TAPES.altHealth.setValue(frame.alternator_health);
    if (TAPES.fuelQty) TAPES.fuelQty.setValue(frame.fuel_qty);
    Object.values(TAPES).forEach(t => t.update());

    // 9. Update 6-Segment Risk Speedometer Gauge — driven by the live
    //    mission-feasibility score (engine margins vs OEM limits), not the
    //    completion-probability metric, which saturates on a healthy airframe.
    if (riskGauge) {
        const feas = computeMissionFeasibility(frame, subs, activeFaults, activeSimCount, prognostics);
        SIM_STATE.missionFeasibility = feas;
        riskGauge.setValue(feas.feasibilityPct, feas.riskLabel);
        riskGauge.update();
    }

    // 10. Update Synthetic Vision 3D
    if (syntheticVision) {
        syntheticVision.update(frame.altitude_ft, frame.throttle_pct);
    }

    // 11. Update DOM Elements
    updateDOMIndicators(frame, activeFaults, subs, prognostics, xaiList);

    requestAnimationFrame(simulationLoop);
}

function updateDOMIndicators(frame, faults, subs, prog, xai) {
    // Top Clock
    const clockElem = document.getElementById('utc-clock');
    if (clockElem) {
        const d = new Date();
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const day = d.getDate();
        const mon = months[d.getMonth()];
        const yr = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        clockElem.textContent = `${day} ${mon} ${yr} / ${hh}:${mm}:${ss}`;
    }

    // Sidebar Injection Timing Readout
    const injReadout = document.getElementById('val-injection');
    if (injReadout) injReadout.textContent = `${frame.injection_timing.toFixed(1)}° BTDC`;

    // Top Annunciators
    const hasCrit = faults.some(f => f.severity === "CRITICAL");
    // A fault only lights CAUTION while it is both injected AND not mitigated.
    // Once the user applies the corrective measure the light must clear.
    const unmitigatedFaults = Object.keys(SIM_STATE.faults).filter(k => SIM_STATE.faults[k] && !SIM_STATE.rectifications[k]);
    const hasWarn = faults.some(f => f.severity === "WARNING") || unmitigatedFaults.length > 0;

    const warnAnnun = document.getElementById('annun-master-warning');
    const cautAnnun = document.getElementById('annun-caution');
    const testAnnun = document.getElementById('annun-test');
    const okAnnun = document.getElementById('annun-system-ok');

    if (SIM_STATE.annunTestActive) {
        warnAnnun && warnAnnun.classList.add('active');
        cautAnnun && cautAnnun.classList.add('active');
        testAnnun && testAnnun.classList.add('active');
        okAnnun && okAnnun.classList.add('active');
    } else {
        testAnnun && testAnnun.classList.remove('active');

        if (hasCrit) {
            warnAnnun && warnAnnun.classList.add('active');
            cautAnnun && cautAnnun.classList.remove('active');
            okAnnun && okAnnun.classList.remove('active');
            playCockpitAlert("critical");
        } else if (hasWarn) {
            warnAnnun && warnAnnun.classList.remove('active');
            cautAnnun && cautAnnun.classList.add('active');
            okAnnun && okAnnun.classList.remove('active');
            playCockpitAlert("warning");
        } else {
            warnAnnun && warnAnnun.classList.remove('active');
            cautAnnun && cautAnnun.classList.remove('active');
            okAnnun && okAnnun.classList.add('active');
        }
    }

    // DRISHTI Intelligence Summary Cards — kept identical to the Fleet
    // Digital Twin panel so both views always show the same numbers.
    const fleet = (typeof computeFleetMetrics === 'function') ? computeFleetMetrics(SIM_STATE.selectedUAV) : null;
    const fleetHealthPct = fleet ? fleet.health : subs.overall;
    const fleetRul = fleet ? fleet.rul : prog.rul_h;

    const ehElem = document.getElementById('summary-engine-health');
    if (ehElem) {
        ehElem.textContent = `${fleetHealthPct}%`;
        ehElem.style.color = fleetHealthPct >= 85 ? '#4ade80' : (fleetHealthPct >= 65 ? '#fbbf24' : '#f87171');
    }
    const ehDeltaElem = document.getElementById('summary-engine-health-delta');
    if (ehDeltaElem) {
        const fleetEntry = FLEET_DATABASE[SIM_STATE.selectedUAV];
        const delta = (fleet && fleetEntry) ? fleet.health - fleetEntry.health : 0;
        ehDeltaElem.textContent = delta === 0 ? '↑ 0.0%' : `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1)}%`;
        ehDeltaElem.className = `metric-delta ${delta > 0 ? 'positive' : (delta < 0 ? 'negative' : 'neutral')}`;
    }

    const afElem = document.getElementById('summary-active-faults');
    if (afElem) {
        afElem.textContent = `${faults.length + unmitigatedFaults.length}`;
        afElem.style.color = (faults.length + unmitigatedFaults.length) > 0 ? '#f87171' : '#f8fafc';
    }
    const afDeltaElem = document.getElementById('summary-active-faults-delta');
    if (afDeltaElem) {
        afDeltaElem.remove();
    }

    const rulElem = document.getElementById('summary-predicted-rul');
    if (rulElem) {
        rulElem.textContent = `${fleetRul.toFixed(1)} h`;
        rulElem.style.color = fleetRul > 300 ? '#f8fafc' : (fleetRul > 100 ? '#fbbf24' : '#f87171');
    }

    const rMarginElem = document.getElementById('summary-rul-margin');
    if (rMarginElem) {
        // Margin measured against the fleet RUL actually displayed on the card
        const shownRul = (fleet ? fleet.rul : prog.rul_h);
        const shownMargin = shownRul - prog.remainingMission_h;
        const sign = shownMargin >= 0 ? '+' : '';
        rMarginElem.textContent = `${sign}${shownMargin.toFixed(1)} h margin`;
        rMarginElem.className = shownMargin >= 0 ? 'metric-delta positive' : 'metric-delta negative';
    }

    const confElem = document.getElementById('summary-rul-conf');
    if (confElem) {
        confElem.textContent = `${prog.rul_confidence}%`;
        confElem.style.color = prog.rul_confidence >= 90 ? '#4ade80' : (prog.rul_confidence >= 70 ? '#f59e0b' : '#f87171');
    }

    const compElem = document.getElementById('summary-mission-completion');
    if (compElem) {
        compElem.textContent = `${prog.completionPct}%`;
        // 4-tier colour scale matching the Correct Status State Table:
        // HIGH (nominal) / MODERATE (caution) / LOW (high risk) / CRITICAL
        const compColor = prog.completionPct >= 72 ? '#4ade80'
            : prog.completionPct >= 42 ? '#fbbf24'
            : prog.completionPct >= 17 ? '#fb923c'
            : '#f87171';
        compElem.style.color = compColor;
    }
    const compDeltaElem = document.getElementById('summary-mission-completion-delta');
    if (compDeltaElem) {
        // Tier label comes straight from the master mission state
        // (MISSION_STATE_TABLE), so it can never contradict the advisory or
        // the feasibility gauge.
        const tier = prog.riskTier;                 // HIGH / MODERATE / LOW / CRITICAL
        const arrow = prog.completionPct >= 72 ? '↑'
            : prog.completionPct >= 42 ? '→'
            : '↓';
        compDeltaElem.textContent = `${arrow} ${tier}`;
        const cls = prog.completionPct >= 72 ? 'positive'
            : prog.completionPct >= 42 ? 'neutral'
            : 'negative';
        compDeltaElem.className = `metric-delta ${cls}`;
        if (prog.completionPct < 42) compDeltaElem.style.color = '#f87171';
        else compDeltaElem.style.color = '';
    }
    const confDeltaElem = document.getElementById('summary-rul-conf-delta');
    if (confDeltaElem) {
        // RUL confidence is state-driven too — label the tier to match.
        const confTier = prog.rul_confidence >= 90 ? 'HIGH'
            : prog.rul_confidence >= 70 ? 'MODERATE'
            : prog.rul_confidence >= 50 ? 'LOW'
            : 'CRITICAL';
        confDeltaElem.textContent = `${confTier === 'HIGH' ? '↑' : confTier === 'MODERATE' ? '→' : '↓'} ${confTier}`;
        confDeltaElem.className = `metric-delta ${prog.rul_confidence >= 90 ? 'positive' : (prog.rul_confidence >= 70 ? 'neutral' : 'negative')}`;
        if (prog.rul_confidence < 70) confDeltaElem.style.color = '#f87171';
        else confDeltaElem.style.color = '';
    }

    // Subsystem Progress Bars
    updateProgressBar('bar-sub-thermal', 'val-sub-thermal', subs.thermal);
    updateProgressBar('bar-sub-lubrication', 'val-sub-lubrication', subs.lubrication);
    updateProgressBar('bar-sub-fuel', 'val-sub-fuel', subs.fuel);
    updateProgressBar('bar-sub-ignition', 'val-sub-ignition', subs.ignition);
    updateProgressBar('bar-sub-mechanical', 'val-sub-mechanical', subs.mechanical);
    updateProgressBar('bar-sub-electrical', 'val-sub-electrical', subs.electrical);

    // AI / XAI Risk Contributors Table
    const xaiTable = document.getElementById('xai-contributors-body');
    if (xaiTable && xai.length > 0) {
        xaiTable.innerHTML = xai.map(item => `
            <tr>
                <td class="param-name">${item.param}</td>
                <td class="param-influence">
                    <div class="xai-bar-track">
                        <div class="xai-bar-fill" style="width: ${item.influence * 100}%"></div>
                    </div>
                    <span>${item.influence.toFixed(2)}</span>
                </td>
                <td class="param-why">${item.why}</td>
                <td class="param-action">${item.action}</td>
            </tr>
        `).join('');
    }

    // Mission Advisory Header & Details
    const advTitle = document.getElementById('advisory-title');
    if (advTitle) {
        advTitle.textContent = prog.advisory;
        advTitle.className = `advisory-title ${hasCrit ? 'crit' : (hasWarn ? 'warn' : 'nominal')}`;
    }
    const advSub = document.getElementById('advisory-subtitle');
    if (advSub) advSub.textContent = prog.advisoryDetail;

    const advMargin = document.getElementById('advisory-margin');
    if (advMargin) {
        // margin_h is engine-life hours vs remaining mission (drives the
        // completion penalties). With a fresh airframe that's ~1500 h —
        // meaningless on the crew card. The useful mission margin can never
        // exceed the whole mission, so cap the display at mission total.
        const displayMargin = Math.min(prog.margin_h, prog.missionTotal_h);
        advMargin.textContent = `${displayMargin >= 0 ? '+' : ''}${displayMargin.toFixed(1)} h`;
        advMargin.style.color = displayMargin >= 0 ? '#4ade80' : '#ef4444';
    }

    const advRemain = document.getElementById('advisory-remain');
    if (advRemain) advRemain.textContent = `${prog.remainingMission_h.toFixed(2)} h`;

    const advTotal = document.getElementById('advisory-total');
    if (advTotal) advTotal.textContent = `${prog.missionTotal_h.toFixed(2)} h`;

    // Safety & Diversion Advisory
    const decElem = document.getElementById('diversion-decision');
    if (decElem) decElem.textContent = prog.advisory;

    // Distress / ATC Message Status
    const atcStatus = document.getElementById('atc-status');
    const atcDesc = document.getElementById('atc-desc');
    if (atcStatus && atcDesc) {
        if (hasCrit) {
            atcStatus.textContent = "EMERGENCY BROADCAST ACTIVE";
            atcStatus.className = "atc-status crit";
            atcDesc.textContent = "MAYDAY telemetry burst transmitted on 121.5 MHz & Satellite link.";
        } else if (hasWarn) {
            atcStatus.textContent = "PAN-PAN ADVISORY TRANSMITTING";
            atcStatus.className = "atc-status warn";
            atcDesc.textContent = "Telemetry advisory relayed to Regional ATC (Hyderabad Sector).";
        } else {
            atcStatus.textContent = "STANDBY";
            atcStatus.className = "atc-status standby";
            atcDesc.textContent = "No distress message required. System will auto-transmit if risk becomes HIGH/CRITICAL.";
        }
    }
}

function updateProgressBar(barId, valId, score) {
    const bar = document.getElementById(barId);
    const val = document.getElementById(valId);
    if (!bar || !val) return;

    bar.style.width = `${score}%`;
    val.textContent = `${score}%`;

    if (score < 50) {
        bar.className = 'sub-bar-fill critical';
    } else if (score < 75) {
        bar.className = 'sub-bar-fill warn';
    } else {
        bar.className = 'sub-bar-fill nominal';
    }
}
