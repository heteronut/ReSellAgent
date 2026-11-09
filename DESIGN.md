---
name: ReSell AI
description: Ruang kerja reseller Indonesia untuk menilai barang dan menyiapkan penjualan.
colors:
  primary: "#087F83"
  navy: "#173D4A"
  navy-hover: "#27656A"
  amber: "#DCA835"
  canvas: "#F3F6F4"
  surface: "#FFFFFF"
  surface-subtle: "#F7F9F7"
  text: "#19323B"
  muted: "#61777A"
  border: "#DFE7E2"
  success: "#28744F"
  danger: "#B84D46"
  violet: "#675C91"
  dark-canvas: "#111B20"
  dark-surface: "#18262B"
  dark-text: "#EDF4EF"
  dark-primary: "#68C1B5"
  dark-navy: "#285052"
  dark-amber: "#E6B64B"
typography:
  body:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
  label:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
  action:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "14.4px"
    fontWeight: 600
    lineHeight: 1.5
  compact-action:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "12.8px"
    fontWeight: 600
    lineHeight: 1.25
rounded:
  xs: "8px"
  sm: "10px"
  md: "12px"
  lg: "16px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "30px"
components:
  button-primary:
    backgroundColor: "{colors.navy}"
    textColor: "#FFFFFF"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "13px 24px"
  button-primary-hover:
    backgroundColor: "{colors.navy-hover}"
    textColor: "#FFFFFF"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.navy}"
    typography: "{typography.compact-action}"
    rounded: "{rounded.xs}"
    padding: "9px 14px"
  input:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.text}"
    rounded: "{rounded.xs}"
    padding: "10px 14px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
---

# Design System: ReSell AI

## Overview

**Creative North Star: "Meja Kerja Tepercaya"**

ReSell AI is a distinct, dependable workbench for independent resellers. Its interface is practical and direct, with a recognizable teal-and-navy foundation and a warm amber signature. The design should feel unique and extraordinary through confident hierarchy, clear grouping, and considered interaction details, not through novelty that slows down everyday work.

The desktop experience pairs familiar category navigation with a focused input-and-result workspace. Indonesian labels, Rupiah-oriented workflows, and a responsive layout keep the interface grounded in local reseller work. Light and dark themes preserve the same hierarchy and color roles. Marketplace identities and logos are not visual references.

**Key Characteristics:**
- A trustworthy navy frame with teal interaction cues and amber emphasis.
- Clear, information-dense panels designed for repeated operational use.
- Direct Indonesian copy and predictable controls across desktop and mobile.

## Colors

The palette balances fresh green-teal, dependable blue-green navy, quiet neutral surfaces, and a warm yellow-amber accent. Dark mode shifts the surfaces and supporting colors while retaining the same role hierarchy.

### Primary
- **Fresh Teal** (`#087F83`): Main light-theme accent for interactive emphasis and brand cues.
- **Trusted Navy** (`#173D4A`): Primary action and the structural light-theme color.
- **Deep Teal-Navy** (`#102D38`): Sidebar foundation in the light theme.

### Secondary
- **Trade Amber** (`#DCA835`): Brand mark and selective emphasis; use sparingly so important details remain easy to spot.
- **Market Teal** (`#287D8C`): Informational and chart accents.

### Tertiary
- **Measured Violet** (`#675C91`): Distinct secondary workflow accent, including Instagram actions.
- **Reseller Green** (`#28744F`): Success and positive price-evaluation action.
- **Warm Rose** (`#B84D46`): Error and destructive-state accent.

### Neutral
- **Soft Green-Gray Canvas** (`#F3F6F4`): Light-theme page background.
- **Clean Surface** (`#FFFFFF`): Light-theme panels and controls.
- **Quiet Surface** (`#F7F9F7`): Recessed fields and secondary surface areas.
- **Ink Teal** (`#19323B`): Main light-theme text.
- **Muted Teal-Gray** (`#61777A`): Supporting text and placeholders.
- **Soft Sage Border** (`#DFE7E2`): Light-theme separators and control borders.
- **Night Canvas** (`#111B20`) and **Night Surface** (`#18262B`): Dark-theme page and panel surfaces.
- **Pale Mint Text** (`#EDF4EF`) and **Bright Teal** (`#68C1B5`): Dark-theme text and primary accent.

**The Role-First Color Rule.** Color indicates hierarchy or state. Keep amber selective, and do not rely on color alone to communicate status.

## Typography

**Display Font:** Poppins (with `system-ui, sans-serif` fallback)

**Body Font:** Poppins (with `system-ui, sans-serif` fallback)
**Label Font:** Poppins (with `system-ui, sans-serif` fallback)

**Character:** Rounded, highly legible sans-serif typography supports quick scanning without making the workbench feel clinical. Use weight and spacing to distinguish hierarchy rather than introducing a second display face.

### Hierarchy
- **Display** (700, 30-36px): Reserved for prominent product or feature headings when needed.
- **Headline** (700, 20px, 1.25 line-height): Panel titles and primary section headings.
- **Title** (600-700, 16px): Subsection and card titles.
- **Body** (400, 15px, 1.5 line-height): Default reading and input text; use 16px on narrow screens.
- **Label** (600, 12px): Form labels, navigation group labels, and compact metadata.

**The Scan-First Type Rule.** Keep field labels and actions explicit; avoid decorative display treatments that compete with product data.

## Layout

The desktop shell uses a fixed 272px sidebar; the workspace fills the remaining viewport width without extending beneath the menu. The main workspace follows one full-width task sequence: input, AI answer, then any statistical or feature-result panels. A 20px gap separates these groups, and content padding scales from 20px to 40px. The AI answer panel stays in normal document flow and grows with its content so it cannot cover statistics or other results below it.

At 960px and below, navigation becomes an off-canvas sidebar under a 64px top bar, and content spans the viewport. At 480px and below, input grids collapse to one column, panel padding tightens, and body text increases to 16px. Preserve the 44px minimum target height for primary controls and mobile navigation actions.

The spacing rhythm uses 8px, 12px, 16px, 24px, and 30px tokens, with 14px and 20px local gaps where the current form and workspace grids need them.

## Elevation & Depth

Depth is layered and restrained. Surface color and fine borders do most of the structural work; shadows clarify panel hierarchy and a few interactive states rather than making every control appear raised. Dark mode uses deeper, softer shadows.

### Shadow Vocabulary
- **Card** (`0 2px 8px rgba(22,48,54,0.06)`): Resting panel separation in the light theme.
- **Raised** (`0 8px 24px rgba(22,48,54,0.12)`): Emphasized controls and active surfaces.
- **High** (`0 12px 32px rgba(22,48,54,0.14)`): Stronger separation where a surface needs extra depth.
- **Dark Card** (`0 2px 8px rgba(0,0,0,0.18)`): Resting panel separation in dark mode.
- **Dark Raised** (`0 8px 24px rgba(0,0,0,0.22)`): Emphasized dark-theme surfaces.

**The Surface-First Depth Rule.** Prefer tonal surface shifts and borders; reserve shadows for meaningful hierarchy.

## Shapes

The shape language is softly rounded and consistent with compact operational controls. Use 8px for small controls, 10px for inset notices, 12px for panels and primary actions, and 16px for larger groupings. Borders are thin and low-contrast at rest, with a clear teal focus outline or border shift. Avoid pill-shaped controls unless the element is a compact status chip.

## Components

Components should feel clear and confident, with feedback that is visible but restrained.

### Buttons
- **Shape:** 12px radius for primary actions; 8px for compact secondary actions.
- **Primary:** Trusted Navy (`#173D4A`) with white text, 13px 24px padding, 600 weight.
- **Variants:** Keep feature-specific green, teal, violet, and navy actions semantically consistent with their feature; do not make every action amber.
- **Hover / Focus:** Shift to the darker/lighter role token as appropriate. All interactive controls use the shared 3px `:focus-visible` outline with 2px offset.
- **Active / Disabled:** A brief scale response is acceptable for active state; disabled controls remain clearly subdued and non-interactive.

### Cards / Containers
- **Corner Style:** 12px for panels, 16px for larger grouped surfaces.
- **Background:** White in light mode, deep blue-green surfaces in dark mode.
- **Shadow Strategy:** Use the card shadow token with a 1px border; keep the panel content legible and uncluttered.
- **Internal Padding:** 20-24px for panel headers and desktop forms; 16px on narrow mobile screens.

### Inputs / Fields
- **Style:** Recessed surface, 1.5px border, 8px radius, and 10px 14px padding.
- **Focus:** Teal border and a 3px focus halo; focused fields return to the main surface color.
- **Error / Disabled:** Use the semantic error color and explicit text or disabled state, not color alone.
- **Touch:** Keep inputs at least 44px tall; use 16px text on narrow screens to avoid mobile zoom.

### Navigation
- **Desktop:** Fixed navy sidebar with grouped Indonesian labels, 44px minimum nav items, and a distinct active surface.
- **Mobile:** Off-canvas navigation controlled from the top bar; close it after selection and keep hidden items out of keyboard navigation.
- **State:** Use active, hover, and current-page semantics as well as color.

### Feature Tabs
- Use compact, bordered tabs on a quiet surface. The active tab uses the navy action color and white text; preserve a visible focus ring.

### Product Handoff
- Present product details as a softly tinted inline notice with a clear action. Populate only empty target fields; existing user input always wins.

## Do's and Don'ts

### Do:
- **Do** keep product actions and field labels in clear, concise Indonesian.
- **Do** use navy for dependable structure, teal for interaction, and amber as a selective brand accent.
- **Do** preserve the light/dark role mapping and the mobile one-column workflow.
- **Do** maintain readable text, visible focus, and minimum 44px touch targets.
- **Do** keep product handoff non-destructive by filling only blank destination fields.

### Don't:
- **Don't** imitate the visual identity, logo, or signature palette of any marketplace.
- **Don't** use amber as a large-area background or as the default color for every action.
- **Don't** add decorative gradients, excessive shadows, or motion that obscures product data.
- **Don't** communicate status through color alone or reduce keyboard focus visibility.
