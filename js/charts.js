/**
 * DRISHTI GCS — Interactive Visualizations & Canvas Graphics
 * Includes:
 * 1. 6-Segment Speedometer Risk Gauge matching user reference image
 * 2. Real-time Multi-channel Telemetry Stream Strip-Chart
 * 3. Mission Replay Flight Trajectory Scrubbing Chart
 * 4. Synthetic Vision 3D Flight Corridor
 * 5. Cross-Fleet Health Comparison Chart
 * 6. Prognostic Fault & Thermal Stress Curve
 */

/**
 * 6-Segment Semi-Circular Speedometer Gauge matching media_1788777398956.jpg
 */
class RadialRiskGauge {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.value = 78;
        this.targetValue = 78;
        this.riskLabel = "HIGH RISK";

        // 6 Segments configuration (Red -> Orange -> Amber -> Yellow -> Light Green -> Green)
        this.segments = [
            { label: "CRITICAL", pctLabel: "17%", color: "#ef4444", innerColor: "#f87171" },
            { label: "HIGH RISK", pctLabel: "33%", color: "#f97316", innerColor: "#fb923c" },
            { label: "MODERATE", pctLabel: "50%", color: "#f59e0b", innerColor: "#fbbf24" },
            { label: "CAUTION", pctLabel: "67%", color: "#eab308", innerColor: "#facc15" },
            { label: "GOOD", pctLabel: "83%", color: "#84cc16", innerColor: "#a3e635" },
            { label: "OPTIMAL", pctLabel: "100%", color: "#22c55e", innerColor: "#4ade80" }
        ];

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.width = rect.width || 260;
        this.height = rect.height || 140;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        this.draw();
    }

    setValue(val, label) {
        this.targetValue = Math.max(0, Math.min(100, val));
        if (label) this.riskLabel = label;
    }

    update() {
        this.value += (this.targetValue - this.value) * 0.15;
        this.draw();
    }

    draw() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const cx = w / 2;
        const cy = h - 18;

        const outerRadius = Math.min(cx - 10, cy - 8);
        const midRadius = outerRadius * 0.72;
        const innerRadius = outerRadius * 0.44;

        ctx.clearRect(0, 0, w, h);

        // Soft base shadow
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy + 6, outerRadius * 0.95, 8, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.filter = 'blur(4px)';
        ctx.fill();
        ctx.restore();

        const numSegs = this.segments.length;
        const totalAngle = Math.PI; // 180 degrees
        const gap = 0.035; // Gap between segments in radians
        const segAngle = (totalAngle - (numSegs - 1) * gap) / numSegs;

        // Draw each of the 6 distinct curved wedge segments
        for (let i = 0; i < numSegs; i++) {
            const seg = this.segments[i];
            const aStart = Math.PI + i * (segAngle + gap);
            const aEnd = aStart + segAngle;
            const aMid = (aStart + aEnd) / 2;

            // 1. Outer Arc Segment
            ctx.beginPath();
            ctx.arc(cx, cy, outerRadius, aStart, aEnd, false);
            ctx.arc(cx, cy, midRadius, aEnd, aStart, true);
            ctx.closePath();
            ctx.fillStyle = seg.color;
            ctx.fill();

            // Outer segment text (Status Category)
            ctx.save();
            const textR1 = (outerRadius + midRadius) / 2;
            const tx1 = cx + textR1 * Math.cos(aMid);
            const ty1 = cy + textR1 * Math.sin(aMid);
            ctx.translate(tx1, ty1);
            ctx.rotate(aMid + Math.PI / 2);
            ctx.font = '700 7.5px "Inter", sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(seg.label, 0, 0);
            ctx.restore();

            // Dotted dividing line between outer and inner arc
            ctx.beginPath();
            ctx.arc(cx, cy, midRadius, aStart, aEnd, false);
            ctx.setLineDash([2, 3]);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]);

            // 2. Inner Arc Segment (Lighter tint)
            ctx.beginPath();
            ctx.arc(cx, cy, midRadius, aStart, aEnd, false);
            ctx.arc(cx, cy, innerRadius, aEnd, aStart, true);
            ctx.closePath();
            ctx.fillStyle = seg.innerColor;
            ctx.fill();

            // Inner segment text (Percentage milestone e.g. 17%, 33%, etc.)
            ctx.save();
            const textR2 = (midRadius + innerRadius) / 2;
            const tx2 = cx + textR2 * Math.cos(aMid);
            const ty2 = cy + textR2 * Math.sin(aMid);
            ctx.translate(tx2, ty2);
            ctx.rotate(aMid + Math.PI / 2);
            ctx.font = '800 9.5px "Share Tech Mono", monospace';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(seg.pctLabel, 0, 0);
            ctx.restore();
        }

        // Calculate needle angle based on continuous completion percentage (0 - 100%)
        const needlePct = Math.max(0, Math.min(100, this.value)) / 100.0;
        const needleAngle = Math.PI + needlePct * Math.PI;

        // Needle Shadow
        ctx.save();
        ctx.translate(cx + 3, cy + 3);
        ctx.rotate(needleAngle);
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.lineTo(0, -3);
        ctx.lineTo(outerRadius - 6, 0);
        ctx.lineTo(0, 3);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fill();
        ctx.restore();

        // Needle (Silver / metallic tapered pointer matching reference image)
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(needleAngle);

        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.lineTo(0, -2.5);
        ctx.lineTo(outerRadius - 8, 0);
        ctx.lineTo(0, 2.5);
        ctx.closePath();

        const needleGrad = ctx.createLinearGradient(0, -2.5, 0, 2.5);
        needleGrad.addColorStop(0, '#ffffff');
        needleGrad.addColorStop(0.5, '#e2e8f0');
        needleGrad.addColorStop(1, '#94a3b8');
        ctx.fillStyle = needleGrad;
        ctx.fill();

        ctx.restore();

        // Center Pivot Hub (Dark metallic circle with silver outer ring matching image)
        ctx.beginPath();
        ctx.arc(cx, cy, 11, 0, Math.PI * 2);
        const hubGrad = ctx.createRadialGradient(cx - 2, cy - 2, 2, cx, cy, 11);
        hubGrad.addColorStop(0, '#64748b');
        hubGrad.addColorStop(0.5, '#1e293b');
        hubGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = hubGrad;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#e2e8f0';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();

        // Bottom Value Labels
        ctx.font = '800 12px "Inter", sans-serif';
        ctx.fillStyle = this.value >= 70 ? '#4ade80' : (this.value >= 45 ? '#f59e0b' : '#ef4444');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`FEASIBILITY: ${Math.round(this.value)}%`, cx, cy + 4);
    }
}

/**
 * Live Multi-Channel Scrolling Strip-Chart
 * Real-time oscilloscope plotting RPM, CHT, EGT, and Vibration over a rolling 60-second window.
 */
class LiveTelemetryChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.maxPoints = 80;
        this.buffer = [];

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.width = rect.width || 480;
        this.height = rect.height || 160;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        this.draw();
    }

    pushSample(sample) {
        this.buffer.push(sample);
        if (this.buffer.length > this.maxPoints) {
            this.buffer.shift();
        }
        this.draw();
    }

    draw() {
        if (!this.ctx || this.buffer.length < 2) return;
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const padL = 40;
        const padR = 15;
        const padT = 20;
        const padB = 25;
        const pw = w - padL - padR;
        const ph = h - padT - padB;

        ctx.clearRect(0, 0, w, h);

        // Chart Background & Grid
        ctx.fillStyle = '#060a10';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = '#151d2a';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padT + (i / 4) * ph;
            ctx.beginPath();
            ctx.moveTo(padL, y);
            ctx.lineTo(w - padR, y);
            ctx.stroke();

            const labelVal = Math.round(100 - i * 25);
            ctx.font = '500 8.5px "Share Tech Mono", monospace';
            ctx.fillStyle = '#64748b';
            ctx.textAlign = 'right';
            ctx.fillText(`${labelVal}%`, padL - 6, y + 3);
        }

        // Legend
        ctx.font = '700 9px "Inter", sans-serif';
        const legends = [
            { label: "RPM", color: "#38bdf8" },
            { label: "CHT", color: "#f59e0b" },
            { label: "EGT", color: "#ef4444" },
            { label: "VIB", color: "#a855f7" }
        ];
        let lx = padL + 10;
        legends.forEach(lg => {
            ctx.fillStyle = lg.color;
            ctx.fillRect(lx, 6, 8, 8);
            ctx.fillStyle = '#cbd5e1';
            ctx.textAlign = 'left';
            ctx.fillText(lg.label, lx + 12, 13);
            lx += 55;
        });

        const len = this.buffer.length;
        const getX = (idx) => padL + (idx / (this.maxPoints - 1)) * pw;

        // Trace Helper (normalized 0 to 100%)
        const drawTrace = (getter, color) => {
            ctx.beginPath();
            for (let i = 0; i < len; i++) {
                const normVal = clamp(getter(this.buffer[i]));
                const x = getX(i);
                const y = padT + (1.0 - normVal / 100.0) * ph;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.8;
            ctx.stroke();
        };

        // 1. RPM (0 to 6000 RPM mapped to 0-100%)
        drawTrace(d => (d.rpm / 6000.0) * 100.0, "#38bdf8");

        // 2. CHT (50 to 150 °C mapped to 0-100%)
        drawTrace(d => ((d.cht - 50.0) / 100.0) * 100.0, "#f59e0b");

        // 3. EGT (400 to 1000 °C mapped to 0-100%)
        drawTrace(d => ((d.egt - 400.0) / 600.0) * 100.0, "#ef4444");

        // 4. Vibration (0 to 3.5 g mapped to 0-100%)
        drawTrace(d => (d.vibration / 3.5) * 100.0, "#a855f7");

        // X-axis label
        ctx.font = '500 8.5px "Share Tech Mono", monospace';
        ctx.fillStyle = '#475569';
        ctx.textAlign = 'center';
        ctx.fillText("LIVE ROLLING BUFFER (LAST 60 SECONDS)", padL + pw / 2, h - 8);
    }
}

/**
 * 3D Synthetic Vision / Flight Corridor Renderer
 */
class SyntheticVisionCorridor {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.offset = 0;
        this.altitude = 10000;
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.width = rect.width || 340;
        this.height = rect.height || 160;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        this.draw();
    }

    update(alt, th) {
        this.altitude = alt || 10000;
        this.offset = (this.offset + 2.5) % 45;
        this.draw();
    }

    draw() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const cx = w / 2;
        const cy = h / 2;

        ctx.clearRect(0, 0, w, h);

        // Sky & Ground gradient
        const skyGrad = ctx.createLinearGradient(0, 0, 0, cy);
        skyGrad.addColorStop(0, '#040812');
        skyGrad.addColorStop(1, '#091527');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, cy);

        const groundGrad = ctx.createLinearGradient(0, cy, 0, h);
        groundGrad.addColorStop(0, '#09120e');
        groundGrad.addColorStop(1, '#030805');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, cy, w, h - cy);

        // Artificial Horizon line
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(w, cy);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Wireframe Flight Tunnel Rings
        const rings = 6;
        for (let i = 0; i < rings; i++) {
            const z = ((i * 35 + this.offset) % 210) + 20;
            const scale = 140 / z;
            const rw = 190 * scale;
            const rh = 105 * scale;

            ctx.strokeStyle = `rgba(56, 189, 248, ${Math.max(0.12, 1.0 - z / 220)})`;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(cx - rw / 2, cy - rh / 2, rw, rh);

            // Ceiling line (Red dashed safe envelope)
            ctx.beginPath();
            ctx.moveTo(cx - rw / 2, cy - rh / 2);
            ctx.lineTo(cx + rw / 2, cy - rh / 2);
            ctx.strokeStyle = `rgba(239, 68, 68, ${Math.max(0.2, 0.85 - z / 220)})`;
            ctx.stroke();
        }

        // Center Crosshair
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - 22, cy); ctx.lineTo(cx - 14, cy);
        ctx.moveTo(cx + 14, cy); ctx.lineTo(cx + 22, cy);
        ctx.moveTo(cx, cy - 22); ctx.lineTo(cx, cy - 14);
        ctx.moveTo(cx, cy + 14); ctx.lineTo(cx, cy + 22);
        ctx.stroke();

        // HUD Text
        ctx.font = '700 9.5px "Share Tech Mono", monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'left';
        ctx.fillText(`ALT: ${Math.round(this.altitude)} FT`, 10, 16);
        ctx.textAlign = 'right';
        ctx.fillText(`NAV: WAYPOINT-01`, w - 10, 16);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#4ade80';
        ctx.fillText(`GLIDEPATH: 3.0° STABLE`, cx, h - 8);
    }
}

/**
 * Mission Replay Interactive Timeline Graph
 */
function renderReplayTimelineChart(canvasId, historyData, scrubPct = 0.5) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width || 640;
    const h = rect.height || 220;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const padL = 50;
    const padR = 40;
    const padT = 30;
    const padB = 30;
    const pw = w - padL - padR;
    const ph = h - padT - padB;

    ctx.fillStyle = '#070a10';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = '#151d2a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padT + (i / 4) * ph;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();

        const rpmVal = Math.round(6000 - i * 1500);
        ctx.font = '500 8.5px "Share Tech Mono", monospace';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'right';
        ctx.fillText(`${rpmVal}`, padL - 8, y + 3);
    }

    if (!historyData || historyData.length < 2) return;

    const len = historyData.length;
    const getX = (idx) => padL + (idx / (len - 1)) * pw;

    // RPM Curve (Cyan)
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
        const x = getX(i);
        const y = padT + (1.0 - historyData[i].rpm / 6000.0) * ph;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // CHT Curve (Amber)
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
        const x = getX(i);
        const normCht = clamp((historyData[i].cht - 50) / 100.0);
        const y = padT + (1.0 - normCht) * ph;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Scrubber Line (Red dashed line at current scrub position)
    const scrubX = padL + scrubPct * pw;
    ctx.beginPath();
    ctx.moveTo(scrubX, padT - 8);
    ctx.lineTo(scrubX, h - padB + 8);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Scrubber Head
    ctx.beginPath();
    ctx.arc(scrubX, padT - 8, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();

    // Legend
    ctx.font = '700 9px "Inter", sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText("● RPM (0 - 6000)", padL + 10, 16);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText("● CHT (50 - 150 °C)", padL + 130, 16);
    ctx.fillStyle = '#ef4444';
    ctx.fillText("■ TIMELINE SCRUB POSITION", padL + 270, 16);
}

/**
 * Fleet Health Comparison Bar Chart
 */
function renderFleetHealthChart(canvasId, fleetData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width || 600;
    const h = rect.height || 240;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const keys = Object.keys(fleetData);
    const count = keys.length;
    const padding = 50;
    const chartW = w - padding * 2;
    const chartH = h - 60;
    const barWidth = Math.min(52, (chartW / count) - 22);

    ctx.font = '500 10px "Share Tech Mono", monospace';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let p = 0; p <= 100; p += 25) {
        const y = h - 40 - (p / 100.0) * chartH;
        ctx.fillText(`${p}%`, padding - 8, y);
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(w - padding, y);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    keys.forEach((key, idx) => {
        const item = fleetData[key];
        const health = Math.max(0, Math.min(100, item.health !== undefined ? item.health : 90));
        const barH = (health / 100.0) * chartH;
        const x = padding + idx * (chartW / count) + ((chartW / count) - barWidth) / 2;
        const y = h - 40 - barH;

        const barGrad = ctx.createLinearGradient(0, y, 0, y + barH);
        if (health >= 85) {
            barGrad.addColorStop(0, '#22c55e');
            barGrad.addColorStop(1, '#15803d');
        } else if (health >= 65) {
            barGrad.addColorStop(0, '#eab308');
            barGrad.addColorStop(1, '#a16207');
        } else {
            barGrad.addColorStop(0, '#ef4444');
            barGrad.addColorStop(1, '#991b1b');
        }

        ctx.fillStyle = barGrad;
        ctx.fillRect(x, y, barWidth, barH);
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, barWidth, barH);

        ctx.fillStyle = '#f8fafc';
        ctx.font = '700 11px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${health}%`, x + barWidth / 2, y - 8);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '600 10px "Inter", sans-serif';
        const shortName = key.split(' ')[0];
        ctx.fillText(shortName, x + barWidth / 2, h - 22);

        ctx.fillStyle = item.state.includes("Grounded") ? '#ef4444' : (item.state.includes("Maintenance") ? '#eab308' : '#38bdf8');
        ctx.font = '500 8.5px "Inter", sans-serif';
        ctx.fillText(item.state.split(' ')[0], x + barWidth / 2, h - 8);
    });
}

/**
 * Prognostic Prediction Trajectory Chart
 */
function renderPrognosticChart(canvasId, durationHours, peakCht, peakStress) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width || 640;
    const h = rect.height || 260;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const padL = 50;
    const padR = 40;
    const padT = 30;
    const padB = 40;
    const pw = w - padL - padR;
    const ph = h - padT - padB;

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padT + (i / 4) * ph;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();

        const tempVal = 150 - i * 25;
        ctx.font = '500 9px "Share Tech Mono", monospace';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'right';
        ctx.fillText(`${tempVal}°C`, padL - 8, y + 3);
    }

    // CHT Redline at 135°C
    const redlineY = padT + ((150 - 135) / 100) * ph;
    ctx.beginPath();
    ctx.moveTo(padL, redlineY);
    ctx.lineTo(w - padR, redlineY);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'left';
    ctx.fillText("ROTAX OEM CHT MAX 135°C", padL + 10, redlineY - 6);

    // CHT Warning at 120°C
    const warnY = padT + ((150 - 120) / 100) * ph;
    ctx.beginPath();
    ctx.moveTo(padL, warnY);
    ctx.lineTo(w - padR, warnY);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText("DRISHTI WARN 120°C", padL + 10, warnY - 5);

    // CHT Projected Curve
    ctx.beginPath();
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
        const x = padL + (i / steps) * pw;
        const growth = 1.0 + Math.pow(i / steps, 1.6) * 0.18;
        const val = Math.min(148, 85.0 + (peakCht - 85.0) * growth);
        const y = padT + ((150 - val) / 100) * ph;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Time axis
    ctx.font = '500 10px "Share Tech Mono", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
        const t = ((i / 4) * durationHours).toFixed(1);
        const x = padL + (i / 4) * pw;
        ctx.fillText(`${t}h`, x, h - padB + 18);
    }
}
