---
name: emil-kowalski
description: Use when the user wants to apply Emil Kowalski's design philosophy — subtle motion, deliberate spring animations, micro-interactions, high-contrast light surfaces, soft tactile components, or the restrained-but-alive aesthetic seen in tools like Sonner, Vaul, and cmdk. Activate for requests about "Emil Kowalski style", "make it feel alive", "spring animations", "drawer/toast/command design", or designing minimal-but-crafted interactive components.
---

# Emil Kowalski Design Philosophy

Emil Kowalski (@emilkowalski_ on X) is a designer/engineer known for components that feel **tactile, alive, and inevitable** — not flashy. His work includes:
- **Sonner** — toast notification library
- **Vaul** — drawer component
- **cmdk** — command menu component
- **pqoqubbw/icons** — minimal animated icons

Study his work at: https://emilkowalski.com and the libraries above.

---

## Core Philosophy

### 1. Motion is meaning, not decoration
Every animation communicates state change. If removing an animation doesn't hurt the UX, it shouldn't exist.

- Use **spring physics**, never linear or cubic-bezier alone for interactive elements
- Preferred spring: `stiffness: 300–500, damping: 25–35` (snappy, not bouncy)
- Entry: element starts already partially visible — never appear from nothing
- Exit: collapse into where it came from (drawer slides down, toast slides out the side it came from)
- Duration sweet spot: **200–350ms** for most interactions

### 2. Restraint over expression
- **One animated element at a time** — not cascading entrance animations
- No gradient text, no color splash on every surface
- Background stays neutral (white / near-white / very dark), accent color touches only the most important action
- Typography does the heavy lifting — weight contrast (`400` body, `600`/`700` for emphasis)

### 3. Surface tactility
Components should feel like **physical objects**:
- Drawers have inertia — they resist and snap
- Buttons depress slightly on press (`scale(0.97)` + subtle shadow reduction)
- Hover states are **barely visible** — just enough to confirm interactivity
- Focus rings are custom, never the browser default

### 4. Spacing discipline
- Use **4px base grid** religiously
- Internal padding: `12–16px` for cards/components
- Between related elements: `4–8px`
- Between sections: `24–40px`
- Never mix arbitrary pixel values — use a scale (4, 8, 12, 16, 20, 24, 32, 40, 48)

### 5. Color restraint
- **Light mode**: `#ffffff` or `#fafafa` base, `#09090b` text, `#71717a` muted, `#e4e4e7` border
- **Dark mode**: `#09090b` base, `#fafafa` text, `#52525b` muted, `#27272a` border
- One accent color max — used only on primary CTA and active states
- Avoid full-black (`#000`) — use `#09090b` (zinc-950) for softer feel
- Shadows: `0 1px 2px rgba(0,0,0,0.05)` + `0 0 0 1px rgba(0,0,0,0.05)` — stacked, subtle

---

## Component Patterns

### Toast (Sonner-style)
```css
/* Appears from bottom, stacks with scale offset */
.toast {
  transform: translateY(0) scale(1);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05);
  border-radius: 8px;
  padding: 12px 16px;
  background: white;
  border: 1px solid #e4e4e7;
}
/* Queued toasts: translateY(+Npx) scale(0.9 - N*0.05) — creates depth stack */
```

### Drawer (Vaul-style)
- Always starts partially visible on mobile (handle + peek of content)
- Drag-to-dismiss with inertia — `velocity` matters, not just distance
- Snap points, not just open/close binary
- Overlay: `rgba(0,0,0,0.4)` — not pure black

### Command Menu (cmdk-style)
- Input always focused on open, no animation delay
- Items highlight on hover with `background: #f4f4f5` — not a color accent
- Selected item: `background: #f4f4f5`, font-weight stays the same
- Search clears on close — fresh every open
- Max height: `~400px`, overflow scroll with fade gradient at bottom

### Button
```css
.btn {
  height: 36px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid #e4e4e7;
  background: white;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  transition: background 120ms, box-shadow 120ms, transform 100ms;
}
.btn:hover { background: #fafafa; }
.btn:active { transform: scale(0.97); box-shadow: none; }
/* Primary: background: #18181b; color: white; border-color: #18181b; */
```

---

## What to Avoid (Anti-patterns)

- ❌ Gradient backgrounds or gradient text
- ❌ Multiple accent colors
- ❌ Entrance animations on every section (parallax, staggered cards)
- ❌ Bouncy springs (`damping < 20` feels playful, not crafted)
- ❌ `border-radius > 12px` on large surfaces
- ❌ Emoji as icons — use a real icon system (Lucide, Radix Icons, or authored SVG)
- ❌ Box shadows as decoration — only for elevation/depth
- ❌ `opacity: 0.5` for disabled states — use actual disabled styles
- ❌ Color for hierarchy — use size and weight instead

---

## CSS Spring Animation (Vanilla JS / CSS)

For CSS-only spring approximation:
```css
/* Snappy spring feel using cubic-bezier */
--spring-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);   /* slight overshoot */
--spring-snappy: cubic-bezier(0.23, 1, 0.32, 1);        /* ease out expo */
--spring-enter:  cubic-bezier(0.21, 1.02, 0.73, 1);     /* for entrances */

/* Use spring easing on transform, never on layout properties */
transition: transform 250ms var(--spring-snappy),
            opacity   200ms ease;
```

For real spring physics, use **Motion** (motion.dev) — Emil's preferred animation library.

---

## Application to This Project (ReSell AI)

When applying Emil Kowalski principles to the ReSell AI dark-navy theme:

1. **Toast** — already exists; upgrade to Sonner-style stacking with `translateY` + `scale` depth
2. **Panels** — add `box-shadow: 0 0 0 1px rgba(255,255,255,0.05)` inner ring for depth on dark
3. **Buttons** — add `scale(0.97)` on `:active`, remove gradient if not the primary CTA
4. **Output cards / Insight widgets** — hover: `border-color` transition only, no bg color change
5. **Loading skeleton** — use shimmer (`background-position` animation), not opacity pulse
6. **Sidebar active state** — subtle `background: rgba(255,255,255,0.06)`, not a colored fill
7. **Input focus** — `box-shadow: 0 0 0 2px var(--amber)` ring, border stays same color

---

## References

- https://emilkowalski.com
- https://sonner.emilkowalski.com
- https://vaul.emilkowalski.com
- https://cmdk.paco.me
- https://github.com/emilkowalski (open source components)
- https://x.com/emilkowalski_ (design notes and updates)
