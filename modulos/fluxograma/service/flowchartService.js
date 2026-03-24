/* Service for Fluxograma */
import {
    NODE_MIN_WIDTH, NODE_MIN_HEIGHT, NODE_MAX_WIDTH_AUTO, NODE_MAX_WIDTH_MANUAL,
    NODE_MAX_HEIGHT_MANUAL, NODE_PADDING_X, NODE_PADDING_Y, NODE_LINE_HEIGHT,
    NODE_HANDLE_SIZE, RULER_SIZE, RULER_STEP
} from '../model/flowchartModel.js';

export function sanitizeFilename(n) {
    return n.replace(/[\\/:*?"<>|]/g, "_").trim() || "fluxograma";
}

export function getNodeWidth(n) {
    return n.w || NODE_MIN_WIDTH;
}

export function getNodeHeight(n) {
    return n.h || NODE_MIN_HEIGHT;
}

export function wrapTextLines(ctx, text, maxWidth) {
    const src = ((text ?? "") + "").replace(/\r\n/g, "\n");
    const paras = src.split("\n");
    const lines = [];
    for (const para of paras) {
        if (para === "") {
            lines.push("");
            continue;
        }
        let line = "", lastBreak = -1;
        for (const ch of para) {
            line += ch;
            if (ch === " " || ch === "-" || ch === "_") lastBreak = line.length - 1;
            if (ctx.measureText(line).width > maxWidth) {
                if (lastBreak > 0) {
                    const out = line.slice(0, lastBreak).trimEnd();
                    lines.push(out || line.slice(0, lastBreak));
                    line = line.slice(lastBreak + 1).trimStart();
                } else {
                    lines.push(line.slice(0, -1));
                    line = ch;
                }
                lastBreak = -1;
                for (let j = line.length - 1; j >= 0; j--) {
                    const c = line[j];
                    if (c === " " || c === "-" || c === "_") {
                        lastBreak = j;
                        break;
                    }
                }
            }
        }
        lines.push(line);
    }
    return lines.length ? lines : ["Nó sem texto"];
}

export function updateNodeMetrics(ctx, n) {
    ctx.font = "600 16px Segoe UI";
    const text = (n.text || "Nó sem texto"), autoContent = NODE_MAX_WIDTH_AUTO - (NODE_PADDING_X * 2);
    let probe = wrapTextLines(ctx, text, autoContent), longest = 0;
    for (const l of probe) longest = Math.max(longest, ctx.measureText(l || " ").width);
    let targetWidth = n.manualSize ? Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH_MANUAL, Number(n.w) || NODE_MIN_WIDTH)) : Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH_AUTO, Math.ceil(longest + (NODE_PADDING_X * 2))));
    let lines = wrapTextLines(ctx, text, targetWidth - (NODE_PADDING_X * 2));
    const neededHeight = Math.max(NODE_MIN_HEIGHT, Math.ceil(lines.length * NODE_LINE_HEIGHT + (NODE_PADDING_Y * 2)));
    if (!n.manualSize) {
        n.w = targetWidth;
        n.h = neededHeight;
    } else {
        n.w = targetWidth;
        n.h = Math.max(Math.min(Number(n.h) || NODE_MIN_HEIGHT, NODE_MAX_HEIGHT_MANUAL), neededHeight);
    }
    n._lines = lines;
}

export function getConnectorPoint(node, targetX, targetY) {
    const w = getNodeWidth(node), h = getNodeHeight(node), cx = node.x + w / 2, cy = node.y + h / 2, dx = targetX - cx, dy = targetY - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };
    const sx = (w / 2) / (Math.abs(dx) || 1e-6), sy = (h / 2) / (Math.abs(dy) || 1e-6), s = Math.min(sx, sy);
    return { x: cx + dx * s, y: cy + dy * s };
}

export function getConnectionGeometry(state, cn) {
    const f = state.nodes.find(n => n.id === cn.from), t = state.nodes.find(n => n.id === cn.to);
    if (!f || !t) return null;
    const fc = { x: f.x + getNodeWidth(f) / 2, y: f.y + getNodeHeight(f) / 2 }, tc = { x: t.x + getNodeWidth(t) / 2, y: t.y + getNodeHeight(t) / 2 };
    const sp = getConnectorPoint(f, tc.x, tc.y), ep = getConnectorPoint(t, fc.x, fc.y), dx = ep.x - sp.x, dy = ep.y - sp.y;
    let c1x = sp.x, c1y = sp.y, c2x = ep.x, c2y = ep.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
        const sgn = dx >= 0 ? 1 : -1, b = Math.max(60, Math.min(220, Math.abs(dx) * 0.35 + Math.abs(dy) * 0.15));
        c1x = sp.x + b * sgn; c1y = sp.y; c2x = ep.x - b * sgn; c2y = ep.y;
    } else {
        const sgn = dy >= 0 ? 1 : -1, b = Math.max(60, Math.min(220, Math.abs(dy) * 0.35 + Math.abs(dx) * 0.15));
        c1x = sp.x; c1y = sp.y + b * sgn; c2x = ep.x; c2y = ep.y - b * sgn;
    }
    return { x1: sp.x, y1: sp.y, x2: ep.x, y2: ep.y, c1x, c1y, c2x, c2y };
}

export function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    const sx = x1 + t * dx, sy = y1 + t * dy;
    return Math.hypot(px - sx, py - sy);
}

export function cubicBezierPoint(t, p0, p1, p2, p3) {
    const u = 1 - t, tt = t * t, uu = u * u, uuu = uu * u, ttt = tt * t;
    return uuu * p0 + 3 * uu * t * p1 + 3 * u * tt * p2 + ttt * p3;
}

export function pointToCubicDistance(px, py, g, steps = 26) {
    let best = Infinity, px0 = g.x1, py0 = g.y1;
    for (let i = 1; i <= steps; i++) {
        const t = i / steps, cx = cubicBezierPoint(t, g.x1, g.c1x, g.c2x, g.x2), cy = cubicBezierPoint(t, g.y1, g.c1y, g.c2y, g.y2);
        best = Math.min(best, pointToSegmentDistance(px, py, px0, py0, cx, cy));
        px0 = cx; py0 = cy;
    }
    return best;
}

export function getTextColorByFill(hex) {
    const h = (hex || "#ffffff").replace("#", "");
    const n = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
    if (n.length !== 6) return "#1a1f28";
    const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return lum < 0.5 ? "#ffffff" : "#1a1f28";
}

export function drawNodeShape(ctx, shape, x, y, w, h) {
    if (shape === "ellipse") {
        ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); return;
    }
    if (shape === "diamond") {
        ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w / 2, y + h); ctx.lineTo(x, y + h / 2); ctx.closePath(); ctx.fill(); ctx.stroke(); return;
    }
    if (shape === "hexagon") {
        const d = Math.min(w * 0.22, 44); ctx.beginPath(); ctx.moveTo(x + d, y); ctx.lineTo(x + w - d, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w - d, y + h); ctx.lineTo(x + d, y + h); ctx.lineTo(x, y + h / 2); ctx.closePath(); ctx.fill(); ctx.stroke(); return;
    }
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
}

export function drawArrowHead(ctx, x, y, angle, size) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - size * Math.cos(angle - Math.PI / 7), y - size * Math.sin(angle - Math.PI / 7)); ctx.lineTo(x - size * Math.cos(angle + Math.PI / 7), y - size * Math.sin(angle + Math.PI / 7)); ctx.closePath(); ctx.fill();
}

export function drawLinesCentered(ctx, lines, cx, cy, lineHeight) {
    const arr = (lines && lines.length) ? lines : ["Nó sem texto"];
    let y = cy - (arr.length * lineHeight) / 2 + lineHeight / 2;
    for (const l of arr) {
        ctx.fillText(l || " ", cx, y); y += lineHeight;
    }
}

export function getNodeHandles(n) {
    const w = getNodeWidth(n), h = getNodeHeight(n), x = n.x, y = n.y, s = NODE_HANDLE_SIZE, r = s / 2;
    return [
        { key: "nw", x: x - r, y: y - r, w: s, h: s },
        { key: "ne", x: x + w - r, y: y - r, w: s, h: s },
        { key: "sw", x: x - r, y: y + h - r, w: s, h: s },
        { key: "se", x: x + w - r, y: y + h - r, w: s, h: s }
    ];
}
