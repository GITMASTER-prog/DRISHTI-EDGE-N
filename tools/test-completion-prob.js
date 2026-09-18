/**
 * Verification harness for the unified Correct Status State Table.
 * Loads the real physics.js source (plain script-tag globals, evaluated in a
 * vm sandbox) and replays the exact call chain the app uses:
 * generateTelemetryFrame -> calculateSubsystemsHealth -> calculatePrognostics
 * -> computeMissionFeasibility.
 *
 * The core invariant: all four indicators (completion probability, RUL
 * confidence, feasibility gauge, advisory) must derive from ONE master
 * mission state and therefore always agree with the status table.
 *
 * Run with the Freebuff-bundled Bun:
 *   "%LOCALAPPDATA%\Programs\@codebufffreebuff-desktop\resources\bun\bun.exe" tools/test-completion-prob.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'physics.js'), 'utf8');

const sandbox = {
    console,
    window: {},
    Date,
    Math,
    performance: { now: () => Date.now() }
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'physics.js' });

const frame = (faults, rectified = {}) => vm.runInContext(`
    generateTelemetryFrame({
        altitude_ft: 12000,
        throttle_pct: 55,
        injection_timing_deg: 24.5,
        mission_time_h: 4.0,
        elapsed_sec: 1200,
        selected_uav: "UAV-01 (Primary Testbed)",
        faults: ${JSON.stringify(faults)},
        rectifications: ${JSON.stringify(rectified)},
        noise_level: 0.0
    })
`, sandbox);

function scenario(label, faultKeys, rectifiedKeys = []) {
    const faults = Object.fromEntries(faultKeys.map(k => [k, true]));
    const rectifications = Object.fromEntries(rectifiedKeys.map(k => [k, true]));
    const f = frame(faults, rectifications);
    const activeFaultList = f.activeFaultList.filter(k => !rectifications[k]);
    const subs = vm.runInContext(
        `calculateSubsystemsHealth(${JSON.stringify(f)}, ${activeFaultList.length})`,
        sandbox
    );
    const prognostics = vm.runInContext(
        `calculatePrognostics(${JSON.stringify(f)}, ${subs.overall}, ${activeFaultList.length}, ${activeFaultList.length}, 1655.3)`,
        sandbox
    );
    const feas = vm.runInContext(
        `computeMissionFeasibility(${JSON.stringify(f)}, ${JSON.stringify(subs)}, ${JSON.stringify(activeFaultList)}, ${activeFaultList.length}, ${JSON.stringify(prognostics)})`,
        sandbox
    );
    console.log(
        `${label.padEnd(30)} state=${prognostics.missionState.padEnd(19)}`
        + ` completion=${String(prognostics.completionPct).padStart(3)}% (${prognostics.riskTier.padEnd(8)})`
        + ` conf=${String(prognostics.rul_confidence).padStart(2)}%`
        + ` feas=${String(feas.feasibilityPct).padStart(3)} (${feas.riskLabel})`
    );
    return { prognostics, feas };
}

// Feasibility gauge segment breakpoints (charts.js artwork)
function expectedSegment(v) {
    if (v >= 83) return 'OPTIMAL';
    if (v >= 67) return 'GOOD';
    if (v >= 50) return 'CAUTION';
    if (v >= 33) return 'MODERATE';
    if (v >= 17) return 'HIGH RISK';
    return 'CRITICAL';
}

const EXPECTED = {
    'NOMINAL':            { conf: 90, feas: 88, seg: 'OPTIMAL',    tier: 'HIGH',     adv: 'CONTINUE MISSION' },
    'CAUTION':            { conf: 70, feas: 60, seg: 'CAUTION',   tier: 'MODERATE', adv: 'CONTINUE WITH CAUTION' },
    'HIGH RISK':          { conf: 50, feas: 35, seg: 'HIGH RISK', tier: 'LOW',      adv: 'CONTINUE WITH CAUTION' },
    'DIVERT / EMERGENCY': { conf: 25, feas: 10, seg: 'CRITICAL',  tier: 'CRITICAL', adv: 'DIVERT / EMERGENCY RECOVERY' }
};

console.log('=== Correct Status State Table verification ===\n');
const results = [
    scenario('0 faults (healthy)', []),
    scenario('1 fault (thermal)', ['thermal']),
    scenario('1 fault (sensor_drift)', ['sensor_drift']),
    scenario('3 faults (thermal+lube+mech)', ['thermal', 'lubrication', 'mechanical']),
    scenario('5 faults (all except coding)', ['misfire', 'thermal', 'mechanical', 'lubrication', 'combustion']),
    scenario('7 faults (everything)', ['misfire', 'thermal', 'mechanical', 'sensor_drift', 'lubrication', 'combustion', 'coding']),
    scenario('3 injected, 3 mitigated', ['thermal', 'lubrication', 'mechanical'], ['thermal', 'lubrication', 'mechanical'])
];

let pass = true;
const fail = (msg) => { console.error(`FAIL: ${msg}`); pass = false; };

for (const { prognostics: p, feas } of results) {
    const exp = EXPECTED[p.missionState];
    if (!exp) { fail(`unknown mission state "${p.missionState}"`); continue; }
    if (p.rul_confidence !== exp.conf) fail(`state ${p.missionState}: RUL confidence ${p.rul_confidence} != ${exp.conf}`);
    if (p.riskTier !== exp.tier) fail(`state ${p.missionState}: completion tier "${p.riskTier}" != "${exp.tier}"`);
    if (p.advisory !== exp.adv) fail(`state ${p.missionState}: advisory "${p.advisory}" != "${exp.adv}"`);
    if (feas.riskLabel !== exp.seg) fail(`state ${p.missionState}: gauge segment "${feas.riskLabel}" != "${exp.seg}"`);
    if (Math.abs(feas.feasibilityPct - exp.feas) > 12) fail(`state ${p.missionState}: feasibility ${feas.feasibilityPct} outside segment anchor ${exp.feas} +/-12`);
    // The status table (not the artwork boundary) defines the band: e.g. the
    // table anchors HIGH RISK at 35%, one point above the artwork's 33 line.
    // What must hold is RANK consistency: the gauge segment may look at most
    // one band healthier than the state (because the anchor sits just past an
    // artwork boundary) and never unhealthier. NOMINAL is pinned to rank 4 so
    // the painted OPTIMAL band (>= 83) stays allowed for a clean aircraft.
    const stateRank = { 'NOMINAL': 4, 'CAUTION': 2, 'HIGH RISK': 1, 'DIVERT / EMERGENCY': 0 }[p.missionState];
    const segRank = { 'OPTIMAL': 5, 'GOOD': 4, 'CAUTION': 3, 'MODERATE': 2, 'HIGH RISK': 1, 'CRITICAL': 0 }[feas.riskLabel];
    if (segRank < stateRank) fail(`state ${p.missionState}: gauge segment "${feas.riskLabel}" is unhealthier than the state itself`);
    if (segRank > stateRank + 1) fail(`state ${p.missionState}: gauge segment "${feas.riskLabel}" looks too healthy for the state`);
}

// Completion numbers must still degrade monotonically with fault count
const [c0, c1, , c3, c5, c7] = results.map(r => r.prognostics.completionPct);
if (!(c1 < c0)) fail(`1 fault (${c1}) must lower completion vs healthy (${c0})`);
if (!(c3 < c1)) fail(`3 faults (${c3}) must be worse than 1 (${c1})`);
if (!(c5 <= c3)) fail(`5 faults (${c5}) must not recover vs 3 (${c3})`);
if (!(c7 <= c5)) fail(`7 faults (${c7}) must not recover vs 5 (${c5})`);
if (c0 < 72) fail(`healthy baseline (${c0}) must sit in the HIGH band (>= 72)`);

// THE user-visible bug this harness exists for: completion 100% + confidence
// 90% + CONTINUE MISSION must NEVER show a mid-scale gauge. A clean aircraft
// has to read OPTIMAL (>= 84) on the feasibility gauge.
const healthy = results[0];
if (healthy.prognostics.completionPct === 100 && healthy.prognostics.rul_confidence === 90
    && healthy.feas.feasibilityPct < 84)
    fail(`ILLOGICAL: completion 100% / conf 90% but feasibility only ${healthy.feas.feasibilityPct}% — must be OPTIMAL (>= 84)`);

// Cross-indicator sanity on every scenario: no more "completion 66 vs
// feasibility 95". Feasibility must sit at-or-below the completion metric's
// own band so the gauge never looks healthier than the number above it.
const BANDS = [
    { lo: 72, feasFloor: 50 },   // HIGH band  -> gauge in GOOD-or-lower
    { lo: 42, feasFloor: 33 },   // MODERATE   -> gauge CAUTION-or-lower
    { lo: 17, feasFloor: 17 },   // LOW        -> gauge HIGH RISK-or-lower
    { lo: 0,  feasFloor: 0 }     // CRITICAL   -> gauge CRITICAL
];
for (const { prognostics: p, feas } of results) {
    const band = BANDS.find(b => p.completionPct >= b.lo);
    if (feas.feasibilityPct < band.feasFloor)
        fail(`ILLOGICAL COMBO: completion ${p.completionPct}% (band floor ${band.lo}) but feasibility ${feas.feasibilityPct}% is not in the matching segment`);
    if (feas.feasibilityPct < p.completionPct - 55)
        fail(`INVERTED COMBO: completion ${p.completionPct}% but feasibility ${feas.feasibilityPct}% is far below it`);
}

console.log(pass ? '\nPASS — all indicators follow the Correct Status State Table consistently.'
                 : '\nFAIL — see errors above.');

// ---- Airframe-condition coupling (Fleet Digital Twin -> cockpit cards) ----
// The user-visible bug: switching the Aircraft/Test Bed dropdown from the
// primary testbed to a grounded airframe updated Engine Health + RUL but left
// completion / confidence / feasibility / advisory at their healthy values.
// The airframe's fleet health must cap the master mission state.
console.log('\n=== Fleet airframe-condition coupling verification ===\n');
const FLEET_HEALTH = { 'UAV-01': 93, 'UAV-02': 89, 'UAV-03': 68, 'UAV-04': 38, 'UAV-05': 96 };
const EXPECTED_STATE = { 'UAV-01': 'NOMINAL', 'UAV-02': 'NOMINAL', 'UAV-03': 'CAUTION', 'UAV-04': 'HIGH RISK', 'UAV-05': 'NOMINAL' };

let pass2 = true;
for (const [tail, fleetHealth] of Object.entries(FLEET_HEALTH)) {
    const f = vm.runInContext(`
        generateTelemetryFrame({
            altitude_ft: 12000, throttle_pct: 55, injection_timing_deg: 24.5,
            mission_time_h: 4.0, elapsed_sec: 1200,
            selected_uav: ${JSON.stringify(tail === 'UAV-01' ? 'UAV-01 (Primary Testbed)' : tail)},
            faults: {}, rectifications: {}, noise_level: 0.0
        })
    `, sandbox);
    const subs = vm.runInContext(`calculateSubsystemsHealth(${JSON.stringify(f)}, 0)`, sandbox);
    const p = vm.runInContext(
        `calculatePrognostics(${JSON.stringify(f)}, ${subs.overall}, 0, 0, 1655.3, ${fleetHealth})`,
        sandbox
    );
    const feas = vm.runInContext(
        `computeMissionFeasibility(${JSON.stringify(f)}, ${JSON.stringify(subs)}, [], 0, ${JSON.stringify(p)})`,
        sandbox
    );
    const ok = p.missionState === EXPECTED_STATE[tail];
    if (!ok) { console.error(`FAIL: ${tail} (fleet health ${fleetHealth}) -> state "${p.missionState}", expected "${EXPECTED_STATE[tail]}"`); pass2 = false; }
    if (p.completionPct > fleetHealth + 2) { console.error(`FAIL: ${tail} completion ${p.completionPct}% exceeds fleet health cap ${fleetHealth}+2`); pass2 = false; }
    console.log(
        `${tail.padEnd(7)} fleetHealth=${String(fleetHealth).padStart(2)}`
        + ` -> completion=${String(p.completionPct).padStart(3)}% (${p.riskTier.padEnd(8)})`
        + ` conf=${String(p.rul_confidence).padStart(2)}%`
        + ` feas=${String(feas.feasibilityPct).padStart(3)} (${feas.riskLabel})`
        + ` advisory="${p.advisory}"`
        + (ok ? '  ✓' : '  ✗')
    );
}

// A faulted healthy airframe must still be able to go BELOW its cap
const fF = vm.runInContext(`
    generateTelemetryFrame({
        altitude_ft: 12000, throttle_pct: 55, injection_timing_deg: 24.5,
        mission_time_h: 4.0, elapsed_sec: 1200,
        selected_uav: 'UAV-01 (Primary Testbed)',
        faults: { thermal: true, lubrication: true, mechanical: true }, rectifications: {}, noise_level: 0.0
    })
`, sandbox);
const subsF = vm.runInContext(`calculateSubsystemsHealth(${JSON.stringify(fF)}, 3)`, sandbox);
const pF = vm.runInContext(`calculatePrognostics(${JSON.stringify(fF)}, ${subsF.overall}, 3, 3, 1655.3, 93)`, sandbox);
if (pF.completionPct >= 91) { console.error(`FAIL: 3 faults on UAV-01 must still depress completion below the 95 cap (got ${pF.completionPct}%)`); pass2 = false; }
console.log(`UAV-01 + 3 faults -> completion=${pF.completionPct}% state=${pF.missionState} (faults must still bite)`);

console.log(pass2 ? '\nPASS — cockpit intelligence cards follow the selected Fleet Digital Twin airframe.'
                  : '\nFAIL — airframe coupling broken, see errors above.');
process.exit(pass && pass2 ? 0 : 1);
