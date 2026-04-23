# DESIGN.md

## 1. Purpose

This file is the visual and interaction source of truth for frontend UI refactors in this repository.

It defines:

- visual tone
- information hierarchy
- page composition
- shared component direction
- interaction density
- layout rhythm
- UI polish constraints for AI-assisted refactors

It does **not** define:

- business model truth
- route mainlines
- compatibility route policy
- RBAC boundaries
- server action behavior
- schema changes
- audit requirements

Those remain owned by `PRD.md`, `AGENTS.md`, and `UI_ENTRYPOINTS.md`.

---

## 2. Product Context

This product is an internal CRM for a liquor private-domain sales team.

It is **not**:

- a marketing site
- a travel marketplace
- a gallery-first browsing experience
- a generic admin template
- a consumer social product

The product is a daily workbench for roles such as sales, supervisor, admin, shipper, and ops.

The UI must support:

- fast scanning
- repeated daily actions
- high information density without clutter
- stable workflow cognition
- low fatigue in long operational sessions

---

## 3. Design Direction

### 3.1 Core visual direction

Primary reference mix:

- **Linear** for page skeleton, precision, restraint, table-and-workbench clarity
- **Apple-like product restraint** for calm premium surfaces, obvious interaction hierarchy, and "few words, strong structure"
- **Vercel** for typography restraint, spacing discipline, clean surfaces, and detail polish
- **Cohere** only for supervisory KPI density and management-level comparison rows
- **Claude / Notion** only for slight warmth in detail pages, empty states, and writing surfaces

### 3.2 Desired feeling

The UI should feel:

- enterprise-grade
- precise
- layered
- calm
- modern
- trustworthy
- refined without being flashy
- operational rather than promotional

### 3.3 Tone to avoid

Avoid interfaces that feel:

- image-first
- entertainment-first
- landing-page-like
- overly playful
- visually loud
- overly soft and vague
- dark-cinema creative tool by default
- card-bloated and badge-heavy

---

## 4. Global Principles

### 4.1 Business-first, not decoration-first

UI exists to support execution.
Visual upgrades must improve clarity, hierarchy, and confidence, not just style.

### 4.2 Strong hierarchy, low noise

Users should immediately understand:

- what this page is for
- what matters most
- what action to take next
- which content is primary vs supporting

### 4.3 Dense but breathable

This is a workbench product.
The interface should be compact-to-medium in density, not oversized and airy.
At the same time, it must avoid flat clutter.

### 4.4 Shared system over one-off page styling

When patterns repeat, align or extract them.
Prefer shared page shells, filter strips, KPI cards, detail sections, tables, and status treatments.

### 4.5 Mainline-safe redesign

Visual refactors must not silently change:

- unique mainline entrypoints
- compatibility routes
- CTA destinations
- hover action destinations
- dropdown / more-action destinations
- empty-state action targets

### 4.6 Sitewide cutover baseline

This repository is now in an explicit sitewide UI / visual / IA cutover program.

Implementation should still happen in controlled phases, but the intended destination is no longer a page-local polish pass.
Shared shell, tokens, workbench primitives, supervisor cockpit, sales workbench, and customer dossier should converge on one coherent system.

---

## 5. Visual Language

### 5.1 Overall aesthetic

Use a neutral-first enterprise palette.

The interface should be built from:

- restrained light surfaces
- clear but subtle borders
- soft depth
- carefully limited accent color
- precise typography
- compact structural rhythm

The current warm beige / earthy CRM palette should be treated as deprecated direction for the new cutover.

### 5.2 Accent strategy

Accent color should be used deliberately, not broadly.

Allowed primary accent use cases:

- primary CTA
- active tab
- selected state
- key focus state
- sparse numeric or chart emphasis
- key operational highlight

Avoid multiple competing accent colors in the same viewport.

Avoid:

- generic purple-on-white defaults
- warm brown luxury cues
- scattered rainbow KPI accents

### 5.3 Warmth strategy

The product should not feel icy.
Warmth should come from:

- slightly softened neutrals
- controlled typography rhythm
- calm copy tone
- subtle supporting surfaces

Warmth should **not** come from:

- oversized gradients
- consumer-style illustrations
- saturated surfaces everywhere
- oversized rounded toy-like components
- long explanatory copy

---

## 6. Color System

### 6.1 Base neutrals

Recommended direction:

- page background: very light neutral
- primary surface: white or near-white
- secondary surface: soft neutral contrast
- tertiary surface: subtle muted fill
- border: low-contrast neutral border
- primary text: near-black, slightly warm
- secondary text: mid neutral
- tertiary text: muted neutral

Suggested practical baseline:

- `--bg-page`: `#f7f8fa`
- `--bg-surface`: `#ffffff`
- `--bg-subtle`: `#f3f4f6`
- `--bg-muted`: `#eef1f4`
- `--border-default`: `#e5e7eb`
- `--border-strong`: `#d7dce3`
- `--text-primary`: `#171717`
- `--text-secondary`: `#52525b`
- `--text-tertiary`: `#71717a`

### 6.2 Accent palette

Primary accent should follow a restrained cool-tech direction:

- cool blue
- slate-blue
- steel-cyan

Do not use warm brown as the new primary product accent.
Do not default to purple just because it looks "SaaS-like".

Suggested baseline direction for the current cutover:

- `--accent-primary`: `#2563eb`
- `--accent-primary-hover`: `#1d4ed8`
- `--accent-primary-soft`: `#e8f0ff`
- `--accent-focus-ring`: `rgba(37, 99, 235, 0.18)`

Optional data accent support for charts or summary highlights:

- `--accent-data-blue`: `#4c7dff`
- `--accent-data-green`: `#0f9f6e`
- `--accent-data-amber`: `#b7791f`
- `--accent-data-rose`: `#c2416c`

These are secondary data accents, not broad UI brand colors.

### 6.3 Status colors

Status colors must be controlled and repeatable.

Suggested roles:

- success: green
- warning: amber
- danger: red
- info: blue
- neutral/inactive: gray

Status color should appear mostly in:

- badges
- icon accents
- tiny summary strips
- focused values
- chart marks

Do not flood rows or large surfaces with status color.

---

## 7. Typography

### 7.1 Font direction

Use the product’s real application font stack.
Do not encode a third-party brand font into this file.

Preferred tone:

- modern sans serif
- neutral and crisp
- readable at dense sizes
- good number rendering
- good Chinese and English coexistence

Suggested stack direction:

- `Inter`
- `Geist`
- `-apple-system`
- `BlinkMacSystemFont`
- `Segoe UI`
- `PingFang SC`
- `Microsoft YaHei`
- `sans-serif`

### 7.2 Hierarchy

Use a restrained workbench type scale.

| Role | Size | Weight | Line Height | Notes |
|------|------|--------|-------------|-------|
| Page Title | 24–28px | 700 | 1.2–1.3 | Top-level page heading |
| Section Title | 18–20px | 600–700 | 1.3 | Main content sections |
| Card / Panel Title | 15–16px | 600 | 1.35 | Card and block headers |
| KPI Value | 22–28px | 700 | 1.1–1.2 | Compact, high scan priority |
| Table Header | 12–13px | 600 | 1.2 | Tighter and clear |
| Body Primary | 14px | 400–500 | 1.45 | Standard UI text |
| Body Strong | 14px | 600 | 1.4 | Emphasized operational text |
| Meta / Caption | 12–13px | 400–500 | 1.35 | IDs, labels, timestamps |
| Micro | 11–12px | 500 | 1.3 | Dense metadata only |

### 7.3 Typography rules

- Page titles should be strong, but not oversized.
- Section titles should create hierarchy without feeling promotional.
- Numeric summaries should be easier to scan than descriptive copy.
- Metadata should be visually lighter than primary content.
- Avoid long helper text blocks unless they prevent mistakes.
- Avoid large decorative headings.
- Avoid excessive negative letter-spacing or stylistic gimmicks.

---

## 8. Layout and Page Composition

### 8.1 Standard page skeleton

Default page composition should be:

1. page header
2. compact filter / control strip
3. KPI / summary row when truly useful
4. main workbench surface
5. supporting detail sections below or beside
6. audit / history / secondary context at lower priority

### 8.2 Page header

A good page header should contain:

- clear title
- optional short subtitle
- right-aligned primary actions
- no oversized intro copy
- no "how to use this page" paragraphs unless the workflow is truly non-obvious

The header should feel concise and operational.

### 8.3 Filter strip

Filter bars are a key shared pattern.
They must be:

- compact
- horizontally organized where possible
- visually unified in one surface
- clear about primary search vs secondary filters
- easy to reset
- expandable when advanced filters become too dense

Avoid tall multi-row filter blocks unless unavoidable.

### 8.4 KPI / summary row

Summary cards should be:

- fewer
- tighter
- easier to compare
- visually quieter than consumer dashboard cards

Prefer 3–5 summary cards max in most top rows.
Do not create oversized status blocks.
Supervisor home should prefer a compact KPI strip above a pure operating table rather than tall dashboard stacks.

### 8.5 Main workbench

Main workbench surfaces should feel stable and serious.

Use:

- strong table or structured list layouts
- clear local actions
- disciplined spacing
- compact section headers
- obvious row-level action placement

---

## 9. Navigation

### 9.1 App shell

Preferred structure:

- persistent left navigation
- stable top header
- content area with controlled width
- page body with predictable section rhythm

### 9.2 Left navigation

The left nav should feel closer to Linear/Vercel than to a playful template.

Rules:

- limited first-level noise
- strong active state
- restrained icon use
- domain-first grouping
- quiet background contrast

### 9.3 Tabs

Tabs are first-class UI patterns in this product.

They should be:

- compact
- clearly active
- business-like
- consistent across domains

Tabs should not feel like playful pills unless the page explicitly needs that.

### 9.4 Context navigation

Query-param-based context routing exists in this repository and is business-critical.
Visual redesign must preserve route cognition and context continuity.

---

## 10. Surfaces, Borders, Radius, and Elevation

### 10.1 Surface model

Use a layered but restrained surface system:

- page background
- card/panel surface
- raised interactive surface
- overlay surface
- modal/drawer surface

### 10.2 Radius

Recommended direction:

- buttons / inputs: 8px–10px
- cards / panels: 12px–16px
- drawers / modals: 16px–20px
- small pills / badges: 999px only when semantically justified

Do not overuse giant rounded cards.

### 10.3 Borders

Borders are important in this UI.
Prefer subtle, consistent borders over relying too much on shadow.

### 10.4 Elevation

Use light, modern shadows.

Suggested principle:

- most surfaces: border-first, tiny shadow at most
- raised interaction: slightly stronger shadow
- overlays: clean separation, not theatrical depth

Suggested shadow direction:

- level 1: `0 1px 2px rgba(16, 24, 40, 0.04)`
- level 2: `0 4px 12px rgba(16, 24, 40, 0.08)`
- level 3: `0 12px 32px rgba(16, 24, 40, 0.12)`

Do not use warm, soft, consumer-marketplace card stacks everywhere.

---

## 11. Shared Components

### 11.1 Buttons

Buttons should feel precise and controlled.

Rules:

- exactly one clear primary CTA per local context
- secondary buttons are quiet but still visible
- ghost buttons remain legible
- destructive buttons are clearly distinct
- loading state must be visually consistent

### 11.2 Inputs

Inputs should be calm, clean, and compact.

Rules:

- clear labels
- consistent height
- consistent radius
- visible focus ring
- no oversized input chrome
- helper text only where useful

### 11.3 Search

Search is important, but this is not a search-centric homepage product.
Search must sit inside the filter strip, not dominate the whole page.

### 11.4 Tables

Tables are one of the most important patterns in this product.

Guidelines:

- prioritize scanning speed
- clean header separation
- compact row rhythm
- disciplined metadata styling
- restrained row hover
- sticky headers where useful
- action columns should be clear but not noisy
- status treatment should not overwhelm content

### 11.5 Cards

Cards should be compact, structured, and information-first.

Use cards for:

- KPI summaries
- customer profile blocks
- execution summaries
- detail sections
- compact contextual panels

Avoid bloated cards with large empty areas.

### 11.6 Detail sections

Detail sections should have:

- a clear title row
- a small action area if needed
- content grouped into logical sub-blocks
- primary values first
- audit/supporting information later

### 11.7 Badges and status chips

Badges should be:

- small
- sparse
- consistent
- semantically meaningful

Do not scatter many colorful badges across every card.

### 11.8 Dropdowns and more-actions

Use dropdowns for secondary actions only.
Primary business actions should stay directly visible where possible.

### 11.9 Drawers and modals

Use drawers/modals for:

- focused edits
- logistics trace
- history/audit details
- contextual configuration
- secondary task flows

Do not rebuild whole page workbenches inside overlays.

### 11.10 Empty / loading / error states

These are required, not optional.

They should:

- look consistent with the page
- remain compact
- guide the next action
- never revive deprecated workflows

---

## 12. Data Presentation

### 12.1 KPI design

KPI cards should feel closer to Cohere than to generic admin cards, but with more restraint.

They should show:

- one main value
- one short label
- one supporting comparison or explanation
- optional tiny status/change signal

Do not stack too much narrative copy in KPI cards.

### 12.2 Financial values

Amounts and payment-related numbers should be highly scannable.

Rules:

- align major values clearly
- reduce noise around currency formatting
- distinguish main total vs supporting breakdown
- use consistent emphasis for collected / remaining / COD / receivable values

### 12.3 Metadata

IDs, owners, dates, suppliers, and audit references should remain visible but visually secondary.

### 12.4 Charts

Charts are secondary in most daily workbench pages.
Use them mainly in supervisor/admin/reporting contexts.

Chart style should be:

- calm
- thin
- readable
- low-decoration
- low-gridline clutter

---

## 13. Route-Specific Guidance

These are visual and structural rules only.
They must not override business truth or route truth.

### 13.1 `/customers`

This is a primary daily sales workbench.

Priorities:

- default to a dense table as the primary mode
- prioritize today’s assigned customers and immediate next actions
- keep imported intent / purchase information visible in-row
- support inline classification and inline remark editing
- clear latest call result / contact progress visibility
- reduce card-first thinking and avoid thick top scaffolding

### 13.2 `/dashboard`

This should become the supervisor / management operating cockpit rather than a generic role dashboard.

Priorities:

- compact day-based KPI strip
- pure employee operating table as the main content layer
- obvious drill-down into employee customer pools
- restrained copy and minimal decorative framing
- no giant quick-entry card walls

### 13.3 `/customers/[id]`

This page should feel like a compact operational dossier.

Priorities:

- reduce oversized profile card height
- surface current `ABCDE` class clearly
- make cumulative purchase amount more prominent
- unify orders / payment / follow-up / logistics sections visually
- make recent records easier to scan
- remove decorative bulk and repeated explanations
- strengthen action clarity without crowding the top

### 13.4 `/fulfillment`

This is the main order and fulfillment domain workbench.

Priorities:

- strong tab clarity
- dense but readable tables
- compact top summary strip
- local operational actions close to the relevant row or block
- no verbose dashboard theater
- no re-splitting into disconnected mini-products inside each tab

### 13.5 `/products`

This is a clean master-data center.

Priorities:

- stable list readability
- compact create/edit forms
- clean supplier tab transition
- controlled form density
- obvious primary actions

### 13.6 `/customers/public-pool`

This is an ownership lifecycle workbench, not a lead marketplace.

Priorities:

- clear ownership-state display
- strong claim / assign / recycle / auto-assign visibility
- settings and reports linkage stays obvious
- operational density remains high without collapsing into chaos

### 13.7 Reporting / supervisor views

Supervisor/admin-facing views may use more KPI density, but should still remain restrained, comparison-first, and aligned with the same base system.

---

## 14. Interaction Rules

### 14.1 Hover

Hover is supportive, not theatrical.
It may reveal actions, but must not create visual chaos or shift layout aggressively.

### 14.2 Progressive disclosure

Use progressive disclosure for:

- advanced filters
- logistics trace
- audit records
- secondary metadata
- dense subordinate detail

Do not dump everything into the first screen.
Do not keep explanatory paragraphs on the first screen if the layout itself can communicate the workflow.

### 14.3 Destructive actions

Destructive actions must be:

- clearly separated
- confirmable when needed
- visually distinct
- never easy to misclick

### 14.4 Focus states

Focus should be obvious and accessible.
Use a consistent, restrained focus ring based on the primary accent.

### 14.5 Motion

Animation should be minimal and purposeful.

Allowed:

- tiny hover transitions
- tab/content fade or slide
- loading skeleton shimmer
- modal/drawer entry with restraint

Avoid decorative or cinematic motion.

---

## 15. Do and Don’t

### Do

- Use neutral-first surfaces
- Keep layouts compact and structured
- Make tables and detail sections first-class patterns
- Use accent color sparingly
- Make KPI rows clearer, not louder
- Use shared UI primitives instead of page-local styling drift
- Preserve route cognition and contextual actions
- Keep empty/loading/error states complete
- Make the product feel more like an enterprise workbench than a template

### Don’t

- Don’t design pages like a marketing site
- Don’t use photography-first card layouts
- Don’t center the whole experience around a hero search bar
- Don’t use oversized consumer-style cards
- Don’t turn every page into a dashboard
- Don’t keep oversized top nav blocks or helper copy just to explain obvious workflows
- Don’t flood the UI with colorful badges
- Don’t hide important business actions too deeply
- Don’t silently change route destinations during visual refactor
- Don’t introduce random one-off visual styles per page

---

## 16. Refactor Workflow for AI Agents

When doing UI work in this repository:

1. read `AGENTS.md`
2. read `UI_ENTRYPOINTS.md`
3. preserve route and workflow truth
4. identify reusable page shell / filter bar / KPI / card / detail section / table primitives
5. refactor shared patterns before page-local polish
6. keep loading / empty / error states intact
7. avoid backend, schema, and behavior changes unless explicitly requested
8. summarize which pages were updated and which shared primitives were introduced

---

## 17. Done Criteria

A UI refactor is done only when:

- the page feels more refined and more structured
- the hierarchy is clearer
- the screen is denser but not more crowded
- primary actions are easier to find
- mainline entrypoints remain correct
- compatibility routes are not broken or accidentally revived
- empty/loading/error states remain complete
- the product feels closer to a top-tier enterprise SaaS workbench than to a flat admin template
