/**
 * DRISHTI GCS — Real-Time ML Fault Diagnosis (browser runtime)
 *
 * Runs the trained DRISHTI analytics models (js/ml_model.js) on every live
 * telemetry frame, fully in-browser, no server round-trip:
 *   - Random Forest (40 trees, 99.99% held-out accuracy): classifies the
 *     frame into Normal / Injector Clog / MAP Sensor Drift / CHT Fault /
 *     RPM Fault exactly like the offline DRISHTI_Analytics.py pipeline.
 *   - Isolation Forest (100 trees): unsupervised anomaly score for anything
 *     outside the trained envelope.
 *
 * A per-channel piecewise-linear calibration maps GCS physics-engine units
 * into the dataset's feature space first (anchors measured by
 * tools/probe_physics.js against healthy dataset bins).
 *
 * Consumed by js/simulation.js as window.DRISHTI_ML.diagnose(frame, ...).
 */
(function (root) {
    'use strict';

    const MODEL = root.DRISHTI_ML_MODEL || null;
    const EULER_GAMMA = 0.5772156649015329;
    const AMBIENT_DATASET = 24.9; // dataset Ambient_Pressure is constant (hPa*10 Simulink unit)

    // ------------------------------------------------------------------
    // GCS -> dataset unit calibration (piecewise linear, 3 anchor points).
    // GCS anchors: tools/probe_physics.js healthy sweep (idle/67%/85% throttle).
    // Dataset anchors: healthy (class 0) RPM bins idle/cruise/max from
    // data/DRISHTI_Engine_Telemetry.csv (300,000 frames).
    // ------------------------------------------------------------------
    const CAL = {
        RPM:             { g: [1800.0, 5000.0, 5500.0],  d: [1739.2, 5100.6, 5532.7] },
        MAP:             { g: [13.5, 31.0, 35.4],        d: [26.61, 30.98, 35.62] },
        Fuel_Flow:       { g: [8.0, 23.58, 33.02],       d: [0.0008, 0.0027, 0.0033] },
        CHT:             { g: [83.7, 96.1, 104.4],       d: [15.01, 53.62, 81.27] },
        EGT:             { g: [645.2, 722.2, 773.5],     d: [660.9, 707.3, 713.2] },
        Power:           { g: [10.73, 73.89, 98.56],     d: [20.89, 76.59, 97.05] },
        Vibration:       { g: [0.4, 1.208, 1.39],        d: [0.335, 1.014, 1.204] },
        Oil_Temperature: { g: [78.6, 90.0, 97.5],        d: [15.11, 72.18, 83.93] }
    };

    function calibrate(feature, gcsVal) {
        const c = CAL[feature];
        if (!c || !isFinite(gcsVal)) return gcsVal;
        const g = c.g, d = c.d;
        if (gcsVal <= g[0]) {
            const s = (d[1] - d[0]) / (g[1] - g[0]);
            return d[0] + (gcsVal - g[0]) * s;
        }
        for (let i = 0; i < g.length - 1; i++) {
            if (gcsVal <= g[i + 1]) {
                return d[i] + (gcsVal - g[i]) * (d[i + 1] - d[i]) / (g[i + 1] - g[i]);
            }
        }
        const s = (d[2] - d[1]) / (g[2] - g[1]);
        return d[2] + (gcsVal - g[2]) * s;
    }

    /** Map a GCS telemetry frame into the 9-feature dataset space. */
    function gcsFrameToFeatures(frame) {
        return MODEL.features.map(f => {
            if (f === 'Ambient_Pressure') return AMBIENT_DATASET;
            if (f === 'Power') return calibrate('Power', (frame.power_kw || 0) * 1.341); // kW -> hp
            const gcsKey = f === 'Fuel_Flow' ? 'fuel_flow_lh'
                : f === 'Oil_Temperature' ? 'oil_temp'
                : f.toLowerCase();
            return calibrate(f, frame[gcsKey] || 0);
        });
    }

    // ------------------------------------------------------------------
    // Random Forest inference (sklearn tree layout, exported arrays)
    // ------------------------------------------------------------------
    const N_CLASSES = 5;

    function rfPredictProba(x) {
        const agg = new Float64Array(N_CLASSES);
        const trees = MODEL.rf.trees;
        for (let t = 0; t < trees.length; t++) {
            const tree = trees[t];
            let n = 0;
            for (;;) {
                const node = tree[n];
                if (node[0] === -1) {                    // leaf: class probabilities
                    const p = node[1];
                    for (let c = 0; c < N_CLASSES; c++) agg[c] += p[c];
                    break;
                }
                n = x[node[0]] <= node[1] ? node[2] : node[3];
            }
        }
        let best = 0;
        for (let c = 1; c < N_CLASSES; c++) if (agg[c] > agg[best]) best = c;
        let total = 0;
        for (let c = 0; c < N_CLASSES; c++) total += agg[c];
        return { cls: MODEL.rf.classes[best], conf: total > 0 ? agg[best] / total : 0, probs: agg };
    }

    // ------------------------------------------------------------------
    // Isolation Forest inference (path-length method, matches sklearn)
    // ------------------------------------------------------------------
    function cFactor(n) {
        if (n <= 1) return 0;
        return 2.0 * (Math.log(n - 1) + EULER_GAMMA) - 2.0 * (n - 1) / n;
    }

    function ifRawScore(x) {
        const trees = MODEL.iforest.trees;
        const cn = cFactor(MODEL.iforest.sample_size);
        let sum = 0;
        for (let t = 0; t < trees.length; t++) {
            const tree = trees[t];
            let n = 0, depth = 0;
            for (;;) {
                const node = tree[n];
                if (node[0] === -1) {                    // leaf: add adjustment
                    sum += depth + cFactor(node[1]);
                    break;
                }
                n = x[node[0]] <= node[1] ? node[2] : node[3];
                depth++;
            }
        }
        const eh = sum / trees.length;
        // Canonical IF anomaly score s = 2^(-E[h]/c(n)); exporter's raw
        // score = s + offset_ (so score_min/max/healthy_p995 all line up).
        return Math.pow(2, -eh / cn) + MODEL.iforest.offset;
    }

    function ifNormalized(raw) {
        const lo = MODEL.iforest.score_min, hi = MODEL.iforest.score_max;
        if (hi <= lo) return 0;
        return Math.max(0, Math.min(1, (raw - lo) / (hi - lo)));
    }

    // ------------------------------------------------------------------
    // Diagnosis verdict: cross-checks ML output against injected faults
    // ------------------------------------------------------------------
    // Which trained classes each GCS injection should map to.
    const EXPECTED = {
        misfire:      { cls: [1],    text: 'Injector Clog (combustion interruption)' },
        thermal:      { cls: [3],    text: 'CHT Fault' },
        mechanical:   { cls: [4],    text: 'RPM Fault (vibration / instability)' },
        sensor_drift: { cls: [2],    text: 'MAP Sensor Drift' },
        lubrication:  { cls: [3, 4], text: 'CHT / RPM Fault (oil anomaly)' },
        combustion:   { cls: [3, 4], text: 'CHT / RPM Fault (EGT over-temp)' },
        coding:       { cls: [2, 4], text: 'MAP Drift / RPM Fault (ECU bias)' }
    };

    // Exponential smoothing so the readout doesn't strobe frame-to-frame.
    const smooth = { conf: null, anomaly: null, clsVotes: {} };
    const EMA_ALPHA = 0.25;

    function ema(prev, val) {
        if (prev === null || !isFinite(prev)) return val;
        return prev + EMA_ALPHA * (val - prev);
    }

    /**
     * @param {object} frame           GCS telemetry frame (generateTelemetryFrame output)
     * @param {object} faults          SIM_STATE.faults   (injected toggles)
     * @param {object} rectifications  SIM_STATE.rectifications
     * @returns {object} diagnosis consumed by the AI panel UI
     */
    function diagnose(frame, faults, rectifications) {
        const x = gcsFrameToFeatures(frame);
        const rf = rfPredictProba(x);
        const raw = ifRawScore(x);
        const pct = ifNormalized(raw) * 100.0;

        rf.conf = ema(smooth.conf, rf.conf);
        smooth.conf = rf.conf;
        smooth.anomaly = ema(smooth.anomaly, pct);
        const anomalyPct = smooth.anomaly;
        const anomalyFlagged = raw > MODEL.iforest.healthy_score_p995;

        const className = MODEL.meta.classes[rf.cls] || ('Class ' + rf.cls);
        const mlSeesFault = rf.cls !== 0 || anomalyFlagged;

        // Active (injected and NOT mitigated) GCS faults
        const activeKeys = Object.keys(faults || {}).filter(k => faults[k] && !(rectifications && rectifications[k]));

        let verdict, status;
        if (activeKeys.length === 0 && !mlSeesFault) {
            status = 'NOMINAL';
            verdict = 'All 5 trained classes agree with telemetry — no anomaly.';
        } else if (activeKeys.length === 0 && mlSeesFault) {
            status = 'ML ALERT';
            verdict = `Unflagged anomaly: model identifies ${className} (${(rf.conf * 100).toFixed(0)}% conf), no injection active.`;
        } else {
            const expectedSet = new Set();
            const expectedText = activeKeys.map(k => EXPECTED[k] ? EXPECTED[k].text : k).join(' + ');
            activeKeys.forEach(k => (EXPECTED[k] || { cls: [] }).cls.forEach(c => expectedSet.add(c)));
            if (expectedSet.size === 0) {
                status = 'MONITORING';
                verdict = `Injection active; model reads ${className} — outside mapped expectations.`;
            } else if (rf.cls !== 0 && expectedSet.has(rf.cls)) {
                status = 'CONFIRMED';
                verdict = `ML independently confirms: ${className} — matches injection (${expectedText}).`;
            } else if (rf.cls !== 0) {
                status = 'MISMATCH';
                verdict = `ML reads ${className}, injection was ${expectedText} — cross-check sensors.`;
            } else if (anomalyFlagged) {
                status = 'ANOMALY';
                verdict = `IF flags out-of-envelope telemetry for injection (${expectedText}).`;
            } else {
                status = 'DISAGREE';
                verdict = `Injected fault (${expectedText}) sits inside the trained envelope — ML reads Normal.`;
            }
        }

        return {
            input: x,
            rf: { cls: rf.cls, name: className, conf: rf.conf, probs: Array.from(rf.probs) },
            anomaly: { raw, pct: anomalyPct, flagged: anomalyFlagged },
            verdict: { status, text: verdict },
            activeInjections: activeKeys
        };
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------
    root.DRISHTI_ML = {
        ready: !!MODEL,
        modelInfo: MODEL ? MODEL.meta : null,
        diagnose: diagnose,
        // Exposed for the verification harness (tools/test_ml_integration.js)
        _internals: { gcsFrameToFeatures, rfPredictProba, ifRawScore, ifNormalized, calibrate, CAL }
    };

})(typeof window !== 'undefined' ? window : globalThis);
