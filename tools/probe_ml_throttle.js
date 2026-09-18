/** Quick probe: ML diagnosis across throttle settings and injections. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

const ctx = { console, Math, Date, performance };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['js/physics.js', 'js/ml_model.js', 'js/ml_classifier.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}

const healthy = { misfire: false, thermal: false, mechanical: false, sensor_drift: false, lubrication: false, combustion: false, coding: false };

function go(faults, throttle, elapsed = 1200) {
    const frame = ctx.generateTelemetryFrame({
        altitude_ft: 10000, throttle_pct: throttle, injection_timing_deg: 24.5,
        mission_time_h: 4, elapsed_sec: elapsed, selected_uav: 'UAV-01 (Primary Testbed)',
        faults: { ...healthy, ...faults }, rectifications: {}, noise_level: 0
    });
    const d = ctx.DRISHTI_ML.diagnose(frame, { ...healthy, ...faults }, {});
    return d.rf.name + ' (' + Math.round(d.rf.conf * 100) + '%) anom=' + Math.round(d.anomaly.pct) + '% [' + d.verdict.status + ']';
}

for (const th of [67, 85, 95, 100]) {
    console.log('--- throttle ' + th + ' ---');
    console.log('  healthy      ', go({}, th));
    for (const k of ['misfire', 'thermal', 'mechanical', 'sensor_drift', 'lubrication', 'combustion', 'coding']) {
        console.log('  ' + k.padEnd(13), go({ [k]: true }, th));
    }
}
console.log('--- sensor_drift @95%, full ramp (elapsed 1800) ---');
console.log(go({ sensor_drift: true }, 95, 1800));
console.log('--- thermal @85% (mid-ramp snapshot) ---');
console.log(go({ thermal: true }, 85, 600));
