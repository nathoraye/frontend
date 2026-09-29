---
name: West Vinyl Studio
description: Dark cutting-mat studio for designing and ordering custom vinyl and iron-on goods.
colors:
  registration-pink: "#FF1493"
  registration-pink-hover: "#ff4da6"
  void: "#0f111a"
  panel: "#181a25"
  mat: "#2a2e3c"
  float: "#1e2230"
  ink: "#e2e8f0"
  ink-strong: "#f1f5f9"
  ink-muted: "#94a3b8"
  hairline: "#1e293b"
  field: "#1e293b"
  apparel: "#10b981"
  apparel-hover: "#34d399"
  weeding-cyan: "#00FFFF"
  warning: "#fbbf24"
  danger: "#ef4444"
  notice-error: "#2a151c"
  notice-success: "#152a1c"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: "0.1em"
  headline:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "1.875rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.08em"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
    letterSpacing: "normal"
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.registration-pink}"
    textColor: "#000000"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.registration-pink-hover}"
    textColor: "#000000"
  button-tool-active:
    backgroundColor: "{colors.registration-pink}"
    textColor: "#ffffff"
    rounded: "{rounded.xl}"
    padding: "12px"
    size: "44px"
  button-secondary:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "32px"
  button-apparel:
    backgroundColor: "{colors.apparel}"
    textColor: "#000000"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  input-field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  chip-selected:
    backgroundColor: "{colors.registration-pink}"
    textColor: "#000000"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  card-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "16px"
---

# Design System: West Vinyl Studio

## Overview

**Creative North Star: "The Night Cutting Mat"**

The studio is a dark bench. The mat is where the knife will read the file. Panels around it hold tools, layers, and the order. Hot pink is the registration mark: it shows the active tool, the selected mode, and the action that buys the sticker. Emerald is reserved for the apparel purchase, so the two products do not share one button.

Density is high on purpose. This is an editor, not a brochure. Labels are small, uppercase, and tracked. Reading copy appears on the policy pages and inside checkout, in sentence case, at a normal body size. Depth comes from stacked surfaces (void, panel, mat, floating bar), not from soft cards.

The name of the north star is inferred from the implemented chrome. It is not a line the shop has published.

**Key Characteristics:**

- Dark void, darker panels, a slightly lighter cutting mat.
- One hot-pink accent for selection and the vinyl purchase.
- A separate emerald action for apparel.
- Uppercase tracked labels in the tool chrome; mono for prices, sizes, and policy titles.
- Flat panels with hairline borders. Shadows only on floating bars and the inspector edge.
- Touch targets in the tool dock stay at least 44px.

## Colors

The palette is a night bench plus a plotter's registration pink. A second saturated green exists only for buying apparel.

### Primary

- **Registration Pink** (`#FF1493`): Active tool, selected Design or Product Preview mode, vinyl buy button, inspector tab underline, focus of range inputs, and links' hover on the wordmark row. Hover moves to `#ff4da6`.

### Secondary

- **Apparel Green** (`#10b981`): The Buy Apparel button and the "cut ready" confirmation. Hover is `#34d399`. It is not a general success wash.

### Tertiary

- **Weeding Cyan** (`#00FFFF`): The weeding-box action in the object menu only. It marks a production aid, not a brand color.

### Neutral

- **Void** (`#0f111a`): App background, product-preview stage, jobs board, and policy pages.
- **Panel** (`#181a25`): Header, tool dock, inspector, product bar, and info cards.
- **Mat** (`#2a2e3c`): The 2D cutting surface behind the Fabric canvas.
- **Float** (`#1e2230`): Quick menu and in-canvas tool bars, usually at about 90–95% opacity.
- **Ink** (`#e2e8f0`): Default body and chrome text on the dark surfaces (Tailwind `slate-200`).
- **Muted ink** (`#94a3b8`): Secondary labels (`slate-400`). On the mat, prefer the lighter ink; muted gray fails more easily there.
- **Hairline** (`#1e293b`): Panel borders (`slate-800`).
- **Field** (`#1e293b` to `#334155`): Inputs and unselected chips. Checkout fields use Tailwind `gray-800` (`#1f2937`), close to the same role.

Notices use tinted slabs rather than the pink: error `#2a151c`, warning `#2a2415`, info `#15202a`, success `#152a1c`.

### Named Rules

**The Registration Pink Rule.** Pink marks one active thing and the vinyl purchase. It does not fill the page.

**The Two Purchases Rule.** Vinyl is pink. Apparel is emerald. Do not merge them into one generic checkout button.

**The Unused Violet Rule.** `theme-color` and the manifest name `#863bff`, but no studio surface uses it. Do not introduce violet as a second accent until that value is confirmed or removed.

## Typography

**Display Font:** The UI sans stack (with system-ui fallback). No webfont is loaded.
**Body Font:** The same sans stack.
**Label/Mono Font:** The UI monospace stack, for centimetres, garment sizes, prices, quantities, and policy-page titles.

**Character:** The chrome shouts in small caps. The policy pages read in a plain sentence. Mono means a measurement or a price, not a technical costume on ordinary buttons.

### Hierarchy

- **Display** (weight 900, 12–14px, tracking about 0.1em, uppercase): The wordmark in the header. "West Vinyl Studio" from the `sm` breakpoint, "WVS" below it.
- **Headline** (mono, 30px, pink): Page titles on policies, privacy, terms, and contact.
- **Title** (weight 700, 11px, uppercase, tracked): Inspector section labels and tab labels.
- **Body** (weight 400, 14px, line-height about 1.625): Policy and checkout explanations. Keep reading lines inside a `max-w-2xl` column on those pages.
- **Label** (weight 700, 10px, uppercase, tracked): Tool chrome, mode switch, buy buttons, and the cut-ready badge.

### Named Rules

**The Small Label Rule.** Editor chrome may be 10px and uppercase. Explanations, errors, and prices the customer must trust are at least 12px and may be sentence case.

**The Mono Is Data Rule.** Use monospace for sizes, money, and quantities. Do not set ordinary buttons in mono.

## Layout

The studio is a locked viewport (`100dvh`, no document scroll). A header sits on top. A 64px tool dock sits on the left. A 320px inspector sits on the right. The mat fills what remains.

Below 1024px both docks become overlays with a dim scrim. The header scrolls sideways rather than wrapping into a second row. Safe-area insets pad the shell.

Policy, success, cancel, and jobs pages leave the locked viewport and scroll as documents inside a narrow column (`max-w-2xl` for reading, full width for the jobs board).

Spacing rhythm in the chrome is 4, 8, 12, and 16px. The product-preview bar uses 8–12px gaps and wraps. Checkout stacks sections with 24px between groups.

## Elevation & Depth

Depth is tonal. The void is darkest, panels step up, the mat steps up again, and floating bars sit on top with a soft shadow. Surfaces at rest do not float.

### Shadow Vocabulary

- **Header rest** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.05)`): The top bar only.
- **Floating bar** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.25)`): Quick menu and in-canvas tool prompts.
- **Scrim lift** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.3)`): The mobile dock toggles.
- **Active tool** (`box-shadow: 0 10px 15px -3px rgb(131 24 144 / 0.4)`): The selected dock button. This is the one colored shadow, and it belongs to the active tool.
- **Inspector edge** (`box-shadow: -10px 0 30px rgb(0 0 0 / 0.05)`): Separates the right panel from the mat.

### Named Rules

**The Flat-By-Default Rule.** Panels and policy cards are flat, with a 1px hairline. A shadow means the thing is floating over the mat or pressing into it as the active tool.

## Shapes

Corners are gently curved and get rounder as the control gets more like a tool. Fields and document cards are 4px. Header buttons are 6px. Confirm buttons in modals are 8px. Dock tools, inspector groups, and the quick menu are 12px. Node-edit status and colour chips are pills. Colour swatches are circles with a 2px border that turns pink when selected.

Borders are 1px. The pink tab underline in the inspector is 2px and is a selection rule, not a card accent.

## Components

### Buttons

- **Shape:** 6px on the header and buy actions, 8px on modal confirms, 12px on dock tools.
- **Primary:** Registration pink, black label, 12px uppercase, 44px tall on Buy Sticker. Modal confirms use the same pink with white text, heavier padding, and a slight lift on hover. The header mode switch stays shorter so the bar does not grow.
- **Hover / Focus:** Pink hover is `#ff4da6`. Dock tools lighten to slate on hover. Focus is a 2px registration-pink ring, offset 2px.
- **Secondary:** Slate field, white or slate-200 label, used for Apply Design, Export SVG, and Reset place.
- **Apparel:** Emerald fill, black label. Do not restyle it as pink.

### Chips

- **Style:** Mode switch and view chips (Front, Back, Face, Wrap) sit in a slate-tinted group. Unselected text is slate-300. Selected fill is registration pink with black text.
- **State:** The cut-ready badge is a status chip: emerald when ready, amber when blocked, slate when it is only a warning.

### Cards / Containers

- **Corner Style:** 4px on policy and jobs cards. 12px on inspector groups and the cut-ready panel.
- **Background:** Panel `#181a25` for cards. Inset wells inside the inspector use void `#0f111a`.
- **Shadow Strategy:** None at rest. See Elevation.
- **Border:** 1px hairline.
- **Internal Padding:** 12px in the cut-ready panel, 16px in policy cards and inspector groups.

### Inputs / Fields

- **Style:** Dark field, 1px slate border, 4px corners, mono or sans at 12–14px.
- **Focus:** Range inputs use a pink accent. Buttons, links, selects, and text fields use a 2px registration-pink ring, offset 2px. Selection is pink with void text. The caret in fields is pink.
- **Error / Disabled:** Generate AI disables without a separate error style. Studio notices carry error, warning, info, and success above the shell.

### Navigation

The studio header is the only customer navigation: wordmark, an Info link to `/policies`, undo, redo, clear, cut-ready, Generate AI, the Design / Product Preview switch, and the inspector toggle. Info pages add a text row back to the studio, policies, privacy, terms, and contact. The jobs board is a separate tool and is not in this header.

### Tool dock

A 64px vertical rail. Each tool is a 44px rounded square. The active tool is pink, white icon, slightly scaled, with the pink shadow. Inactive icons are muted slate.

### Object menu

A floating bar near the selection. Icon buttons, 12px corners, float surface, hairline border. Pink marks trace, nodes, contour, and weld. Amber marks offset. Cyan marks the weeding box. Red marks delete.

### Checkout modal

A full-screen dark layer over the studio. It is a protected two-step task (options, then shipping and payment) and should stay a modal. Prices and the pay action live here. Do not redraw its payment behaviour when restyling the studio around it.

## Do's and Don'ts

### Do:

- **Do** keep the mat at `#2a2e3c`, panels at `#181a25`, and the void at `#0f111a`.
- **Do** use `#FF1493` for the active tool and the vinyl purchase, and `#10b981` for apparel.
- **Do** show money as AUD, including the shipping line the policies page already states.
- **Do** keep dock tools at least 44px on the short side.
- **Do** leave the jobs board off the customer header.

### Don't:

- **Don't** introduce a light theme for the studio. The work happens on a dark mat.
- **Don't** paint large areas registration pink.
- **Don't** use `#863bff` as an accent. It is only in the PWA theme color.
- **Don't** set explanatory copy at 10px. That size is for chrome labels.
- **Don't** restyle Stripe checkout, the order API, or the admin session from a visual pass.
