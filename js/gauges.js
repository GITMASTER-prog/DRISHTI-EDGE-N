/**
 * DRISHTI GCS — Photorealistic Canvas Aircraft Gauge Renderers
 * Supports large primary tachometer dial and 4x2 satellite instrument cluster.
 */

class AircraftGauge {
    constructor(canvasId, options) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        this.min = options.min || 0;
        this.max = options.max || 100;
        this.startAngle = options.startAngle !== undefined ? options.startAngle : (135 * Math.PI / 180);
        this.endAngle = options.endAngle !== undefined ? options.endAngle : (405 * Math.PI / 180);
        this.title = options.title || "";
        this.unit = options.unit || "";
        this.majorTicks = options.majorTicks || 5;
        this.minorTicks = options.minorTicks || 4;
        this.decimals = options.decimals !== undefined ? options.decimals : 0;
        this.valuePrefix = options.valuePrefix || "";
        this.valueSuffix = options.valueSuffix || "";
        this.arcs = options.arcs || [];
        this.isLarge = options.isLarge || false;

        this.currentValue = options.initialValue || this.min;
        this.targetValue = this.currentValue;
        this.needleDamping = 0.16;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.width = rect.width || (this.isLarge ? 220 : 120);
        this.height = rect.height || (this.isLarge ? 220 : 120);

        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform
        this.ctx.scale(dpr, dpr);
        this.draw();
    }

    setValue(val) {
        this.targetValue = Math.max(this.min, Math.min(this.max, val));
    }

    update() {
        const diff = this.targetValue - this.currentValue;
        this.currentValue += diff * this.needleDamping;
        this.draw();
    }

    valToAngle(val) {
        const pct = (val - this.min) / (this.max - this.min);
        return this.startAngle + pct * (this.endAngle - this.startAngle);
    }

    draw() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.min(cx, cy) - (this.isLarge ? 6 : 4);

        ctx.clearRect(0, 0, w, h);

        // 1. Outer Bezel (metallic aircraft instrument case with 3D gradient)
        const bezelGrad = ctx.createLinearGradient(0, 0, w, h);
        bezelGrad.addColorStop(0.0, '#3a3f47');
        bezelGrad.addColorStop(0.3, '#1c1f24');
        bezelGrad.addColorStop(0.7, '#121417');
        bezelGrad.addColorStop(1.0, '#2d323a');

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = bezelGrad;
        ctx.fill();

        ctx.lineWidth = this.isLarge ? 3 : 2;
        ctx.strokeStyle = '#4b5563';
        ctx.stroke();

        // 4 Corner Instrument Screws
        const screwDist = radius * 0.92;
        const screwAngles = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
        ctx.fillStyle = '#111827';
        ctx.strokeStyle = '#4b5563';
        ctx.lineWidth = 1;
        const screwRadius = this.isLarge ? 4 : 2.5;
        screwAngles.forEach(ang => {
            const sx = cx + screwDist * Math.cos(ang);
            const sy = cy + screwDist * Math.sin(ang);
            ctx.beginPath();
            ctx.arc(sx, sy, screwRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(sx - screwRadius * 0.7, sy - screwRadius * 0.4);
            ctx.lineTo(sx + screwRadius * 0.7, sy + screwRadius * 0.4);
            ctx.stroke();
        });

        // 2. Dial Face
        const dialRadius = radius - (this.isLarge ? 10 : 7);
        const dialGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, dialRadius);
        dialGrad.addColorStop(0, '#151921');
        dialGrad.addColorStop(0.85, '#0b0d11');
        dialGrad.addColorStop(1, '#050608');

        ctx.beginPath();
        ctx.arc(cx, cy, dialRadius, 0, Math.PI * 2);
        ctx.fillStyle = dialGrad;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#1e2530';
        ctx.stroke();

        // 3. Colored Range Arcs
        const arcRadius = dialRadius - (this.isLarge ? 10 : 7);
        this.arcs.forEach(arc => {
            const aStart = this.valToAngle(arc.start);
            const aEnd = this.valToAngle(arc.end);
            ctx.beginPath();
            ctx.arc(cx, cy, arcRadius, aStart, aEnd);
            ctx.lineWidth = arc.width ? (this.isLarge ? arc.width * 1.4 : arc.width) : 4;
            ctx.strokeStyle = arc.color;
            ctx.lineCap = 'butt';
            ctx.stroke();
        });

        // 4. Tick Marks & Numbers
        const totalMajor = this.majorTicks;
        const totalSteps = totalMajor * (this.minorTicks + 1);
        const tickOuter = dialRadius - 3;
        const majorTickInner = dialRadius - (this.isLarge ? 16 : 11);
        const minorTickInner = dialRadius - (this.isLarge ? 10 : 7);

        for (let i = 0; i <= totalSteps; i++) {
            const val = this.min + (i / totalSteps) * (this.max - this.min);
            const angle = this.valToAngle(val);
            const isMajor = (i % (this.minorTicks + 1) === 0);

            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            const rInner = isMajor ? majorTickInner : minorTickInner;
            ctx.beginPath();
            ctx.moveTo(cx + rInner * cos, cy + rInner * sin);
            ctx.lineTo(cx + tickOuter * cos, cy + tickOuter * sin);
            ctx.lineWidth = isMajor ? (this.isLarge ? 2.5 : 1.8) : 1.0;
            ctx.strokeStyle = isMajor ? '#f1f5f9' : '#64748b';
            ctx.stroke();

            // Major Tick Numbers
            if (isMajor) {
                const textDist = majorTickInner - (this.isLarge ? 12 : 8);
                const tx = cx + textDist * cos;
                const ty = cy + textDist * sin;

                const fontSize = this.isLarge ? '700 13px' : '600 8.5px';
                ctx.font = `${fontSize} "Share Tech Mono", monospace`;
                ctx.fillStyle = '#cbd5e1';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                let labelText = val;
                if (this.max >= 1000) {
                    labelText = (val / 1000).toFixed(0);
                } else if (val % 1 !== 0) {
                    labelText = val.toFixed(0);
                }
                ctx.fillText(labelText, tx, ty);
            }
        }

        // 5. Dial Title & Units
        const titleFontSize = this.isLarge ? '800 13px' : '700 9px';
        ctx.font = `${titleFontSize} "Inter", sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lines = this.title.split('\n');
        if (lines.length === 1) {
            ctx.fillText(lines[0], cx, cy - radius * 0.32);
        } else {
            ctx.fillText(lines[0], cx, cy - radius * 0.36);
            ctx.font = `${this.isLarge ? '600 11px' : '500 7.5px'} "Share Tech Mono", monospace`;
            ctx.fillStyle = '#64748b';
            ctx.fillText(lines[1], cx, cy - radius * 0.22);
        }

        // 6. Digital LED Readout Box
        const boxW = radius * (this.isLarge ? 0.75 : 0.9);
        const boxH = this.isLarge ? 24 : 16;
        const boxX = cx - boxW / 2;
        const boxY = cy + radius * 0.36;

        ctx.fillStyle = '#060a0f';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#1e293b';
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        const ledFontSize = this.isLarge ? '700 16px' : '700 11px';
        ctx.font = `${ledFontSize} "Share Tech Mono", monospace`;
        ctx.fillStyle = '#4ade80';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const displayVal = this.valuePrefix + this.currentValue.toFixed(this.decimals) + this.valueSuffix;
        ctx.fillText(displayVal, cx, boxY + boxH / 2 + 1);

        // 7. Needle Shadow
        const needleAngle = this.valToAngle(this.currentValue);
        const needleLen = dialRadius - (this.isLarge ? 12 : 8);
        const shadowOffset = this.isLarge ? 4 : 2.5;

        ctx.save();
        ctx.translate(cx + shadowOffset, cy + shadowOffset);
        ctx.rotate(needleAngle);
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(0, -3.5);
        ctx.lineTo(needleLen, 0);
        ctx.lineTo(0, 3.5);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fill();
        ctx.restore();

        // 8. Tapered Aircraft Needle
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(needleAngle);

        const nw = this.isLarge ? 4.5 : 3.0;
        ctx.beginPath();
        ctx.moveTo(-12, 0);
        ctx.lineTo(0, -nw);
        ctx.lineTo(needleLen, 0);
        ctx.lineTo(0, nw);
        ctx.closePath();

        const needleGrad = ctx.createLinearGradient(0, -nw, 0, nw);
        needleGrad.addColorStop(0, '#ffffff');
        needleGrad.addColorStop(0.5, '#f8fafc');
        needleGrad.addColorStop(1, '#94a3b8');
        ctx.fillStyle = needleGrad;
        ctx.fill();

        // Needle neon tip
        ctx.beginPath();
        ctx.moveTo(needleLen * 0.65, -nw * 0.55);
        ctx.lineTo(needleLen, 0);
        ctx.lineTo(needleLen * 0.65, nw * 0.55);
        ctx.closePath();
        ctx.fillStyle = '#22c55e';
        ctx.fill();

        // Center Pivot Cap
        const capRadius = this.isLarge ? 9.5 : 6.5;
        ctx.beginPath();
        ctx.arc(0, 0, capRadius, 0, Math.PI * 2);
        const capGrad = ctx.createRadialGradient(-1, -1, 1, 0, 0, capRadius);
        capGrad.addColorStop(0, '#64748b');
        capGrad.addColorStop(0.5, '#1e293b');
        capGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = capGrad;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#94a3b8';
        ctx.stroke();

        ctx.restore();
    }
}

const GAUGES = {};

function initializeAllGauges() {
    // 1. MASTER TACHOMETER (RPM x1000) — LARGE GAUGE ON LEFT
    GAUGES.rpm = new AircraftGauge('gauge-rpm', {
        min: 0, max: 7000,
        title: "RPM\nx1000",
        majorTicks: 7, minorTicks: 3,
        decimals: 0,
        isLarge: true,
        initialValue: 4300,
        arcs: [
            { start: 3800, end: 5500, color: 'rgba(34, 197, 94, 0.8)', width: 5 },  // Green continuous band
            { start: 5500, end: 5800, color: 'rgba(245, 158, 11, 0.9)', width: 5 }, // Amber 5-min takeoff
            { start: 5800, end: 7000, color: 'rgba(239, 68, 68, 0.95)', width: 6 }  // Redline
        ]
    });

    // 2. MAP (10 to 42 inHg) — Top Row 1
    GAUGES.map = new AircraftGauge('gauge-map', {
        min: 10, max: 42,
        title: "MAP\ninHg",
        majorTicks: 4, minorTicks: 3,
        decimals: 1,
        initialValue: 26.4,
        arcs: [
            { start: 20, end: 35.4, color: 'rgba(34, 197, 94, 0.75)', width: 4 },
            { start: 35.4, end: 40.5, color: 'rgba(245, 158, 11, 0.85)', width: 4 },
            { start: 40.5, end: 42, color: 'rgba(239, 68, 68, 0.95)', width: 5 }
        ]
    });

    // 3. CHT (60 to 150 °C) — Top Row 2
    GAUGES.cht = new AircraftGauge('gauge-cht', {
        min: 60, max: 150,
        title: "CHT\n°C",
        majorTicks: 4, minorTicks: 4,
        decimals: 1,
        initialValue: 85.2,
        arcs: [
            { start: 70, end: 120, color: 'rgba(34, 197, 94, 0.75)', width: 4 },
            { start: 120, end: 135, color: 'rgba(245, 158, 11, 0.85)', width: 4 },
            { start: 135, end: 150, color: 'rgba(239, 68, 68, 0.95)', width: 5 }
        ]
    });

    // 4. EGT (400 to 1050 °C) — Top Row 3
    GAUGES.egt = new AircraftGauge('gauge-egt', {
        min: 400, max: 1050,
        title: "EGT\n°C",
        majorTicks: 6, minorTicks: 3,
        decimals: 0,
        initialValue: 672,
        arcs: [
            { start: 500, end: 850, color: 'rgba(34, 197, 94, 0.75)', width: 4 },
            { start: 850, end: 950, color: 'rgba(245, 158, 11, 0.85)', width: 4 },
            { start: 950, end: 1050, color: 'rgba(239, 68, 68, 0.95)', width: 5 }
        ]
    });

    // 5. POWER (0 to 90 kW) — Top Row 4
    GAUGES.power = new AircraftGauge('gauge-power', {
        min: 0, max: 90,
        title: "POWER\nkW",
        majorTicks: 4, minorTicks: 4,
        decimals: 1,
        initialValue: 38.1,
        arcs: [
            { start: 0, end: 73.5, color: 'rgba(34, 197, 94, 0.75)', width: 4 },
            { start: 73.5, end: 84.8, color: 'rgba(245, 158, 11, 0.85)', width: 4 },
            { start: 84.8, end: 90.0, color: 'rgba(239, 68, 68, 0.95)', width: 5 }
        ]
    });

    // 6. OIL PRESSURE (0 to 8 bar) — Bottom Row 1
    GAUGES.oilPress = new AircraftGauge('gauge-oil-press', {
        min: 0, max: 8,
        title: "OIL PRESS\nbar",
        majorTicks: 4, minorTicks: 3,
        decimals: 2,
        initialValue: 3.20,
        arcs: [
            { start: 0, end: 0.8, color: 'rgba(239, 68, 68, 0.95)', width: 4 },
            { start: 0.8, end: 2.0, color: 'rgba(245, 158, 11, 0.85)', width: 4 },
            { start: 2.0, end: 5.0, color: 'rgba(34, 197, 94, 0.75)', width: 4 },
            { start: 5.0, end: 7.0, color: 'rgba(245, 158, 11, 0.85)', width: 4 },
            { start: 7.0, end: 8.0, color: 'rgba(239, 68, 68, 0.95)', width: 5 }
        ]
    });

    // 7. OIL TEMP (50 to 140 °C) — Bottom Row 2
    GAUGES.oilTemp = new AircraftGauge('gauge-oil-temp', {
        min: 50, max: 140,
        title: "OIL TEMP\n°C",
        majorTicks: 4, minorTicks: 4,
        decimals: 1,
        initialValue: 81.4,
        arcs: [
            { start: 50, end: 90, color: 'rgba(56, 189, 248, 0.75)', width: 4 },
            { start: 90, end: 110, color: 'rgba(34, 197, 94, 0.75)', width: 4 },
            { start: 110, end: 130, color: 'rgba(245, 158, 11, 0.85)', width: 4 },
            { start: 130, end: 140, color: 'rgba(239, 68, 68, 0.95)', width: 5 }
        ]
    });

    // 8. VIBRATION (0 to 4.0 mm/s) — Bottom Row 3
    GAUGES.vibration = new AircraftGauge('gauge-vibration', {
        min: 0, max: 4.0,
        title: "VIB\nmm/s",
        majorTicks: 4, minorTicks: 3,
        decimals: 2,
        initialValue: 1.09,
        arcs: [
            { start: 0, end: 1.89, color: 'rgba(34, 197, 94, 0.75)', width: 4 },
            { start: 1.89, end: 3.0, color: 'rgba(245, 158, 11, 0.85)', width: 4 },
            { start: 3.0, end: 4.0, color: 'rgba(239, 68, 68, 0.95)', width: 5 }
        ]
    });

    // 9. ALTERNATOR HEALTH (0 to 100%) — Bottom Row 4
    GAUGES.alternator = new AircraftGauge('gauge-alternator', {
        min: 0, max: 100,
        title: "ALTERNATOR\nHEALTH %",
        majorTicks: 4, minorTicks: 4,
        decimals: 0,
        valueSuffix: "%",
        initialValue: 96,
        arcs: [
            { start: 0, end: 75, color: 'rgba(239, 68, 68, 0.95)', width: 4 },
            { start: 75, end: 90, color: 'rgba(245, 158, 11, 0.85)', width: 4 },
            { start: 90, end: 100, color: 'rgba(34, 197, 94, 0.75)', width: 4 }
        ]
    });
}
