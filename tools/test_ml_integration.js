/**
 * Verification harness for the embedded ML fault-diagnosis integration.
 *
 * Test A: exported JS Random Forest accuracy on real dataset rows
 *         (data/DRISHTI_Engine_Telemetry.csv) — must be >= 99%.
 * Test B: Isolation Forest runtime sanity — healthy rows score low,
 *         fault rows score higher (rank consistency).
 * Test C: GCS end-to-end — for each fault injection the ML diagnosis
 *         must CONFIRM the trained class (or flag anomaly), and the
 *         healthy frame must read NOMINAL.
 *
 * Run: bun tools/test_ml_integration.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// ---- Load the GCS runtime (physics + model + classifier) in a sandbox ----
const ctx = { console, Math, Date, performance };
ctx.window = ctx; // ml_model.js / ml_classifier.js attach to `window`
vm.createContext(ctx);
for (const f of ['js/physics.js', 'js/ml_model.js', 'js/ml_classifier.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}

const MODEL = ctx.DRISHTI_ML_MODEL;
const ML = ctx.DRISHTI_ML;
let failures = 0;
function check(name, ok, detail) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
    if (!ok) failures++;
}

if (!ML.ready) {
    console.error('FATAL: DRISHTI_ML_MODEL failed to load');
    process.exit(1);
}
check('model loads', true, `${MODEL.meta.rf_trees} RF trees, held-out accuracy ${(MODEL.meta.held_out_accuracy * 100).toFixed(2)}%`);

// =====================================================================
// Test A: real-dataset accuracy of the exported JS model
// =====================================================================
console.log('\n--- Test A: exported JS model on real CSV rows ---');
{
    const csvPath = path.join(ROOT, 'data', 'DRISHTI_Engine_Telemetry.csv');
    const featCols = MODEL.features; // RPM..Oil_Temperature (cols 1..9 in Var order)
    const lines = fs.readFileSync(csvPath, 'latin1').split(/\r?\n/);
    // header: Var1..Var14 -> Time,RPM,MAP,Fuel_Flow,CHT,EGT,Power,Vibration,Ambient_Pressure,Oil_Temperature,Fault_Diagnosis,...
    let tested = 0, correct = 0, perClass = {};
    const STEP = 37; // ~8100 rows evaluated
    for (let i = 1; i < lines.length; i += STEP) {
        const parts = lines[i].split(',');
        if (parts.length < 14) continue;
        const row = parts.map(parseFloat);
        if (row.some(v => !isFinite(v))) continue;
        const truth = row[10]; // Fault_Diagnosis
        const x = featCols.map((_, k) => row[k + 1]);
        const { cls } = ML._internals.rfPredictProba(x);
        tested++;
        perClass[truth] = perClass[truth] || [0, 0];
        perClass[truth][1]++;
        if (cls === truth) { correct++; perClass[truth][0]++; }
    }
    const acc = correct / tested;
    console.log(`    evaluated ${tested} rows, accuracy ${(acc * 100).toFixed(3)}%`);
    for (const c of Object.keys(perClass).sort()) {
        const [ok, tot] = perClass[c];
        console.log(`    class ${c} (${MODEL.meta.classes[c]}): ${ok}/${tot}`);
        check(`class ${c} accuracy >= 98%`, ok / tot >= 0.98, `${((ok / tot) * 100).toFixed(1)}%`);
    }
    check('overall exported-model accuracy >= 99%', acc >= 0.99, `${(acc * 100).toFixed(3)}%`);
}

// =====================================================================
// Test B: Isolation Forest rank consistency on the same rows
// =====================================================================
console.log('\n--- Test B: Isolation Forest anomaly ranking ---');
{
    const lines = fs.readFileSync(path.join(ROOT, 'data', 'DRISHTI_Engine_Telemetry.csv'), 'latin1').split(/\r?\n/);
    const healthyScores = [], faultScores = [];
    for (let i = 1; i < lines.length; i += 97) {
        const parts = lines[i].split(',');
        if (parts.length < 14) continue;
        const row = parts.map(parseFloat);
        if (row.some(v => !isFinite(v))) continue;
        const x = MODEL.features.map((_, k) => row[k + 1]);
        const raw = ML._internals.ifRawScore(x);
        (row[10] === 0 ? healthyScores : faultScores).push(raw);
    }
    const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
    const hMean = mean(healthyScores), fMean = mean(faultScores);
    console.log(`    healthy n=${healthyScores.length} mean raw score ${hMean.toFixed(4)}`);
    console.log(`    fault   n=${faultScores.length} mean raw score ${fMean.toFixed(4)}`);
    check('fault rows score higher than healthy rows', fMean > hMean, `delta ${(fMean - hMean).toFixed(4)}`);
    const flaggedHealthy = healthyScores.filter(s => s > MODEL.iforest.healthy_score_p995).length;
    console.log(`    healthy rows above display band: ${flaggedHealthy}/${healthyScores.length} (${(100 * flaggedHealthy / healthyScores.length).toFixed(2)}%)`);
    check('healthy false-positive rate <= 2%', flaggedHealthy / healthyScores.length <= 0.02);
}

// =====================================================================
// Test C: GCS end-to-end diagnosis per injection
// =====================================================================
console.log('\n--- Test C: GCS fault injections -> ML diagnosis ---');
const healthy = { misfire: false, thermal: false, mechanical: false, sensor_drift: false, lubrication: false, combustion: false, coding: false };

function gcsDiagnose(faults, elapsed = 1200) {
    const frame = ctx.generateTelemetryFrame({
        altitude_ft: 10000,
        throttle_pct: 67,          // cruise: GCS MAP scale == dataset scale here
        injection_timing_deg: 24.5,
        mission_time_h: 4.0,
        elapsed_sec: elapsed,
        selected_uav: 'UAV-01 (Primary Testbed)',
        faults: { ...healthy, ...faults },
        rectifications: {},
        noise_level: 0
    });
    return { frame, diag: ML.diagnose(frame, { ...healthy, ...faults }, {}) };
}

// Each injection must map to at least one trained class
const EXPECT = {
    misfire: [1], thermal: [3], mechanical: [4],
    sensor_drift: [2], lubrication: [3, 4], combustion: [3, 4], coding: [2, 4]
};

{
    const { diag } = gcsDiagnose({});
    console.log(`    healthy: ${diag.rf.name} ${(diag.rf.conf * 100).toFixed(0)}% | anomaly ${diag.anomaly.pct.toFixed(0)}% | ${diag.verdict.status}`);
    check('healthy frame reads NOMINAL', diag.verdict.status === 'NOMINAL', diag.verdict.text);

    // Mitigated faults must also read NOMINAL
    const rectAll = Object.fromEntries(Object.keys(healthy).map(k => [k, true]));
    const faultsAll = Object.fromEntries(Object.keys(healthy).map(k => [k, true]));
    const dMit = ML.diagnose(gcsDiagnose(faultsAll).frame, faultsAll, rectAll);
    console.log(`    all faults mitigated: ${dMit.rf.name} | ${dMit.verdict.status}`);
    check('fully mitigated airframe reads NOMINAL', dMit.verdict.status === 'NOMINAL', dMit.verdict.text);
}

const singleFaultResults = {};
for (const key of Object.keys(EXPECT)) {
    const { frame, diag } = gcsDiagnose({ [key]: true });
    singleFaultResults[key] = diag;
    const clsOk = EXPECT[key].includes(diag.rf.cls);
    const confirmed = diag.verdict.status === 'CONFIRMED';
    const flagged = ['CONFIRMED', 'MISMATCH', 'ANOMALY', 'ML ALERT'].includes(diag.verdict.status);
    console.log(`    ${key.padEnd(13)} -> ${diag.rf.name} (${(diag.rf.conf * 100).toFixed(0)}%) | anomaly ${diag.anomaly.pct.toFixed(0)}% | ${diag.verdict.status} | ${diag.verdict.text}`);
    check(`${key}: predicted class in expected set`, clsOk, `got ${diag.rf.cls} (${diag.rf.name})`);
    check(`${key}: fault is flagged (not silent)`, flagged, diag.verdict.status);
    if (!confirmed) console.log(`      NOTE: not auto-CONFIRMED — verdict: ${diag.verdict.text}`);
}

// Dual faults must still be flagged
{
    const { diag } = gcsDiagnose({ misfire: true, thermal: true });
    console.log(`    misfire+thermal -> ${diag.rf.name} | ${diag.verdict.status} | ${diag.verdict.text}`);
    check('multi-fault frame is flagged', diag.verdict.status !== 'NOMINAL');
}

// =====================================================================
console.log('\n========================================');
if (failures === 0) {
    console.log('ALL ML INTEGRATION CHECKS PASSED');
} else {
    console.log(`${failures} CHECK(S) FAILED`);
    process.exit(1);
}
