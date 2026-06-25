"use strict";
// ============================================================
// Accessibility System Audit — plugin sandbox code
// This file runs inside Figma's plugin sandbox. It has access
// to the `figma` global object, which is how we read the
// document tree. It has NO access to the DOM/browser — that's
// why there's a separate ui.html for the visual panel.
// ============================================================
// ---------- Color math (WCAG contrast formula) ----------
function relativeLuminance(r, g, b) {
    const channel = (c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const [rl, gl, bl] = [channel(r), channel(g), channel(b)];
    return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}
function contrastRatio(c1, c2) {
    const l1 = relativeLuminance(c1.r, c1.g, c1.b);
    const l2 = relativeLuminance(c2.r, c2.g, c2.b);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}
function paintToRGB255(paint) {
    return {
        r: paint.color.r * 255,
        g: paint.color.g * 255,
        b: paint.color.b * 255,
    };
}
function getSolidFill(node) {
    if (!("fills" in node))
        return null;
    const fills = node.fills;
    if (fills === figma.mixed || !Array.isArray(fills))
        return null;
    for (let i = fills.length - 1; i >= 0; i--) {
        const f = fills[i];
        if (f.type === "SOLID" && f.visible !== false)
            return f;
    }
    return null;
}
// Finds the background a text node actually renders on top of.
//
// IMPORTANT: the background is usually NOT an ancestor of the text node —
// it's a SIBLING shape (e.g. a rectangle behind the label, both children
// of the same button frame). So instead of walking up the parent chain,
// we search the whole component variant for solid-filled shapes whose
// bounding box geometrically contains the text, and pick the smallest
// one (the tightest-fitting shape is almost always the immediate
// background, not some larger container further back).
function findBackgroundColor(textNode) {
    const DEFAULT_WHITE = { r: 255, g: 255, b: 255 };
    const targetBox = textNode.absoluteBoundingBox;
    if (!targetBox)
        return DEFAULT_WHITE;
    // Find the nearest ancestor that represents the whole component variant
    // (or the page, as a fallback) — that's the scope we search within.
    let scope = textNode.parent;
    while (scope && scope.type !== "COMPONENT" && scope.type !== "PAGE") {
        scope = scope.parent;
    }
    if (!scope || !("findAll" in scope))
        return DEFAULT_WHITE;
    const candidates = scope.findAll((n) => n.id !== textNode.id && "fills" in n);
    let best = null;
    let bestArea = Infinity;
    const margin = 0.5; // tolerance for sub-pixel rounding
    for (const n of candidates) {
        const box = n.absoluteBoundingBox;
        if (!box)
            continue;
        const fill = getSolidFill(n);
        if (!fill)
            continue;
        const fullyContains = box.x <= targetBox.x + margin &&
            box.y <= targetBox.y + margin &&
            box.x + box.width >= targetBox.x + targetBox.width - margin &&
            box.y + box.height >= targetBox.y + targetBox.height - margin;
        if (!fullyContains)
            continue;
        const area = box.width * box.height;
        if (area < bestArea) {
            bestArea = area;
            best = n;
        }
    }
    if (best) {
        const fill = getSolidFill(best);
        if (fill)
            return paintToRGB255(fill);
    }
    return DEFAULT_WHITE;
}
function isBold(t) {
    if (t.fontName === figma.mixed)
        return false;
    return /bold/i.test(t.fontName.style);
}
// ---------- The audit itself ----------
function auditDocument() {
    const issues = [];
    const componentSets = figma.root.findAll((n) => n.type === "COMPONENT_SET");
    for (const set of componentSets) {
        const variants = set.children.filter((c) => c.type === "COMPONENT");
        for (const variant of variants) {
            auditContrastAndFontSize(set, variant, issues);
            auditTargetSize(set, variant, issues);
        }
        auditFocusState(set, variants, issues);
    }
    return issues;
}
function auditContrastAndFontSize(set, variant, issues) {
    const textNodes = variant.findAll((n) => n.type === "TEXT");
    for (const t of textNodes) {
        // --- Contrast check ---
        const fill = getSolidFill(t);
        if (fill) {
            const fg = paintToRGB255(fill);
            const bg = findBackgroundColor(t);
            const ratio = contrastRatio(fg, bg);
            const fontSize = typeof t.fontSize === "number" ? t.fontSize : 16;
            const isLarge = fontSize >= 18 || (fontSize >= 14 && isBold(t));
            const threshold = isLarge ? 3 : 4.5;
            if (ratio < threshold) {
                issues.push({
                    id: `${t.id}-contrast`,
                    nodeId: t.id,
                    nodeName: t.name,
                    componentName: `${set.name} / ${variant.name}`,
                    category: "contrast",
                    severity: ratio < threshold - 1.5 ? "high" : "medium",
                    message: `Low contrast text in "${set.name}" → ${variant.name}`,
                    detail: `"${t.characters.slice(0, 40)}" has a contrast ratio of ${ratio.toFixed(2)}:1. WCAG AA requires at least ${threshold}:1 for ${isLarge ? "large" : "normal"} text.`,
                });
            }
        }
        // --- Font size check ---
        const fontSize = typeof t.fontSize === "number" ? t.fontSize : null;
        if (fontSize !== null && fontSize < 12) {
            issues.push({
                id: `${t.id}-fontsize`,
                nodeId: t.id,
                nodeName: t.name,
                componentName: `${set.name} / ${variant.name}`,
                category: "font-size",
                severity: "medium",
                message: `Text too small in "${set.name}" → ${variant.name}`,
                detail: `"${t.characters.slice(0, 40)}" is ${fontSize}px. Below ~12px, text becomes hard to read for low-vision and older users.`,
            });
        }
    }
}
function auditTargetSize(set, variant, issues) {
    // Walk the tree, but once a node is flagged as too small, don't descend
    // into its children — they're part of the same control, not separate
    // targets, and would otherwise be double-counted (e.g. a 16x16 button
    // frame AND the icon glyph inside it at the same size).
    const walk = (node) => {
        if (node.id !== variant.id &&
            "width" in node &&
            "height" in node &&
            node.type !== "TEXT") {
            if (node.width > 0 && node.height > 0 && node.width < 24 && node.height < 24) {
                issues.push({
                    id: `${node.id}-targetsize`,
                    nodeId: node.id,
                    nodeName: node.name,
                    componentName: `${set.name} / ${variant.name}`,
                    category: "target-size",
                    severity: "high",
                    message: `Touch target too small in "${set.name}" → ${variant.name}`,
                    detail: `"${node.name}" is ${Math.round(node.width)}×${Math.round(node.height)}px. WCAG 2.2 requires interactive elements to be at least 24×24px.`,
                });
                return; // don't descend further into this already-flagged control
            }
        }
        if ("children" in node) {
            for (const child of node.children) {
                walk(child);
            }
        }
    };
    for (const child of variant.children) {
        walk(child);
    }
}
// Compares the "default" and "focus" variants of a component set.
// If they render identically, there's no visible focus indicator —
// a serious problem for keyboard and screen-reader users.
function auditFocusState(set, variants, issues) {
    const propDefs = set.componentPropertyDefinitions || {};
    const statePropName = Object.keys(propDefs).find((p) => p.toLowerCase() === "state");
    if (!statePropName)
        return;
    const stateValueOf = (v) => {
        const props = v.variantProperties;
        return props && props[statePropName] ? props[statePropName].toLowerCase() : "";
    };
    const defaultVariant = variants.find((v) => stateValueOf(v) === "default");
    const focusVariant = variants.find((v) => stateValueOf(v) === "focus");
    if (!defaultVariant || !focusVariant)
        return;
    if (serializeVisual(defaultVariant) === serializeVisual(focusVariant)) {
        issues.push({
            id: `${set.id}-focus-missing`,
            nodeId: focusVariant.id,
            nodeName: focusVariant.name,
            componentName: set.name,
            category: "focus-state",
            severity: "high",
            message: `Missing focus indicator in "${set.name}"`,
            detail: `The "focus" variant renders identically to "default". Keyboard and screen-reader users have no visual way to tell this element is focused.`,
        });
    }
}
// Flattens a node's visual properties (fills, strokes, effects) into a
// string so two variants can be compared for "do they look the same?"
function serializeVisual(node) {
    const parts = [];
    const walk = (n) => {
        if ("fills" in n && Array.isArray(n.fills)) {
            parts.push(JSON.stringify(n.fills));
        }
        if ("strokes" in n && Array.isArray(n.strokes)) {
            parts.push(JSON.stringify(n.strokes));
        }
        if ("effects" in n && Array.isArray(n.effects)) {
            parts.push(JSON.stringify(n.effects));
        }
        if ("children" in n) {
            for (const child of n.children)
                walk(child);
        }
    };
    walk(node);
    return parts.join("|");
}
// ---------- Wiring: UI <-> sandbox messaging ----------
figma.showUI(__html__, { width: 380, height: 640 });
// On startup, hand the UI whatever API key was saved from a previous
// session, so the person doesn't have to re-enter it every time. This
// uses figma.clientStorage — the plugin-sandbox storage API Figma
// provides for exactly this purpose. (Note: it is NOT browser
// localStorage, which Figma plugins cannot use.)
figma.clientStorage.getAsync("groqApiKey").then((key) => {
    figma.ui.postMessage({ type: "stored-api-key", key: key || "" });
});
figma.ui.onmessage = (msg) => {
    if (msg.type === "run-audit") {
        const issues = auditDocument();
        figma.ui.postMessage({ type: "audit-results", issues });
    }
    if (msg.type === "select-node" && msg.nodeId) {
        const node = figma.getNodeById(msg.nodeId);
        if (node && "x" in node) {
            const sceneNode = node;
            figma.currentPage.selection = [sceneNode];
            figma.viewport.scrollAndZoomIntoView([sceneNode]);
        }
    }
    if (msg.type === "save-api-key") {
        figma.clientStorage.setAsync("groqApiKey", msg.key || "");
    }
};
