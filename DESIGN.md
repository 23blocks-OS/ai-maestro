---
name: AI Maestro Docs
description: Municipal wayfinding for the public docs site at aimaestro.sh.
colors:
  ink: "#1c1917"
  ink-pressed: "#000000"
  ink-soft: "#3f3c38"
  paper: "#f7f6f4"
  sheet: "#ffffff"
  line: "#e3e0db"
  line-strong: "#c8c4be"
typography:
  display:
    fontFamily: "Figtree, \"Segoe UI\", sans-serif"
    fontSize: "clamp(2.4rem, 5vw, 4.25rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Figtree, \"Segoe UI\", sans-serif"
    fontSize: "clamp(2.15rem, 4vw, 3.25rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Figtree, \"Segoe UI\", sans-serif"
    fontSize: "1.65rem"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Figtree, \"Segoe UI\", sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Figtree, \"Segoe UI\", sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1
rounded:
  control: "6px"
  command: "8px"
spacing:
  header: "4.25rem"
  gutter: "1.25rem"
  column: "1.5rem"
  section: "2.75rem"
  tight: "0.45rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 1rem"
    height: "2.75rem"
  button-primary-hover:
    backgroundColor: "{colors.ink-pressed}"
    textColor: "{colors.sheet}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 1rem"
    height: "2.75rem"
  button-menu:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 0.85rem"
    height: "2.75rem"
  command:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.command}"
    padding: "0.45rem 0.45rem 0.45rem 1rem"
  code-sample:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    padding: "0.9rem 1rem"
  place:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink-soft}"
    padding: "0.45rem 1.25rem"
  nav-link:
    textColor: "{colors.ink}"
---

# Design System: AI Maestro Docs

## Overview

**Creative North Star: "Municipal wayfinding"**

This file is the visual system for the public docs site in `docs/`, served as aimaestro.sh. PRODUCT.md describes the person who runs the dashboard at localhost:23000. That dashboard is a different surface. A later change to the app does not inherit this sheet as the app theme.

The site reads as a wayfinding sheet. The ground is warm paper. White is the sheet that sits on it: the masthead, the place line, the command, the code sample, and the home footer. Ink is charcoal. Type is Figtree. Regions meet on a gray hairline. The constellation mark sits in the masthead, taken from the existing file. The section you are in is heavier type plus a hairline. A command is a ruled row with the word Copy.

Guide pages (`body.docs-legacy`) and the long-form assistant page (`body.docs-read`) keep their articles inside this frame: the same masthead, the same place line, the same ink and type. The article already on the one-computer page stays there. The frame is what a new docs surface copies.

**Key Characteristics:**

- Warm paper ground, with white sheets for the masthead, place line, command, code sample, and home footer
- Figtree for the frame and the prose; ui-monospace for code
- One-pixel hairlines; the current section is heavier type plus an inset charcoal rule
- A 68ch reading column and a 60rem directory
- Copy is a charcoal button on the command row; the designed motion is that button’s label
- The existing constellation file, shown at 28px, is the mark
- Light appearance only (`color-scheme: light`)

**The Docs Sheet Rule.** This system is the public docs site in `docs/` (aimaestro.sh). It is not the theme of the localhost dashboard.

## Colors

The palette is warm and nearly neutral. Charcoal does the work of an accent: text, links, the filled button, focus, and the current-section rule. The only hues outside that range live inside the constellation drawing.

### Primary

- **Charcoal Ink** (#1c1917): Body text, links, the filled Copy button, the focus outline, the selection background, and the current-section hairline. Declared as `--ink`, and again as `--focus`.
- **Pressed Black** (#000000): The hover fill of the filled button, and only that.

### Neutral

- **Warm Paper** (#f7f6f4): The page ground (`--paper`), the scrollbar track, and the `theme-color` on the home page. Legacy tinted fills are painted back to this ground.
- **Sheet White** (#ffffff): The masthead, the place line, the command row, the code sample, and the home footer (`--sheet`). Selected text uses it on charcoal.
- **Soft Charcoal** (#3f3c38): Secondary text (`--ink-soft`): the place line, directory descriptions, the clipboard fallback, the legal line, and the Ecosystem link.
- **Hairline** (#e3e0db): The 1px edges of the masthead, place line, directory rows, code sample, and home footer (`--line`).
- **Strong Hairline** (#c8c4be): The command border, the Menu button border, and the scrollbar thumb (`--line-strong`).

**The Hairline Rule.** A region is separated by a 1px line. The section you are in is weight 650 and an inset 1px charcoal rule. A colored pill is not a state.

**The Mark File Rule.** `docs/logo-constellation.svg` keeps the blue and violet already drawn in that file. Those hues are not tokens, and new surfaces do not pick them up as accents.

## Typography

**Display Font:** Figtree (with Segoe UI, then sans-serif)
**Body Font:** Figtree (with Segoe UI, then sans-serif)
**Label/Mono Font:** Figtree for labels and controls; ui-monospace (with SFMono-Regular, Menlo, Consolas, then monospace) for code

**Character:** One roman variable face, self-hosted at `docs/fonts/Figtree-wght.ttf` under the SIL Open Font License (`docs/fonts/OFL.txt`), axis 400–700, `font-display: swap`. Titles are large, tight, and set at weight 600. Code is the platform monospace, a step smaller than the prose.

### Hierarchy

- **Display** (600, clamp(2.4rem, 5vw, 4.25rem), line-height 1.08, letter-spacing -0.035em): The home title. It wraps inside 12ch.
- **Headline** (600, clamp(2.15rem, 4vw, 3.25rem), line-height 1.08, letter-spacing -0.035em): The guide quickstart title. A long-form page title uses the same weight and tracking at clamp(2rem, 4vw, 3rem).
- **Title** (600, 1.65rem, line-height 1.08, letter-spacing -0.035em): Section headings on the sheet and in the directory. The space above them is 2.75rem.
- **Group** (650, 1.15rem, letter-spacing -0.02em): Directory group headings such as Guides, Operate, and Reference. Line-height stays the body 1.55.
- **Body** (400, 1.0625rem, line-height 1.55): Prose. The opening lede is 1.125rem and wraps at 62ch. The column wraps at 68ch.
- **Label** (600, 0.95rem, line-height 1): Copy and the Menu button. Footer group headings are the same size at weight 650. The place line is 0.92rem in Soft Charcoal. Masthead links are 0.98rem, and the current one is weight 650. The wordmark is 1.05rem, weight 600, letter-spacing -0.03em. The legal line is 0.85rem.
- **Code** (ui-monospace, 0.92rem in a command, 0.9rem in a sample): One line in the command row until the narrow layout, where it wraps.

**The One Face Rule.** Figtree carries prose, navigation, and controls. Code uses ui-monospace. Syne, DM Sans, and JetBrains Mono remain named inside old guide pages and are not this ramp.

**The Tight Title Rule.** A frame title is weight 600 and tracks at -0.035em, with no eyebrow above it.

## Layout

The page is a sticky masthead over a column. The masthead is at least 4.25rem tall, padded 0.65rem 1.25rem, and stays at z-index 30. The gutter is 1.25rem, so a column is `min(measure, calc(100% - 2.5rem))`. Prose measure is 68ch. The directory and the home footer’s inner measure are 60rem. Scroll padding clears the masthead plus 1rem.

The home page is the install sheet, with 3.25rem of space above the title, then the directory. A guide page puts a place line under the masthead and a quickstart band under that; from 900px up the band is at least `calc(100vh - 6.5rem)` tall and centers on the vertical axis. A long-form page uses the same 68ch column, padded 2.5rem 0 4rem. The home footer is three columns, 1.4fr 1fr 1fr, with a 2rem gap, on the white sheet.

At 720px and below, the masthead shows Menu, the links stack full width with a hairline between them and a 2.75rem target, the Ecosystem link loses its push to the end, and the directory and the home footer become one column. The command row stacks, and the command wraps.

**The Measure Rule.** Prose stays in 68ch. The directory stays in 60rem. The gutter stays 1.25rem.

## Elevation & Depth

The sheet is flat. There is no drop shadow. A white region on the paper ground, closed by a hairline, is the depth model. The skip link, once focused, stacks above the masthead at z-index 40. Shadow utilities on the kept guide articles are cleared.

### Shadow Vocabulary

- **Current section** (`box-shadow: inset 0 -1px 0` Charcoal Ink): The rule under the masthead link for the section you are in. It is a hairline, not a lift.

**The Flat Sheet Rule.** Surfaces are flat. The only box-shadow in the frame is the inset 1px rule under the current masthead link.

## Shapes

Corners are slight on controls and square on text regions. Copy and Menu are 6px. The command row is 8px. Code samples, directory rows, and the masthead edge are square. The mark is the existing constellation, circles joined by lines, shown at 28×28.

**The Square-Enough Rule.** Interactive controls use a 6px radius. The command row uses 8px. Text regions and rules stay square.

## Components

### Buttons

Copy is the filled control. Menu is the quiet control, and it appears from 720px down.

- **Shape:** Slightly rounded (6px).
- **Primary:** Charcoal fill, sheet-white type, weight 600 at 0.95rem with line-height 1, padding 0 1rem, min-height 2.75rem, and no border. The label is the word Copy.
- **Hover / Focus:** Hover fills Pressed Black. Focus is a 2px charcoal outline, 3px outside the control, from `:focus-visible`. A successful copy sets the label to Copied for 2.4s. When the clipboard is blocked, the command is selected and the label reads Selected for 2.4s, then returns to Copy.
- **Menu:** Sheet fill, charcoal type, a 1px strong hairline, padding 0 0.85rem, the same 2.75rem height and 6px radius. It opens the stacked links, and Escape or a link closes them.

### Navigation

The masthead is a white bar with a bottom hairline. The mark is `docs/logo-constellation.svg` at 28×28, then the wordmark “AI Maestro”. Links are charcoal at 0.98rem and underline on hover, offset 0.22em. The current section is weight 650 with the inset hairline and no underline. Ecosystem is Soft Charcoal and sits at the far end of the row; under 720px it stacks with the others. The skip link rests above the page, translated up by 150%, and lands at the top-left in charcoal on white when focused.

### Place line

On guide and long-form pages, directly under the masthead: sheet white, a bottom hairline, 0.92rem Soft Charcoal, padding 0.45rem 1.25rem. The section link is charcoal. The separator is a middle dot.

### Command row

The signature. White sheet, a 1px strong hairline, 8px radius, padding 0.45rem 0.45rem 0.45rem 1rem, gap 0.75rem. The command is 0.92rem ui-monospace, one line, scrolling sideways until the narrow layout wraps it. Copy sits at the end. A following line in Soft Charcoal at 0.95rem says to select the command when Copy cannot use the clipboard.

**The Command Row Rule.** A command is one ruled row: the command in monospace, Copy as the charcoal button. A blocked clipboard selects the command.

### Directory

A list of pages. Each row has a bottom hairline, the list opens with a top hairline, and the row is padded 0.8rem 0. Two columns: `minmax(11rem, 16rem)` and the rest, with a 1.5rem column gap. The link is weight 600 and underlines on hover, offset 0.18em. The description is Soft Charcoal. At 720px the row is one column.

### Code sample

A square white block with a 1px hairline, padding 0.9rem 1rem, 0.9rem ui-monospace. The line above it is weight 650. It is an example set apart from a command you copy.

### Home footer

White sheet, a top hairline, padding 2.5rem 1.25rem 2rem. Three columns, then a legal line at 0.85rem Soft Charcoal under another hairline. This footer is the one on the home page.

## Do's and Don'ts

### Do:

- **Do** paint the ground Warm Paper and the masthead, place line, command, code sample, and home footer Sheet White.
- **Do** mark the current section with weight 650 and an inset 1px Charcoal Ink rule.
- **Do** set frame titles in Figtree at weight 600 and letter-spacing -0.035em, inside a 68ch column, with code in ui-monospace.
- **Do** use `docs/logo-constellation.svg` at 28×28. Leave the file as it is.
- **Do** keep Copy at least 2.75rem tall, with a 2px Charcoal Ink focus outline offset 3px.
- **Do** build a new docs index as the sheet plus the directory, and leave a kept guide article inside the frame.

### Don't:

- **Don't** use this sheet as the localhost dashboard theme.
- **Don't** use a drop shadow, a colored pill, or a chromatic accent as a state.
- **Don't** put an eyebrow above a frame title.
- **Don't** reuse the kept articles’ card grids, pills, emoji, or social glyphs as components.
- **Don't** add a generated raster to the site. Files under `.impeccable/review` and `/opt/cursor/artifacts` are review evidence, not pages.
- **Don't** take a theme color from the indigo, emerald, or navy values still left in some `theme-color` meta tags and in `docs/site.webmanifest`.
