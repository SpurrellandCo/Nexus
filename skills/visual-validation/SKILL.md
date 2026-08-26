---
name: visual-validation
description: Capture screenshots during and after UI implementation to visually validate that code changes match the intended design. Use when building UI, implementing design changes, or verifying layout after edits. Also use when the user says "check it looks right", "screenshot this", "validate visually", "does it look correct", "take a screenshot", "verify the UI", or "confirm the layout". Works with any local dev server. Pairs with ui-styling, design-system, page-cro, image-to-code-skill, and any coder agent doing frontend work.
metadata:
  version: 1.0.0
---

# Visual Validation

You are a visual QA specialist. Your job is to capture screenshots of UI after code changes and systematically validate that the implementation matches the intended design — catching layout breaks, spacing issues, colour problems, missing elements, and mobile rendering failures that code review alone misses.

---

## When to Run Visual Validation

Run after **any** of these:
- UI component created or modified
- CSS/Tailwind changes applied
- Layout or spacing changes
- Copy updated in a page
- New page or route added
- Design system tokens changed
- A/B test variant implemented
- Image-to-code conversion complete

Do not wait until the end. Screenshot **after each meaningful change**, not just at the end.

---

## Step 1 — Detect the Dev Server

Before taking any screenshot, confirm the dev server is running.

```bash
# Check for common dev server ports
lsof -i :3000 | grep LISTEN || \
lsof -i :3001 | grep LISTEN || \
lsof -i :5173 | grep LISTEN || \
lsof -i :8080 | grep LISTEN
```

If nothing is running, start it:
```bash
# Next.js / React
npm run dev &
sleep 3

# Vite
npx vite &
sleep 2
```

Note the port for screenshot commands.

---

## Step 2 — Capture the Screenshot

Use the first method that works, in priority order:

### Method 1 — Playwright CLI (most reliable, full render)
```bash
npx playwright screenshot \
  --browser chromium \
  http://localhost:3000/[path] \
  /tmp/screenshot-$(date +%s).png

# Mobile viewport
npx playwright screenshot \
  --browser chromium \
  --viewport-size 390,844 \
  http://localhost:3000/[path] \
  /tmp/screenshot-mobile-$(date +%s).png
```

### Method 2 — Puppeteer one-liner
```bash
node -e "
const p = require('puppeteer');
(async () => {
  const b = await p.launch();
  const pg = await b.newPage();
  await pg.setViewport({width:1440,height:900});
  await pg.goto('http://localhost:3000/[path]', {waitUntil:'networkidle0'});
  await pg.screenshot({path:'/tmp/screenshot.png',fullPage:true});
  await b.close();
})();"
```

### Method 3 — macOS screencapture (no headless browser needed)
Open the page in the default browser first, then:
```bash
open http://localhost:3000/[path]
sleep 2
screencapture -x /tmp/screenshot.png
```

### Method 4 — curl + save (for API/data validation, not visual)
```bash
curl -s http://localhost:3000/[path] -o /tmp/page.html
```

---

## Step 3 — Read and Validate the Screenshot

Use the Read tool to load the screenshot image, then validate against the checklist below.

```
Read: /tmp/screenshot.png
```

### Visual Validation Checklist

**Layout**
- [ ] Elements are in the correct position (hero above fold, nav at top)
- [ ] No elements overlapping unexpectedly
- [ ] Correct spacing between sections
- [ ] Content doesn't overflow its container
- [ ] Grid/flex layout renders as intended

**Typography**
- [ ] Correct font family rendering
- [ ] Heading hierarchy is visible (h1 > h2 > h3)
- [ ] Text is readable (no white on white, no tiny text)
- [ ] Line length comfortable (not full-width on large screens)

**Colour**
- [ ] Brand colours match spec
- [ ] Sufficient contrast (text on background)
- [ ] No hardcoded colours that missed token replacement
- [ ] Dark mode (if applicable) — take a second screenshot

**Components**
- [ ] Buttons render with correct variant (primary, secondary, ghost)
- [ ] Forms have visible labels and correct input styling
- [ ] Images/icons load (no broken image icons)
- [ ] Interactive states visible if testable (hover, focus outlines)

**Responsive**
- [ ] Desktop (1440px) — no horizontal scroll
- [ ] Tablet (768px) — layout adapts correctly
- [ ] Mobile (390px) — no overlapping elements, tap targets adequate

**Content**
- [ ] All copy is correct and in the right place
- [ ] No placeholder text (Lorem ipsum) in production paths
- [ ] No raw variable names visible (e.g. `{{user.name}}`)

---

## Step 4 — Document What You Found

After reading the screenshot, produce a validation report before deciding whether to iterate:

```
## Visual Validation Report

Screenshot: /tmp/screenshot-[timestamp].png
URL: http://localhost:3000/[path]
Viewport: [desktop|mobile]

### Pass
- [element/aspect that looks correct]
- [element/aspect that looks correct]

### Fail — needs fix
- [specific issue — e.g. "CTA button too close to edge on mobile, needs mx-4"]
- [specific issue — e.g. "Hero text overlapping nav on scroll"]

### Decision
[Fix issues before proceeding | Acceptable — move to next step]
```

---

## Step 5 — Iterate If Needed

If validation fails, fix the specific issues identified, then re-screenshot and re-validate. Do not move to the next task until the screenshot passes.

**Efficient iteration loop:**
```
Edit file → Screenshot → Read → Validate → [pass: done | fail: edit again]
```

Do not take more than 3 iterations without surfacing the issue to the user. If something isn't resolving after 3 attempts, show the screenshot path and the validation report and ask for direction.

---

## Saving Screenshots for Reference

Save key screenshots for comparison across iterations:

```bash
# Save with meaningful name
cp /tmp/screenshot.png ~/.claude/projects/[project]/screenshots/[feature]-[date].png

# Before/after comparison
cp /tmp/screenshot.png /tmp/before.png
# [make changes]
# [take new screenshot as /tmp/after.png]
# Read both and compare
```

---

## Integration With Other Skills

This skill is called **at the end of every agent handoff** that touches UI. The brief format used by ui-styling, design-system, page-cro, signup-flow-cro, and onboarding-cro all include a "Done when" criterion that references visual validation.

**What agents should do after any UI change:**
1. Implement the change
2. Run the dev server check (Step 1)
3. Capture screenshot (Step 2)
4. Read and validate (Step 3)
5. Report pass/fail (Step 4)
6. Iterate if needed (Step 5)

---

## Related Skills

- **ui-styling**: For styling changes that need visual confirmation
- **design-system**: For component validation
- **page-cro**: For landing page changes
- **image-to-code-skill**: Validate output matches the source image
- **ui-ux-pro-max**: For wireframe-to-implementation validation
