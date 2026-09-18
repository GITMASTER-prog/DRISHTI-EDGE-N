/**
 * DRISHTI GCS — Vertical Tape & Bar Indicator Renderers
 * Calibrated strictly to user level specifications:
 * 80–100% : Green  (#22c55e)
 * 50–79%  : Yellow (#eab308)
 * 25–49%  : Orange (#f97316)
 * 1–24%   : Red    (#ef4444)
 *
 * Includes metallic bezels, 4 corner screws, 4-zone right guide scale, and dynamic digital LED readouts.
 */

class VerticalTapeCanvas {
    constructor(canvasId, options) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        this.min = options.min || 0;
        this.max = options.max || 100;
        this.title = options.title || "";
        this.unit = options.unit || "";
        this.decimals = options.decimals !== undefined ? options.decimals : 0;
        this.ticks = options.ticks || [0, 50, 100];
        this.type = options.type || "standard";

        this.currentValue = options.initialValue || this.min;
        this.targetValue = this.currentValue;
        this.damping = 0.16;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.width = rect.width || 78;
        this.height = rect.height || 216;

        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        this.draw();
    }

    setValue(val) {
        this.targetValue = Math.max(this.min, Math.min(this.max, val));
    }

    update() {
        const diff = this.targetValue - this.currentValue;
        this.currentValue += diff * this.damping;
        this.draw();
    }

    draw() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        ctx.clearRect(0, 0, w, h);

        // 1. Outer Metallic Bezel Casing
        const cornerR = 8;
        ctx.beginPath();
        ctx.roundRect(1, 1, w - 2, h - 2, cornerR);
        const bezelGrad = ctx.createLinearGradient(0, 0, w, h);
        bezelGrad.addColorStop(0, '#2a313d');
        bezelGrad.addColorStop(0.3, '#141820');
        bezelGrad.addColorStop(0.7, '#0c0f14');
        bezelGrad.addColorStop(1, '#222832');
        ctx.fillStyle = bezelGrad;
        ctx.fill();

        ctx.lineWidth = 1.8;
        ctx.strokeStyle = '#3b4352';
        ctx.stroke();

        // 4 Corner Screws
        const screwPadX = 6;
        const screwPadY = 6;
        const screwRadius = 2.2;
        const screws = [
            [screwPadX, screwPadY],
            [w - screwPadX, screwPadY],
            [screwPadX, h - screwPadY],
            [w - screwPadX, h - screwPadY]
        ];

        screws.forEach(([sx, sy]) => {
            ctx.beginPath();
            ctx.arc(sx, sy, screwRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#0a0d12';
            ctx.fill();
            ctx.lineWidth = 0.8;
            ctx.strokeStyle = '#475569';
            ctx.stroke();

            // Screw slit
            ctx.beginPath();
            ctx.moveTo(sx - 1.2, sy);
            ctx.lineTo(sx + 1.2, sy);
            ctx.moveTo(sx, sy - 1.2);
            ctx.lineTo(sx, sy + 1.2);
            ctx.stroke();
        });

        // 2. Instrument Header (Title line 1, Unit line 2)
        ctx.font = '800 8.5px "Inter", sans-serif';
        ctx.fillStyle = '#f1f5f9';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(this.title, w / 2, 11);

        ctx.font = '700 8px "Inter", sans-serif';
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(this.unit, w / 2, 22);

        // 3. Vertical Tape Slot Layout
        const tapeTop = 38;
        const tapeBottom = h - 34;
        const tapeHeight = tapeBottom - tapeTop;

        const slotW = 16;
        const slotX = w / 2 - slotW / 2 + 6;

        // Left Scale Numbers & Ticks
        ctx.font = '700 8.5px "Share Tech Mono", monospace';
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        this.ticks.forEach(tVal => {
            const pct = (tVal - this.min) / (this.max - this.min);
            const ty = tapeBottom - pct * tapeHeight;

            // Number label
            ctx.fillText(tVal.toString(), slotX - 5, ty);

            // Tick mark
            ctx.beginPath();
            ctx.moveTo(slotX - 3, ty);
            ctx.lineTo(slotX, ty);
            ctx.lineWidth = 1.2;
            ctx.strokeStyle = '#94a3b8';
            ctx.stroke();
        });

        // Minor ticks
        const minorStepCount = 10;
        for (let i = 0; i <= minorStepCount; i++) {
            const mPct = i / minorStepCount;
            const my = tapeBottom - mPct * tapeHeight;
            ctx.beginPath();
            ctx.moveTo(slotX - 2, my);
            ctx.lineTo(slotX, my);
            ctx.lineWidth = 0.8;
            ctx.strokeStyle = '#475569';
            ctx.stroke();
        }

        // 4. Recessed Vertical Bar Trough (Dark slot)
        ctx.fillStyle = '#05070a';
        ctx.fillRect(slotX, tapeTop, slotW, tapeHeight);
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#1e293b';
        ctx.strokeRect(slotX, tapeTop, slotW, tapeHeight);

        // 5. Right-side Color Scheme Zones Guide Rail:
        // 80–100%: Green
        // 50–79% : Yellow
        // 25–49% : Orange
        // 1–24%  : Red
        const rightGuideX = slotX + slotW + 4;
        const y100 = tapeTop;
        const y80 = tapeBottom - 0.80 * tapeHeight;
        const y50 = tapeBottom - 0.50 * tapeHeight;
        const y25 = tapeBottom - 0.25 * tapeHeight;
        const y0 = tapeBottom;

        // Zone 80-100% (Green)
        ctx.beginPath();
        ctx.moveTo(rightGuideX, y100);
        ctx.lineTo(rightGuideX, y80);
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Zone 50-79% (Yellow)
        ctx.beginPath();
        ctx.moveTo(rightGuideX, y80);
        ctx.lineTo(rightGuideX, y50);
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Zone 25-49% (Orange)
        ctx.beginPath();
        ctx.moveTo(rightGuideX, y50);
        ctx.lineTo(rightGuideX, y25);
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Zone 1-24% (Red)
        ctx.beginPath();
        ctx.moveTo(rightGuideX, y25);
        ctx.lineTo(rightGuideX, y0);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Small horizontal guide notches at bracket boundaries
        [y100, y80, y50, y25, y0].forEach(notchY => {
            ctx.beginPath();
            ctx.moveTo(rightGuideX, notchY);
            ctx.lineTo(rightGuideX + 3, notchY);
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1;
            ctx.stroke();
        });

        // 6. Bar Fill & Color Scheme according to Level:
        // 80-100 : Green
        // 50-79  : Yellow
        // 25-49  : Orange
        // 1-24   : Red
        const fillPct = Math.max(0, Math.min(1, (this.currentValue - this.min) / (this.max - this.min)));
        const levelPct = Math.round(fillPct * 100);
        const fillHeight = fillPct * tapeHeight;
        const fillY = tapeBottom - fillHeight;

        let primaryColor, darkColor, readoutColor;
        if (levelPct >= 80) {
            primaryColor = '#22c55e'; // Green
            darkColor = '#15803d';
            readoutColor = '#4ade80';
        } else if (levelPct >= 50) {
            primaryColor = '#eab308'; // Yellow
            darkColor = '#a16207';
            readoutColor = '#facc15';
        } else if (levelPct >= 25) {
            primaryColor = '#f97316'; // Orange
            darkColor = '#c2410c';
            readoutColor = '#fb923c';
        } else {
            primaryColor = '#ef4444'; // Red
            darkColor = '#991b1b';
            readoutColor = '#f87171';
        }

        if (fillHeight > 0) {
            const barGrad = ctx.createLinearGradient(0, tapeBottom, 0, fillY);
            barGrad.addColorStop(0, darkColor);
            barGrad.addColorStop(1, primaryColor);

            ctx.fillStyle = barGrad;
            ctx.fillRect(slotX + 1, fillY, slotW - 2, fillHeight);

            // Bright horizontal level indicator line at top of fill
            ctx.beginPath();
            ctx.moveTo(slotX, fillY);
            ctx.lineTo(slotX + slotW, fillY);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        // 7. Recessed Digital Readout Box at Bottom
        const boxH = 20;
        const boxW = w - 18;
        const boxX = w / 2 - boxW / 2;
        const boxY = h - boxH - 7;

        ctx.fillStyle = '#030508';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#1e293b';
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        // Glowing 7-segment / Digital Monospace Text in Level Color
        ctx.font = '800 13px "Share Tech Mono", monospace';
        ctx.fillStyle = readoutColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const displayVal = this.currentValue.toFixed(this.decimals);
        ctx.fillText(displayVal, w / 2, boxY + boxH / 2 + 1);
    }
}

const TAPES = {};

function initializeAllTapes() {
    // 1. FUEL FLOW (0 to 70 L/h)
    TAPES.fuelFlow = new VerticalTapeCanvas('tape-fuel-flow', {
        min: 0, max: 70,
        title: "FUEL FLOW",
        unit: "L/h",
        decimals: 1,
        initialValue: 38.1,
        ticks: [0, 20, 40, 60]
    });

    // 2. BUS VOLTAGE (8 to 16 V)
    TAPES.busVoltage = new VerticalTapeCanvas('tape-bus-voltage', {
        min: 8, max: 16,
        title: "BUS VOLTAGE",
        unit: "V",
        decimals: 1,
        initialValue: 14.1,
        ticks: [10, 12, 14, 16]
    });

    // 3. ALT HEALTH (0 to 100%)
    TAPES.altHealth = new VerticalTapeCanvas('tape-alt-health', {
        min: 0, max: 100,
        title: "ALT HEALTH",
        unit: "%",
        decimals: 0,
        initialValue: 95,
        ticks: [0, 50, 100]
    });

    // 4. FUEL QTY (0 to 100%)
    TAPES.fuelQty = new VerticalTapeCanvas('tape-fuel-qty', {
        min: 0, max: 100,
        title: "FUEL QTY",
        unit: "%",
        decimals: 0,
        initialValue: 62,
        ticks: [0, 50, 100]
    });
}
