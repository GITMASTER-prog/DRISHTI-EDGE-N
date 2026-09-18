/**
 * Probe generateTelemetryFrame() from the GCS physics engine at the dataset's
 * operating points, so the ML adapter maps live GCS telemetry into the exact
 * feature space the Random Forest was trained on.
 *
 * Run: bun tools/probe_physics.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = { console, Math, Date, performance };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/physics.js'), 'utf8'), ctx, { filename: 'physics.js' });

const healthy = { misfire: false, thermal: false, mechanical: false, sensor_drift: false, lubrication: false, combustion: false, coding: false };

function probe(label, params, faults = {}) {
    const f = ctx.generateTelemetryFrame({
        altitude_ft: 10000,
        throttle_pct: params.throttle_pct ?? 55,
        injection_timing_deg: 24.5,
        mission_time_h: 4.0,
        elapsed_sec: params.elapsed_sec ?? 0,          // fixed time => deterministic noise
        selected_uav: 'UAV-01 (Primary Testbed)',
        faults: { ...healthy, ...faults },
        rectifications: {},
        noise_level: 0
    });
    console.log(
        `${label.padEnd(16)} rpm=${f.rpm.toFixed(0).padStart(5)}  map=${f.map.toFixed(2).padStart(6)}  ` +
        `ff=${f.fuel_flow_lh.toFixed(2).padStart(6)}  cht=${f.cht.toFixed(1).padStart(6)}  ` +
        `egt=${f.egt.toFixed(1).padStart(6)}  hp=${(f.power_kw * 1.341).toFixed(2).padStart(6)}  ` +
        `vib=${f.vibration.toFixed(3)}  oilT=${f.oil_temp.toFixed(1).padStart(6)}  oilP=${f.oil_press.toFixed(2)}`
    );
    return f;
}

console.log('=== GCS physics (UAV-01, 10000 ft, 55% throttle, no noise) ===');
probe('CRUISE', {});
probe('misfire', {}, { misfire: true });
probe('thermal', {}, { thermal: true });
probe('mechanical', {}, { mechanical: true });
probe('sensor_drift', {}, { sensor_drift: true });
probe('lubrication', {}, { lubrication: true });
probe('combustion', {}, { combustion: true });
probe('coding', {}, { coding: true });

console.log('\n=== Throttle sweep (healthy) ===');
[0, 25, 55, 67, 85, 100].forEach(t => probe(`throttle=${t}`, { throttle_pct: t }));
