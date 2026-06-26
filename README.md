# A11y System Audit

A Figma plugin that scans design system components for WCAG AA accessibility issues while you're still in the file, not after a formal audit months later.

Designers don't have a good way to catch accessibility mistakes before they ship. Developers get linters and CI that complain the moment something's wrong. On the design side, problems usually surface in a formal audit, by which point the broken button has already been copied into forty screens. This plugin is an attempt to close that gap.

## What it checks

| Check | What it catches |
|---|---|
| Contrast | Text failing WCAG AA ratios (4.5:1 normal, 3:1 large text) |
| Focus state | Focus variants that look identical to default, invisible to keyboard users |
| Font size | Text below 12px |
| Touch target | Interactive elements under 24x24px (WCAG 2.2) |

The focus state check is the one existing tools like Stark and Able don't do. They check contrast between two layers you pick by hand, they have no concept of component states, so a button whose focus variant looks exactly like default will never get flagged. That's a silent keyboard navigation failure and it's what this plugin specifically looks for.

## How to use it

1. Open the plugin in any Figma file that has component sets
2. Click **Run audit**. It reads the component sets directly, no manual selection or frame-wrapping needed
3. Issues are listed by severity (High / Medium / Low), click any issue to jump straight to that layer in Figma
4. Optionally click **Generate stakeholder explanations** to get plain-language summaries via Groq (free API key, no credit card)
5. Export the full list as a `.md` remediation plan to share with your team

## Setup
npm install

npm run build

In Figma: Plugins > Development > Import plugin from manifest > select manifest.json

For the AI explanation feature, get a free key at console.groq.com. Paste it into the Settings panel inside the plugin (click "Settings" near the top to expand it). If that panel doesn't render for any reason, you can also paste the key directly into ui.html, look for the constant PASTE_YOUR_GROQ_KEY_HERE near the top of the script and replace it with your key.

## Test design system

Before writing any plugin code, I built a small design system and planted five known issues in it: low-contrast text on a disabled button, a focus state visually identical to default, a placeholder color below threshold, an error message at too small a font size, and a close button below the 24x24px minimum target size.

The plugin caught all five, plus one I hadn't planted, a card text color sitting just under the contrast threshold, which Stark had independently flagged too. Two tools landing on the same edge case was a good sign the math was right.

View the test design system on Figma: https://www.figma.com/design/oDGILVf2mf4QX9W6WxrIkT/Test-Design-System?node-id=0-1&t=IWcZv5SmxKAgz3n1-1

## A note on the AI layer

Almost none of this needs AI. Contrast is a formula, sizes are numbers against a threshold. The one place it earns its spot is translation "1.61:1 contrast ratio" means nothing to a product manager, but "users with low vision won't be able to read this button" does. So there's one button that takes the issues the plugin already found and asks an LLM for a plain-language explanation and a one-line fix per issue. One button, one job, sitting on top of an engine that works without it.

## Stack

- TypeScript, compiled for Figma's plugin sandbox
- Figma Plugin API
- Groq API / Llama 3.3 70B (optional, used only for AI explanations)

## Case study

Full write-up on the problem, the debugging process, and design decisions on Behance: https://www.behance.net/gallery/251715137/State-Aware-Accessibility-Checker-for-Figma
