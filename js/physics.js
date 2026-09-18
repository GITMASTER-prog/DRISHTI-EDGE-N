/**
 * DRISHTI GCS — Rotax 914 Engine Digital Twin Physics & Prognostic Engine
 * Strictly calibrated to Rotax 914 UL/F OEM Manual specifications and physical thermodynamic laws.
 */

const ROTAX = {
    // Propulsion Limits
    rpm_takeoff_max: 5800.0,            // Absolute max for 5 min takeoff
    rpm_cont_max: 5500.0,               // Max continuous RPM
    rpm_idle: 1600.0,                   // Nominal idle
    max_power_kw: 84.8,                 // 115 HP @ 5800 RPM (takeoff boost)
    max_cont_power_kw: 73.5,            // 100 HP @ 5500 RPM (continuous)
    max_torque_nm: 144.0,               // Max torque @ 4900 RPM
    displacement_l: 1.2112,             // 1211.2 cm³ displacement
    gear_ratio: 2.43,                   // Gearbox reduction ratio (i=2.43)
    compression_ratio: 9.0,             // 9.0:1

    // Thermal & Combustion Limits (OEM Strict)
    cht_max_c: 135.0,                   // 135 °C (275 °F) absolute max CHT
    cht_warn_c: 120.0,                  // 120 °C warning
    cht_normal_low_c: 80.0,             // 80 °C nominal lower limit
    cht_normal_high_c: 110.0,           // 110 °C nominal upper limit
    egt_max_c: 950.0,                   // 950 °C (1742 °F) absolute max EGT
    egt_warn_c: 850.0,                  // 850 °C warning
    egt_normal_low_c: 650.0,            // 650 °C cruise
    egt_normal_high_c: 800.0,           // 800 °C cruise upper

    // Lubrication Limits (OEM Strict)
    oil_temp_min_c: 50.0,               // 50 °C min before takeoff
    oil_temp_normal_low_c: 90.0,        // 90 °C normal operating
    oil_temp_normal_high_c: 110.0,      // 110 °C normal operating
    oil_temp_max_c: 130.0,              // 130 °C absolute max
    oil_pressure_normal_low_bar: 2.0,   // 2.0 bar min above 3500 RPM
    oil_pressure_normal_high_bar: 5.0,  // 5.0 bar max normal
    oil_pressure_min_low_rpm_bar: 0.8,  // 0.8 bar min at idle
    oil_pressure_max_bar: 7.0,          // 7.0 bar cold start / pressure relief

    // Turbocharger & Fuel Limits
    map_idle_inhg: 13.5,                // Idle manifold pressure
    map_cruise_inhg: 27.5,              // Cruise manifold pressure
    map_max_cont_inhg: 35.4,            // 115 kPa (35.4 inHg) continuous boost
    map_takeoff_inhg: 40.5,             // 135 kPa (40.5 inHg) 5 min takeoff boost
    tbo_h: 2000.0                       // 2,000 hours Time Between Overhauls
};

const DRISHTI_CONFIG = {
    cht_warn_c: ROTAX.cht_warn_c,
    egt_warn_c: ROTAX.egt_warn_c,
    oil_temp_warn_c: ROTAX.oil_temp_normal_high_c,
    vibration_warn_g: 1.89,
    map_warn_inhg: 35.4,
    map_takeoff_inhg: ROTAX.map_takeoff_inhg,
    power_warn_kw: ROTAX.max_cont_power_kw,
    anomaly_confirm: 0.85,
    anomaly_caution: 0.75
};

const MISSION_PRESETS = {
    "ISR Long-Endurance Cruise": { altitude_ft: 12000.0, delta_isa_c: 0.0, throttle_pct: 55.0, duration_h: 4.0, injection_deg: 24.5 },
    "High Altitude": { altitude_ft: 16000.0, delta_isa_c: 0.0, throttle_pct: 60.0, duration_h: 3.0, injection_deg: 25.0 },
    "Hot Weather (ISA Baseline)": { altitude_ft: 4000.0, delta_isa_c: 15.0, throttle_pct: 60.0, duration_h: 3.0, injection_deg: 24.0 },
    "Rapid Throttle Transitions": { altitude_ft: 6000.0, delta_isa_c: 0.0, throttle_pct: 75.0, duration_h: 2.0, injection_deg: 24.5 },
    "Endurance": { altitude_ft: 10000.0, delta_isa_c: 0.0, throttle_pct: 50.0, duration_h: 8.0, injection_deg: 24.5 }
};

const FLEET_DATABASE = {
    "UAV-01 (Primary Testbed)": { health: 93, baseHours: 342.5, state: "Active In-Flight", cht_bias: 0.0, egt_bias: 0.0, oilp_bias: 0.0, oiltemp_bias: 0.0, vib_mult: 1.00 },
    "UAV-02": { health: 89, baseHours: 512.0, state: "Standby / Ready", cht_bias: 2.0, egt_bias: 8.0, oilp_bias: -0.15, oiltemp_bias: 3.0, vib_mult: 1.06 },
    "UAV-03": { health: 68, baseHours: 1180.0, state: "Maintenance Depot", cht_bias: 6.0, egt_bias: 22.0, oilp_bias: -0.40, oiltemp_bias: 8.0, vib_mult: 1.18 },
    "UAV-04": { health: 38, baseHours: 1860.0, state: "Grounded / Overhaul", cht_bias: 14.0, egt_bias: 45.0, oilp_bias: -0.85, oiltemp_bias: 16.0, vib_mult: 1.45 },
    "UAV-05": { health: 96, baseHours: 120.4, state: "Standby / Ready", cht_bias: -1.0, egt_bias: -4.0, oilp_bias: 0.05, oiltemp_bias: -1.0, vib_mult: 0.98 }
};

/**
 * Canonical fleet roster metrics.
 * Both the Fleet Digital Twin panel and the cockpit summary cards read from
 * this single source so health / RUL / risk tier are identical everywhere.
 * RUL = (TBO remaining) x (health fraction), same formula the fleet table uses.
 */
function computeFleetMetrics(tail) {
    const u = FLEET_DATABASE[tail] || FLEET_DATABASE["UAV-01 (Primary Testbed)"];
    const health = (u.health !== undefined) ? u.health : 90;
    const tboRemaining = Math.max(0, ROTAX.tbo_h - u.baseHours);
    const rul = tboRemaining * (health / 100.0);

    let risk = "LOW";
    if (health < 50) risk = "CRITICAL";
    else if (health < 75) risk = "MEDIUM";

    return { health, rul, risk, state: u.state, baseHours: u.baseHours };
}

const CORRECTIVE_MEASURES = {
    misfire: "Switch Ignition Lanes (A/B) & Rebalance Fuel Rail",
    thermal: "Reduce Throttle & Open Auxiliary Cowl Flaps",
    mechanical: "Reduce RPM to Minimum Smooth & Inspect Mounts",
    sensor_drift: "Engage Redundant Sensor Voting & Re-zero Thermocouple",
    lubrication: "Activate Secondary Backup Oil Pump & Enrich Oil Cooler Bypass",
    combustion: "Adjust Air-Fuel Mixture Ratio / Wastegate Solenoid",
    coding: "Perform Soft FADEC ECU Cycle & Refresh Sensor Lookups"
};

const XAI_EXPLANATIONS = {
    misfire: "Irregular spark timing or fuel injector pulsation on cylinder #2 causing incomplete combustion and power fluctuations.",
    thermal: "Thermal saturation detected. Restricted radiator airflow or high ambient temp driving CHT beyond safe continuous band.",
    mechanical: "Excessive harmonic vibration detected. Possible propeller unbalance, gearbox backlash, or engine mount elastomeric fatigue.",
    sensor_drift: "Thermocouple junction impedance degradation resulting in false positive high CHT rate-of-climb bias.",
    lubrication: "Oil pressure drop combined with temperature spike indicates viscosity shear or scavenge filter restriction.",
    combustion: "Air-fuel oscillation and turbo wastegate hunting producing high cyclical EGT spikes.",
    coding: "FADEC ECU fuel map interpolation divergence during throttle ramp transitions."
};

function clamp(val, min = 0.0, max = 100.0) {
    return Math.max(min, Math.min(max, val));
}

/**
 * Mission progress as a 0-1 fraction. Lives next to clamp() because the
 * prognostics engine needs it before the telemetry frame exists (it is
 * derived purely from the frame's own clock fields).
 */
function missionElapsedFractionSafe(frame) {
    const total_h = Math.max(0.5, frame.mission_time_h || 4.0);
    const elapsed_h = Math.max(0.0, (frame.elapsed_sec || 0) / 3600.0);
    return Math.min(1.0, elapsed_h / total_h);
}

/**
 * Ornstein-Uhlenbeck style smoothed sensor noise.
 * Raw per-frame random jitter makes readouts flicker violently at high
 * throttle; a slowly-varying noise state keeps realism without strobing.
 */
const _noiseState = {};
function smoothNoise(key, amplitude) {
    const fresh = (Math.random() - 0.5) * 2.0 * amplitude;
    _noiseState[key] = ((_noiseState[key] || 0) * 0.92) + (fresh * 0.08);
    return _noiseState[key];
}

function interp(x, xArr, yArr) {
    if (x <= xArr[0]) return yArr[0];
    if (x >= xArr[xArr.length - 1]) return yArr[yArr.length - 1];
    for (let i = 0; i < xArr.length - 1; i++) {
        if (x >= xArr[i] && x <= xArr[i + 1]) {
            const frac = (x - xArr[i]) / (xArr[i + 1] - xArr[i]);
            return yArr[i] + frac * (yArr[i + 1] - yArr[i]);
        }
    }
    return yArr[0];
}

/**
 * Standard Atmosphere (ISA) Model
 * Implements barometric pressure ratio and temperature lapse rate (-6.5 °C / 1000m)
 */
function isaTemperatureC(altitude_ft) {
    const h_m = Math.min(Math.max(altitude_ft, 0), 25000) * 0.3048;
    return 15.0 - 6.5 * (h_m / 1000.0);
}

function isaPressureRatio(altitude_ft) {
    const h_m = Math.min(Math.max(altitude_ft, 0), 25000) * 0.3048;
    if (h_m <= 11000.0) {
        const T_isa = 288.15 - 0.0065 * h_m;
        return Math.pow(T_isa / 288.15, 5.25588);
    } else {
        const T11 = 216.65;
        const p11 = Math.pow(216.65 / 288.15, 5.25588);
        return p11 * Math.exp(-9.80665 * (h_m - 11000.0) / (287.05 * T11));
    }
}

/**
 * Aerodynamic & Thermodynamic Engine Operating Point
 */
function calculateEngineSurface(altitude_ft, throttle_pct, delta_isa_c = 0.0) {
    const alt = Math.min(Math.max(altitude_ft, 0), 25000);
    const th = Math.min(Math.max(throttle_pct, 0), 100);

    // Rotax 914 Throttle-to-Engine curves
    const xPoints = [0, 25, 55, 67, 85, 100];
    let rpm = interp(th, xPoints, [1800, 3200, 4300, 5000, 5500, 5800]);
    let power_kw = interp(th, xPoints, [8.0, 22.0, 40.4, 55.1, 73.5, 84.8]);
    let torque_nm = interp(th, xPoints, [35.0, 68.0, 92.0, 108.0, 132.0, 144.0]);
    let map_inhg = interp(th, xPoints, [13.5, 19.5, 26.4, 31.0, 35.4, 40.2]);

    const p_ratio = isaPressureRatio(alt);

    // Turbocharger TCU maintains manifold boost up to critical altitude (~15,000 ft)
    // Above 15,000 ft, turbo boost starts to roll off slightly
    const turboCritAlt = 15000.0;
    let altitude_factor = 1.0;
    if (alt > turboCritAlt) {
        altitude_factor = 1.0 - 0.12 * ((alt - turboCritAlt) / 10000.0);
    }

    map_inhg = Math.max(12.0, map_inhg * altitude_factor);
    power_kw = Math.max(6.0, power_kw * altitude_factor);
    torque_nm = Math.max(25.0, torque_nm * altitude_factor);

    const isa_t = isaTemperatureC(alt);
    const ambient_c = isa_t + delta_isa_c;

    return {
        rpm,
        power_kw,
        map_inhg,
        torque_nm,
        ambient_c,
        isa_t,
        altitude_ft: alt,
        throttle_pct: th,
        p_ratio
    };
}

/**
 * Generate Real-time Telemetry Frame
 * Strictly follows First Law of Thermodynamics and engine combustion physics.
 */
function generateTelemetryFrame(params) {
    const {
        altitude_ft = 10000,
        throttle_pct = 55,
        injection_timing_deg = 24.5,
        mission_time_h = 4.0,
        elapsed_sec = 1200,
        selected_uav = "UAV-01 (Primary Testbed)",
        faults = {},
        rectifications = {},
        noise_level = 0.012
    } = params;

    const surf = calculateEngineSurface(altitude_ft, throttle_pct, 0.0);
    const uavCfg = FLEET_DATABASE[selected_uav] || FLEET_DATABASE["UAV-01 (Primary Testbed)"];

    let rpm = surf.rpm;
    let map = surf.map_inhg;
    let power = surf.power_kw;
    let throttle = surf.throttle_pct;
    let altitude = surf.altitude_ft;
    let ambient = surf.ambient_c;

    // Atmospheric cooling: air density ratio reduces convective cooling coefficient
    const airDensityRatio = surf.p_ratio * (288.15 / (ambient + 273.15));
    const coolingDeficit = Math.max(0, 1.0 - airDensityRatio); // Thinner air cools less

    const throttle_load = Math.max(0, throttle - 40.0);
    const hot_load = Math.max(0, ambient - 20.0);

    // Physical Effect of Injection / Ignition Timing:
    // Nominal is 24.5° BTDC.
    // Advancing timing (>25°): higher peak pressure, higher CHT (+0.8°C/deg), lower EGT (-3.5°C/deg).
    // Retarding timing (<24°): late burn, EGT spikes (+4.5°C/deg), CHT drops (-0.5°C/deg), power drops.
    const timingDelta = injection_timing_deg - 24.5;
    const timingChtShift = timingDelta * 0.9;
    const timingEgtShift = -timingDelta * 5.2;
    const timingPowerFactor = 1.0 - (Math.abs(timingDelta) > 4.0 ? (Math.abs(timingDelta) - 4.0) * 0.02 : 0.0);
    power *= timingPowerFactor;

    // Baseline CHT (nominal band: 80 - 110 °C)
    let cht = 80.0 + 0.46 * throttle_load + 0.35 * hot_load + 14.0 * coolingDeficit + timingChtShift;

    // Baseline EGT (nominal band: 650 - 800 °C)
    let egt = 640.0 + 2.85 * throttle_load + 1.65 * hot_load + 20.0 * coolingDeficit + timingEgtShift;

    // Baseline Oil Temp (nominal band: 90 - 110 °C, min 50 °C)
    let oil_temp = 76.0 + 0.42 * throttle_load + 0.48 * hot_load + 10.0 * coolingDeficit;

    // Baseline Oil Pressure (Rotax 914 trochoid gear pump):
    // Minimum 0.8 bar at idle, 2.0 to 5.0 bar above 3500 RPM
    let oil_press;
    if (rpm > 3500) {
        oil_press = clamp(2.2 + (rpm - 3500.0) / 2000.0 * 2.6 - (oil_temp - 90.0) * 0.015, 1.8, 5.2);
    } else {
        oil_press = clamp(0.85 + (rpm / 3500.0) * 1.3, 0.7, 2.2);
    }

    // Fuel Flow (Liters per hour): Rotax 914 specific consumption BSFC ~ 285 g/(kW·h)
    // Fuel density ~ 0.72 kg/L
    let fuel_flow_lh = clamp((power * 0.285 / 0.72) * (1.0 + throttle_load * 0.003), 8.0, 42.0);

    // Vibration amplitude (mm/s): 2nd-order harmonics + prop imbalance
    let vibration = Math.max(0.4, 0.00022 * rpm + 0.004 * throttle_load);

    // Thermal Stress index (0 - 100)
    let thermal_stress = clamp(30.0 + 0.72 * throttle_load + 1.2 * hot_load + 35.0 * coolingDeficit + Math.max(0, timingDelta * 1.5), 0, 100);

    // Alternator & Bus Voltage (Rotax 250W internal generator + external 14V reg)
    let alternator_health = clamp(96.0 + 0.002 * Math.max(0, rpm - 2500.0) - (altitude / 20000.0 * 3.0));
    let bus_voltage = 14.1 - (100.0 - alternator_health) * 0.025;

    // Fuel quantity consumption %
    const missionElapsedFraction = Math.min(1.0, (elapsed_sec / 3600.0) / Math.max(0.5, mission_time_h));
    let fuel_qty = clamp(100.0 - missionElapsedFraction * 62.0 - (throttle_load * 0.18));

    // Apply fleet biases
    cht += uavCfg.cht_bias;
    egt += uavCfg.egt_bias;
    oil_press += uavCfg.oilp_bias;
    oil_temp += uavCfg.oiltemp_bias;
    vibration *= uavCfg.vib_mult;

    // Fault Injections (unless rectified by user)
    const activeFaultList = [];

    if (faults.misfire && !rectifications.misfire) {
        rpm *= 0.88;
        egt *= 0.91;
        power *= 0.82;
        vibration += 2.4;
        activeFaultList.push("misfire");
    }

    if (faults.thermal && !rectifications.thermal) {
        cht = Math.max(cht, 142.5);
        egt = Math.max(egt, 928.0);
        oil_temp = Math.max(oil_temp, 134.0);
        thermal_stress = Math.max(thermal_stress, 95.0);
        activeFaultList.push("thermal");
    }

    if (faults.mechanical && !rectifications.mechanical) {
        vibration = Math.max(vibration, 2.45);
        rpm += (Math.random() - 0.5) * 70;
        activeFaultList.push("mechanical");
    }

    if (faults.sensor_drift && !rectifications.sensor_drift) {
        // Signature matched to the trained MAP-Sensor-Drift class of the
        // DRISHTI telemetry dataset (+3.6 inHg ramp over ~30 min), so the
        // embedded ML classifier can actually detect this injection.
        const driftT = Math.min(1.0, elapsed_sec / 1800.0);
        map += 3.6 * driftT;
        const drift = 0.03 * (elapsed_sec / 60.0);
        cht += drift;
        activeFaultList.push("sensor_drift");
    }

    if (faults.lubrication && !rectifications.lubrication) {
        oil_press = Math.max(0.45, oil_press - 2.2);
        oil_temp = Math.max(oil_temp, 133.5);
        activeFaultList.push("lubrication");
    }

    if (faults.combustion && !rectifications.combustion) {
        const oscillation = 35.0 * Math.sin(Date.now() / 600.0);
        egt = Math.max(egt + oscillation, 895.0);
        rpm = Math.max(rpm, 5680.0);
        vibration += 1.4;
        activeFaultList.push("combustion");
    }

    if (faults.coding && !rectifications.coding) {
        rpm += 135.0;
        activeFaultList.push("coding");
    }

    // Realistic sensor noise — smoothed (see smoothNoise) so readouts drift
    // gently instead of strobing, especially near 80-100% throttle.
    rpm += rpm * smoothNoise('rpm', noise_level);
    map += map * smoothNoise('map', noise_level * 0.4);
    cht += cht * smoothNoise('cht', noise_level * 0.3);
    egt += egt * smoothNoise('egt', noise_level * 0.3);
    oil_press += oil_press * smoothNoise('oil_press', noise_level * 0.3);
    oil_temp += oil_temp * smoothNoise('oil_temp', noise_level * 0.3);
    fuel_flow_lh += fuel_flow_lh * smoothNoise('fuel_flow', noise_level * 0.4);
    vibration += vibration * smoothNoise('vibration', noise_level);

    return {
        rpm: Math.max(0, rpm),
        map: Math.max(0, map),
        cht: Math.max(0, cht),
        egt: Math.max(0, egt),
        oil_press: Math.max(0, oil_press),
        oil_temp: Math.max(0, oil_temp),
        fuel_flow_lh: Math.max(0, fuel_flow_lh),
        vibration: Math.max(0, vibration),
        power_kw: Math.max(0, power),
        bus_voltage: Math.max(0, bus_voltage),
        alternator_health: clamp(alternator_health),
        fuel_qty: clamp(fuel_qty),
        thermal_stress: clamp(thermal_stress),
        injection_timing: injection_timing_deg,
        altitude_ft: altitude,
        throttle_pct: throttle,
        ambient_c: ambient,
        activeFaultList,
        elapsed_sec,
        mission_time_h
    };
}

/**
 * Evaluate Exceedances strictly against Rotax 914 OEM Limits
 */
function evaluateFaultExceedances(frame) {
    const list = [];

    // CHT: Max 135°C, Warn 120°C
    if (frame.cht > ROTAX.cht_max_c) {
        list.push({ name: "High CHT Overheat Exceedance", severity: "CRITICAL", value: frame.cht, limit: ROTAX.cht_max_c, source: "CHT", sub: "Thermal" });
    } else if (frame.cht > ROTAX.cht_warn_c) {
        list.push({ name: "Elevated CHT Warning", severity: "WARNING", value: frame.cht, limit: ROTAX.cht_warn_c, source: "CHT", sub: "Thermal" });
    }

    // EGT: Max 950°C, Warn 850°C
    if (frame.egt > ROTAX.egt_max_c) {
        list.push({ name: "Exhaust Gas Temp Critical", severity: "CRITICAL", value: frame.egt, limit: ROTAX.egt_max_c, source: "EGT", sub: "Combustion" });
    } else if (frame.egt > ROTAX.egt_warn_c) {
        list.push({ name: "Elevated EGT Warning", severity: "WARNING", value: frame.egt, limit: ROTAX.egt_warn_c, source: "EGT", sub: "Combustion" });
    }

    // Oil Temp: Max 130°C, Normal band 90-110°C
    if (frame.oil_temp > ROTAX.oil_temp_max_c) {
        list.push({ name: "Oil Temperature Critical", severity: "CRITICAL", value: frame.oil_temp, limit: ROTAX.oil_temp_max_c, source: "Oil Temp", sub: "Lubrication" });
    } else if (frame.oil_temp > ROTAX.oil_temp_normal_high_c) {
        list.push({ name: "Oil Temp Above Normal Band", severity: "WARNING", value: frame.oil_temp, limit: ROTAX.oil_temp_normal_high_c, source: "Oil Temp", sub: "Lubrication" });
    }

    // Oil Pressure: 2.0 to 5.0 bar
    if (frame.rpm > 3500) {
        if (frame.oil_press < ROTAX.oil_pressure_normal_low_bar) {
            list.push({ name: "Low Oil Pressure (< 2.0 bar)", severity: "CRITICAL", value: frame.oil_press, limit: ROTAX.oil_pressure_normal_low_bar, source: "Oil Pressure", sub: "Lubrication" });
        } else if (frame.oil_press > ROTAX.oil_pressure_max_bar) {
            list.push({ name: "High Oil Pressure (> 7.0 bar)", severity: "CRITICAL", value: frame.oil_press, limit: ROTAX.oil_pressure_max_bar, source: "Oil Pressure", sub: "Lubrication" });
        }
    } else {
        if (frame.oil_press < ROTAX.oil_pressure_min_low_rpm_bar) {
            list.push({ name: "Critically Low Idle Oil Pressure", severity: "CRITICAL", value: frame.oil_press, limit: ROTAX.oil_pressure_min_low_rpm_bar, source: "Oil Pressure", sub: "Lubrication" });
        }
    }

    // RPM: Takeoff Max 5800, Continuous Max 5500.
    // Dead-band: at full throttle the engine surface sits exactly AT the 5800
    // takeoff limit, so +/- sensor noise straddles the line and strobes the
    // annunciator between MASTER WARNING and CAUTION. Only treat RPM as
    // CRITICAL once it clears the limit by the noise band (+60 RPM); genuine
    // over-speeds (e.g. combustion/coding fault injection) still latch it.
    const RPM_CRITICAL_DEADBAND = 60.0;
    if (frame.rpm > ROTAX.rpm_takeoff_max + RPM_CRITICAL_DEADBAND) {
        list.push({ name: "RPM Above Absolute Limit (5800)", severity: "CRITICAL", value: frame.rpm, limit: ROTAX.rpm_takeoff_max, source: "RPM", sub: "Propulsion" });
    } else if (frame.rpm > ROTAX.rpm_cont_max) {
        list.push({ name: "RPM Exceeds Max Continuous (5500)", severity: "WARNING", value: frame.rpm, limit: ROTAX.rpm_cont_max, source: "RPM", sub: "Propulsion" });
    }

    // Vibration: Warning > 1.89 g
    if (frame.vibration > DRISHTI_CONFIG.vibration_warn_g) {
        list.push({ name: "Excessive Engine Vibration", severity: "WARNING", value: frame.vibration, limit: DRISHTI_CONFIG.vibration_warn_g, source: "Vibration", sub: "Mechanical" });
    }

    return list;
}

/**
 * Subsystem Health Scores (0 - 100%)
 */
function calculateSubsystemsHealth(frame, faultCount) {
    function score(val, nominal, limit) {
        if (val <= nominal) return 100.0;
        if (val >= limit) return 0.0;
        return 100.0 * (limit - val) / (limit - nominal);
    }

    const thermal = clamp(Math.min(
        score(frame.cht, 105.0, ROTAX.cht_max_c),
        score(frame.thermal_stress, 60.0, 100.0)
    ));

    const lube = clamp(Math.min(
        frame.oil_press < 2.0 ? (frame.oil_press / 2.0) * 100.0 : 100.0,
        score(frame.oil_temp, 105.0, ROTAX.oil_temp_max_c)
    ));

    const fuel = clamp(score(frame.fuel_flow_lh, 36.0, 46.0));
    const ignition = clamp(frame.activeFaultList.includes("misfire") ? 55.0 : 96.0);
    const mechanical = clamp(score(frame.vibration, 1.2, 3.2));
    const electrical = clamp(Math.min((frame.bus_voltage - 11.0) / 3.2 * 100.0, frame.alternator_health));

    const weights = { thermal: 0.28, lube: 0.24, fuel: 0.16, ignition: 0.14, mechanical: 0.12, electrical: 0.06 };
    let overall = (
        thermal * weights.thermal +
        lube * weights.lube +
        fuel * weights.fuel +
        ignition * weights.ignition +
        mechanical * weights.mechanical +
        electrical * weights.electrical
    );

    const stressPenalty = (frame.throttle_pct / 100.0) * 2.0 + (faultCount * 3.5);
    overall = clamp(overall - stressPenalty);

    return {
        thermal: Math.round(thermal),
        lubrication: Math.round(lube),
        fuel: Math.round(fuel),
        ignition: Math.round(ignition),
        mechanical: Math.round(mechanical),
        electrical: Math.round(electrical),
        overall: Math.round(overall)
    };
}

/**
 * Degradation, RUL & Mission Feasibility Prognostics
 *
 * `health` is the LIVE subsystem health index (calculateSubsystemsHealth),
 * so injected faults immediately depress it — the same value the Subsystem
 * Health panel displays. The static fleet-TBO figure is deliberately NOT used
 * for completion probability: a 1500-hour RUL margin against a 4 h mission
 * saturates the ratio and pins the metric at 100% no matter what is failing.
 */
function calculatePrognostics(frame, health, faultCount, activeSimCount, externalRulH = null, airframeHealth = null) {
    const isFaulted = faultCount > 0 || activeSimCount > 0;
    let baseRate = isFaulted ? 0.085 : 0.032;
    let throttleFac = 0.04 * Math.pow(frame.throttle_pct / 100.0, 2);
    let altFac = 0.015 * (frame.altitude_ft / 16000.0);
    let faultFac = 0.18 * faultCount;

    const degradationRate = Math.max(0.01, baseRate + throttleFac + altFac + faultFac);
    const safeRate = Math.max(0.001, degradationRate);

    // RUL in hours. When the fleet metrics supply the airframe's own
    // TBO-remaining figure it is used directly so the dashboard and the
    // Fleet Digital Twin panel always report the identical RUL value.
    // (Confidence is now owned by the master mission state — see below.)
    let rul_h = (externalRulH !== null && externalRulH !== undefined)
        ? Math.max(0.5, externalRulH)
        : Math.max(0.5, health / (safeRate * 25.0));

    const missionTotal_h = frame.mission_time_h || 4.0;
    const missionElapsed_h = (frame.elapsed_sec || 0) / 3600.0;
    const remainingMission_h = Math.max(0.0, missionTotal_h - missionElapsed_h);
    const margin_h = rul_h - remainingMission_h;

    // ---- Mission Completion Probability % (1 to 100) ----
    // Three factors, each bounded so no single one can saturate the metric:
    //   1. Endurance adequacy: fuel remaining vs fuel still required (+reserve).
    //      Stays at 1.0 whenever the tank comfortably covers the remaining
    //      mission; only a genuine fuel emergency drags it down.
    //   2. Live engine condition: the subsystem health index itself (drops the
    //      instant any fault is injected — thermal/lube/ignition penalties).
    //   3. Exposure: the longer the mission still has to run, the more time
    //      the CURRENT degradation rate has to fail the engine. Normalised so
    //      a nominal cruise degradation rate (~0.05/h) costs nothing; only
    //      fault-elevated rates are penalised.
    const RESERVE_PCT = 15.0;              // Final-reserve fuel (% of tank)
    const BURN_PER_FRACTION = 62.0;        // Matches the telemetry fuel model
    const fuelNeededToFinish = BURN_PER_FRACTION * (1.0 - missionElapsedFractionSafe(frame));
    const enduranceFactor = clamp(frame.fuel_qty / Math.max(1.0, fuelNeededToFinish + RESERVE_PCT), 0.0, 1.0);

    const NOMINAL_DEGRADATION_RATE = 0.10; // healthy cruise baseline
    const exposureFactor = Math.exp(
        -Math.max(0.0, safeRate - NOMINAL_DEGRADATION_RATE) * remainingMission_h * 0.25
    );

    let baseComp = 102.0 * enduranceFactor * (0.55 + 0.45 * (health / 100.0)) * exposureFactor;

    // Hard penalties: every UNMITIGATED injected fault costs a full tier,
    // on top of the condition factor that is already reacting to it.
    const unmitigated = Math.max(faultCount, activeSimCount);
    baseComp -= unmitigated * 8.0;
    if (margin_h < 0) baseComp -= Math.min(30.0, Math.abs(margin_h) * 7.0);

    const completionPct = Math.round(clamp(baseComp, 5.0, 100.0));

    // ---- Airframe inherent condition (Fleet Digital Twin coupling) ----
    // The master state must reflect WHO is flying, not only how the engine
    // behaves this second. A CRITICAL / grounded airframe (UAV-04, 38% fleet
    // health) can never present a NOMINAL 100%-completion mission just
    // because its cruise parameters happen to sit inside OEM limits.
    // The completion probability is therefore capped at the airframe's own
    // fleet health + 2, which maps the fleet roster onto the mission ladder:
    //   UAV-01 93 -> cap 95 NOMINAL      UAV-03 68 -> cap 70 CAUTION
    //   UAV-02 89 -> cap 91 NOMINAL      UAV-04 38 -> cap 40 HIGH RISK
    //   UAV-05 96 -> cap 98 NOMINAL
    // Live faults can still push completion BELOW the cap, never above it.
    const hasAirframeCondition = (airframeHealth !== null && airframeHealth !== undefined);
    const effectiveCompletion = hasAirframeCondition
        ? Math.round(Math.min(completionPct, clamp(airframeHealth + 2.0, 5.0, 100.0)))
        : completionPct;

    // ---- MASTER MISSION STATE (single source of truth) ----
    // One state, derived from completion probability (plus hard overrides for
    // fuel exhaustion / negative time margin), drives EVERY downstream
    // indicator through MISSION_STATE_TABLE: the advisory, the feasibility
    // gauge value + segment label, the RUL confidence and the completion
    // card tier. The four can therefore never disagree again.
    let missionState;
    if (effectiveCompletion < 17 || margin_h < -2.0 || frame.fuel_qty < RESERVE_PCT) missionState = "DIVERT / EMERGENCY";
    else if (effectiveCompletion < 42 || faultCount >= 3 || margin_h < 0) missionState = "HIGH RISK";
    else if (effectiveCompletion < 72 || faultCount > 0) missionState = "CAUTION";
    else missionState = "NOMINAL";

    const stateRow = MISSION_STATE_TABLE[missionState];
    const riskTier = stateRow.completionTierLabel;
    const advisory = stateRow.advisory;
    const advisoryDetail = stateRow.advisoryDetail;
    const rul_confidence = stateRow.rulConfidence;
    const feasibilityTargetPct = stateRow.feasibilityPct;
    const feasibilitySegmentLabel = stateRow.segmentLabel;

    return {
        degradationRate,
        rul_h: Math.round(rul_h * 10) / 10,
        rul_confidence,
        remainingMission_h: Math.round(remainingMission_h * 100) / 100,
        missionTotal_h: Math.round(missionTotal_h * 100) / 100,
        margin_h: Math.round(margin_h * 10) / 10,
        completionPct: effectiveCompletion,
        missionState,
        riskTier,
        advisory,
        advisoryDetail,
        feasibilityTargetPct,
        feasibilitySegmentLabel
    };
}

/**
 * Correct Status State Table (per user specification).
 * One master mission state fixes the value of EVERY dashboard indicator, so
 * the completion card, the RUL confidence, the feasibility gauge and the
 * advisory banner always tell the same story.
 * Feasibility gauge values anchor to the gauge segment bands
 * (NOMINAL 84-94 OPTIMAL / CAUTION 52-66 / HIGH RISK 34-49 / CRITICAL 5-16)
 * so a healthy aircraft (completion 100%, conf 90%) reads OPTIMAL ~90 on the
 * gauge — never a contradictory mid-scale number.
 */
const MISSION_STATE_TABLE = {
    "NOMINAL": {
        advisory: "CONTINUE MISSION",
        advisoryDetail: "All propulsion parameters within nominal operational limits.",
        feasibilityPct: 88,          // OPTIMAL — consistent with completion 100% / conf 90%
        feasMin: 84, feasMax: 94,    // stays inside the painted OPTIMAL band (>= 83)
        segmentLabel: "OPTIMAL",
        rulConfidence: 90,
        completionTierLabel: "HIGH"
    },
    "CAUTION": {
        advisory: "CONTINUE WITH CAUTION",
        advisoryDetail: "Monitor engine parameters closely. Reduce throttle to optimize cooling.",
        feasibilityPct: 60,          // CAUTION
        feasMin: 52, feasMax: 66,
        segmentLabel: "CAUTION",
        rulConfidence: 70,
        completionTierLabel: "MODERATE"
    },
    "HIGH RISK": {
        advisory: "CONTINUE WITH CAUTION",
        advisoryDetail: "Sustained degradation detected. Prepare contingency divert and reduce engine load.",
        feasibilityPct: 35,          // HIGH RISK
        feasMin: 34, feasMax: 49,    // never leaks up into MODERATE
        segmentLabel: "HIGH RISK",
        rulConfidence: 50,
        completionTierLabel: "LOW"
    },
    "DIVERT / EMERGENCY": {
        advisory: "DIVERT / EMERGENCY RECOVERY",
        advisoryDetail: "Immediate engine load reduction required. Divert to nearest suitable airfield.",
        feasibilityPct: 10,          // CRITICAL
        feasMin: 5, feasMax: 16,     // never leaks up into HIGH RISK
        segmentLabel: "CRITICAL",
        rulConfidence: 25,
        completionTierLabel: "CRITICAL"
    }
};

/**
 * Mission Feasibility & Risk Score (drives the 6-segment speedometer).
 * Unlike the completion-probability metric (which saturates near 100% on a
 * healthy fleet airframe), this scores the LIVE engine state against OEM
 * margins so the needle genuinely responds to throttle, faults and environment:
 *   - thermal / EGT / oil temp / oil pressure / vibration proximity to limits
 *   - RPM above the 5500 continuous band (takeoff rating is a limited resource)
 *   - injected fault count and negative mission time margin
 * The segment breakpoints (17/33/50/67/83%) match the gauge artwork.
 */
function computeMissionFeasibility(frame, subs, activeFaults, activeSimCount, prognostics) {
    // The master mission state (from the Correct Status State Table) owns the
    // gauge: value and segment label come straight from prognostics so the
    // feasibility readout always matches the completion probability, the RUL
    // confidence and the advisory. The engine-margin scoring below only
    // fine-tunes WITHIN the state's segment (+/- half a segment) — it can
    // never move the needle across a state boundary anymore.
    if (prognostics && typeof prognostics.missionState === 'string') {
        const row = MISSION_STATE_TABLE[prognostics.missionState];
        // Live engine-margin trim: healthy margins (raw≈0) push the gauge UP
        // within its segment; margins near/over limits pull it DOWN. Sign is
        // deliberately inverted so a clean engine never reads below its anchor.
        const rawTrim = liveEngineMarginPenalty(frame, subs);
        const trim = (0.5 - rawTrim) * 8.0;   // +4 (clean) .. -4 (at limits)
        return {
            feasibilityPct: Math.round(clamp(row.feasibilityPct + trim, row.feasMin, row.feasMax)),
            riskLabel: row.segmentLabel,
            missionState: prognostics.missionState
        };
    }

    // Per-domain penalty scores (0 = perfectly nominal, 100 = at/over the limit)
    const thermalPen = Math.min(100, Math.max(0, (frame.cht - 110.0) / (ROTAX.cht_max_c - 110.0) * 100.0));
    const egtPen     = Math.min(100, Math.max(0, (frame.egt - ROTAX.egt_warn_c) / (ROTAX.egt_max_c - ROTAX.egt_warn_c) * 100.0));
    const oilTempPen = Math.min(100, Math.max(0, (frame.oil_temp - ROTAX.oil_temp_normal_high_c) / (ROTAX.oil_temp_max_c - ROTAX.oil_temp_normal_high_c) * 100.0));
    const oilPressPen = frame.rpm > 3500
        ? Math.min(100, Math.max(0, (ROTAX.oil_pressure_normal_low_bar - frame.oil_press) / ROTAX.oil_pressure_normal_low_bar * 100.0))
        : 0.0;
    const vibPen     = Math.min(100, Math.max(0, (frame.vibration - DRISHTI_CONFIG.vibration_warn_g) / (3.2 - DRISHTI_CONFIG.vibration_warn_g) * 100.0));
    // RPM: continuous exceedance costs up to 40 pts, absolute-limit exceedance the rest
    const rpmPen     = Math.min(100,
        Math.max(0, (frame.rpm - ROTAX.rpm_cont_max) / (ROTAX.rpm_takeoff_max - ROTAX.rpm_cont_max)) * 40.0 +
        Math.max(0, (frame.rpm - ROTAX.rpm_takeoff_max) / 100.0) * 60.0);

    const weighted =
        thermalPen * 0.25 +
        egtPen * 0.20 +
        oilTempPen * 0.15 +
        oilPressPen * 0.15 +
        vibPen * 0.15 +
        rpmPen * 0.10;

    // Each injected (unmitigated) fault costs 8 pts; negative mission margin up to 15
    const faultPenalty = Math.min(40.0, activeSimCount * 8.0);
    const marginPenalty = prognostics && prognostics.margin_h < 0
        ? Math.min(15.0, Math.abs(prognostics.margin_h) * 5.0)
        : 0.0;

    const feasibilityPct = Math.round(clamp(100.0 - weighted - faultPenalty - marginPenalty));

    // Segment-matched risk label
    let riskLabel;
    if (feasibilityPct >= 83) riskLabel = "OPTIMAL";
    else if (feasibilityPct >= 67) riskLabel = "GOOD";
    else if (feasibilityPct >= 50) riskLabel = "CAUTION";
    else if (feasibilityPct >= 33) riskLabel = "MODERATE";
    else if (feasibilityPct >= 17) riskLabel = "HIGH RISK";
    else riskLabel = "CRITICAL";

    return { feasibilityPct, riskLabel };
}

/**
 * Normalised live engine-margin penalty (0..1) — extracts the weighted
 * exceedance scoring from computeMissionFeasibility so the state-table
 * trim and the legacy fallback share one definition.
 */
function liveEngineMarginPenalty(frame, subs) {
    const thermalPen = Math.min(100, Math.max(0, (frame.cht - 110.0) / (ROTAX.cht_max_c - 110.0) * 100.0));
    const egtPen     = Math.min(100, Math.max(0, (frame.egt - ROTAX.egt_warn_c) / (ROTAX.egt_max_c - ROTAX.egt_warn_c) * 100.0));
    const oilTempPen = Math.min(100, Math.max(0, (frame.oil_temp - ROTAX.oil_temp_normal_high_c) / (ROTAX.oil_temp_max_c - ROTAX.oil_temp_normal_high_c) * 100.0));
    const oilPressPen = frame.rpm > 3500
        ? Math.min(100, Math.max(0, (ROTAX.oil_pressure_normal_low_bar - frame.oil_press) / ROTAX.oil_pressure_normal_low_bar * 100.0))
        : 0.0;
    const vibPen     = Math.min(100, Math.max(0, (frame.vibration - DRISHTI_CONFIG.vibration_warn_g) / (3.2 - DRISHTI_CONFIG.vibration_warn_g) * 100.0));
    const rpmPen     = Math.min(100,
        Math.max(0, (frame.rpm - ROTAX.rpm_cont_max) / (ROTAX.rpm_takeoff_max - ROTAX.rpm_cont_max)) * 40.0 +
        Math.max(0, (frame.rpm - ROTAX.rpm_takeoff_max) / 100.0) * 60.0);

    const weighted =
        thermalPen * 0.25 +
        egtPen * 0.20 +
        oilTempPen * 0.15 +
        oilPressPen * 0.15 +
        vibPen * 0.15 +
        rpmPen * 0.10;

    return clamp(weighted / 100.0, 0.0, 1.0);
}

/**
 * XAI Risk Attribution (SHAP-style dynamic weights)
 */
function calculateXAIRiskContributors(frame, faults) {
    const rawContributions = [
        { param: "CHT", influence: 0.12 + Math.max(0, (frame.cht - 90) / 140.0 * 0.4), why: "High thermal load", action: "Reduce throttle / manage cowl cooling" },
        { param: "EGT", influence: 0.10 + Math.max(0, (frame.egt - 700) / 950.0 * 0.35), why: "Lean combustion / power surge", action: "Enrich mixture / reduce MAP" },
        { param: "Oil Temp", influence: 0.08 + Math.max(0, (frame.oil_temp - 95) / 130.0 * 0.3), why: "Lubrication shear stress", action: "Check cooling / reduce sustained load" },
        { param: "Vibration", influence: 0.06 + Math.max(0, (frame.vibration - 1.2) / 3.0 * 0.35), why: "Mechanical / harmonic imbalance", action: "Inspect engine mounts & propeller" },
        { param: "MAP", influence: 0.05 + Math.max(0, (frame.map - 26) / 35.0 * 0.15), why: "Engine manifold pressure load", action: "Optimize cruising altitude / throttle" },
        { param: "Oil Press", influence: 0.04 + (frame.oil_press < 2.0 ? 0.3 : 0.0), why: "Hydraulic lubrication safety", action: "Verify oil level / secondary pump" }
    ];

    const sum = rawContributions.reduce((acc, c) => acc + c.influence, 0);
    return rawContributions.map(c => ({
        ...c,
        influence: Math.round((c.influence / sum) * 100) / 100
    })).sort((a, b) => b.influence - a.influence);
}
