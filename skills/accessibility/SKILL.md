---
name: accessibility
description: Web accessibility patterns — WCAG 2.2 AA compliance, semantic HTML, ARIA roles and attributes, keyboard navigation, focus management, screen reader support, color contrast, and reduced motion. Use when building or reviewing UI components, forms, modals, or interactive elements.
origin: custom
---

# Accessibility (a11y)

WCAG 2.2 AA patterns for semantic markup, ARIA, keyboard navigation, and screen reader support.

## When to Activate

- Building new UI components (buttons, modals, dropdowns, tabs, forms)
- Reviewing React JSX/TSX for accessibility issues
- Implementing focus management (modals, drawers, toast notifications)
- Adding keyboard navigation to custom interactive elements
- Checking color contrast or motion sensitivity
- Making your 3D viewer keyboard-accessible

## Core Principles

1. **Semantic HTML first** — use the correct element before reaching for ARIA
2. **ARIA supplements, doesn't replace** — broken HTML + ARIA is worse than no ARIA
3. **Every interactive element is keyboard reachable** — Tab, Shift+Tab, Enter, Space, Escape, arrow keys
4. **Visible focus indicator always** — never `outline: none` without a replacement
5. **Don't remove content from screen readers** unless it's genuinely decorative

## Semantic HTML

```tsx
// Bad: div soup
<div onClick={handleLogin} className="btn">Log in</div>

// Good: native button
<button type="button" onClick={handleLogin}>Log in</button>

// Navigation landmark
<nav aria-label="Main navigation">
  <ul><li><a href="/dashboard">Dashboard</a></li></ul>
</nav>

// Form with proper labels
<label htmlFor="email">Email address</label>
<input id="email" type="email" autoComplete="email" required />
// Never use placeholder as the only label — it disappears on input
```

## ARIA Essentials

```tsx
// Live regions for dynamic content
<div role="alert" aria-live="assertive">{errorMessage}</div>
<div role="status" aria-live="polite">{statusMessage}</div>

// Icon button — must have accessible name
<button aria-label="Close dialog" onClick={onClose}>✕</button>

// Associated description
<input id="password" type="password" aria-describedby="pwd-hint" />
<p id="pwd-hint">Must be at least 8 characters</p>

// Expanded state for toggles
<button aria-expanded={isOpen} aria-controls="menu" onClick={toggle}>Menu</button>
<ul id="menu" hidden={!isOpen}>...</ul>

// Loading state
<div aria-busy={isLoading} aria-live="polite">
  {isLoading ? <Spinner /> : <Content />}
</div>
```

## Focus Management — Modal

```tsx
function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first?.focus();
      }
    };

    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      {children}
    </div>
  );
}
```

## Return Focus After Modal Closes

```tsx
function useModalFocus(isOpen: boolean) {
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
    } else {
      triggerRef.current?.focus();
      triggerRef.current = null;
    }
  }, [isOpen]);
}
```

## Skip Navigation

```tsx
<a href="#main-content" className="skip-link">Skip to main content</a>
<main id="main-content" tabIndex={-1}>{/* page content */}</main>
```

```css
.skip-link {
  position: absolute;
  transform: translateY(-100%);
  transition: transform 0.2s;
}
.skip-link:focus { transform: translateY(0); }
```

## Screen Reader-Only Text

```css
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
  border-width: 0;
}
```

```tsx
<span className="sr-only">Loading, please wait</span>
<Spinner aria-hidden="true" />
```

## Color Contrast (WCAG AA)

| Element | Minimum Ratio |
|---|---|
| Normal text (< 18pt) | 4.5:1 |
| Large text (≥ 18pt or 14pt bold) | 3:1 |
| UI components and focus indicators | 3:1 |

Never rely on color alone to convey meaning — pair with icons or text labels.

## Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

```tsx
function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}
```

## 3D Viewer

```tsx
// Provide keyboard alternatives to mouse orbit controls
<section aria-label="3D model viewer">
  <canvas aria-hidden="true" />
  <div role="group" aria-label="View controls">
    <button onClick={rotateLeft}>Rotate left</button>
    <button onClick={rotateRight}>Rotate right</button>
    <button onClick={zoomIn}>Zoom in</button>
    <button onClick={zoomOut}>Zoom out</button>
    <button onClick={resetView}>Reset view</button>
  </div>
</section>
```

## Audit Checklist

- [ ] All images have `alt` (descriptive or `alt=""` for decorative)
- [ ] All form inputs have associated `<label>`
- [ ] All buttons have accessible names (text or `aria-label`)
- [ ] Tab order follows visual reading order
- [ ] Modals trap focus and return it on close
- [ ] Color contrast meets 4.5:1 for text, 3:1 for UI components
- [ ] Motion respects `prefers-reduced-motion`
- [ ] Custom components have appropriate ARIA roles and states
- [ ] Page has exactly one `<h1>` and heading levels don't skip
