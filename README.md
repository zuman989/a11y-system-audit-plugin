# A11y System Audit — Figma Plugin

A Figma plugin that scans your design system's components for WCAG AA accessibility violations **while you're still designing** — not after a formal audit months later.

Built to close the gap between how developers catch accessibility bugs (linters, CI) and how designers currently catch them (they don't, until it's too late).

---

## What it checks

| Check | What it catches |
|---|---|
| **Contrast** | Text that fails WCAG AA contrast ratios (4.5:1 normal, 3:1 large text) |
| **Focus state** | Focus variants that look identical to default — invisible to keyboard users |
| **Font size** | Text below 12px that becomes unreadable for low-vision users |
| **Touch target size** | Interactive elements under 24×24px (WCAG 2.2 minimum) |

The focus-state check is the one existing tools like Stark and Able don't do — they have no concept of component states.

---

## How it works

1. Open the plugin in any Figma file containing component sets
2. Click **Run audit** — no manual selection or frame-wrapping needed
3. Issues are listed by severity (High / Medium / Low), click any issue to jump to that layer in Figma
4. Optionally click **Generate stakeholder explanations** to get plain-language summaries powered by Groq (free API)
5. Export a remediation plan as a `.md` file to share with your team

---

## The background detection fix

The trickiest part of building this was getting contrast checks right. The naive approach — walking up the layer tree to find a background — fails because in most button components, the colored rectangle and the label are **siblings**, not parent/child.

The fix: instead of tree traversal, search the entire component for solid-filled shapes whose bounding box geometrically contains the text node, then pick the smallest (tightest-fitting) one. This matches how the design actually renders, not how the layer tree happens to be structured.

---

## Test design system

The plugin was validated against a purpose-built design system with five planted accessibility issues:

- Low-contrast text on a disabled button
- A focus state visually identical to default
- A placeholder text color below threshold
- An error message at too-small a font size
- A close button below the 24×24px minimum target size

The plugin caught all five, plus one unplanted issue (a card text color just under the contrast threshold).

→ **[View the test design system on Figma](https://www.figma.com/design/oDGILVf2mf4QX9W6WxrIkT/Test-Design-System?node-id=0-1&t=IWcZv5SmxKAgz3n1-1)**

---

## AI layer

The AI feature is intentionally narrow. Contrast ratios, font sizes, and target dimensions are deterministic checks — putting an LLM on top of arithmetic would only make it slower and less reliable.

The one place AI earns its place: translation. `1.61:1 contrast ratio` means nothing to a product manager. The plugin uses Groq (Llama 3.3 70B) to turn each issue into a plain-language stakeholder explanation and a one-line fix — only when the user explicitly asks for it.

---

## Setup

```bash
npm install
npm run build
```

Then in Figma: **Plugins → Development → Import plugin from manifest** → select `manifest.json`

To use the AI explanation feature, get a free API key at [console.groq.com](https://console.groq.com) (no credit card required) and paste it into the Settings panel inside the plugin.

---

## Stack

- TypeScript → compiled to JS for Figma's plugin sandbox
- Figma Plugin API
- Groq API (Llama 3.3 70B) — optional, AI explanations only
- No external UI framework

---

## Why I built this

Existing accessibility plugins (Stark, Able) check contrast between two manually selected layers. They have no concept of component states, no awareness of design system structure, and return flat lists with no severity ranking.

This plugin audits at the component level — checking every variant automatically, comparing states against each other, and surfacing what matters most first.

Full case study: [Behance](https://www.behance.net/zuman989)
