---
name: crm-ui-foundation
description: Use this skill whenever you are changing page structure, list pages, detail pages, dashboard pages, cards, filters, tables, actions, or shared layout in this CRM. This is the default and only primary UI/UX skill for all business-facing CRM pages.
---

# CRM UI Foundation

## Purpose

Use this skill as the repository-level UI/UX baseline for all business-facing CRM pages.

This is the default UI skill for:

- page structure
- list pages
- detail pages
- dashboard / KPI rows
- cards
- filters
- tables
- action placement
- shared workbench layout
- page shells and section composition

When a UI task is requested, this is the primary UI skill.  
Do not create a second overlapping UI redesign path unless the user explicitly asks for one.

## Priority note

Follow these repository files first:

1. `AGENTS.md`
2. `DESIGN.md`
3. `UI_ENTRYPOINTS.md`

This skill does not override business truth, route truth, RBAC, or compatibility rules.

## Design direction

The current design direction is:

- **Linear** for page skeleton, restraint, hierarchy, and workbench precision
- **Cohere** for KPI rows, data summaries, supervisory density, and calm dashboard language
- **Vercel** for typography restraint, spacing discipline, and surface polish
- **Claude / Notion** only for slight warmth in detail pages, empty states, and writing surfaces

The goal is not decoration.  
The goal is operational clarity, density, premium calm, and enterprise-grade structure.

## Hard style direction

Target qualities:

- lighter
- denser but still readable
- more structured
- more ordered
- more restrained
- more premium through hierarchy
- more enterprise workbench, less admin-template
- more business-first, less consumer-like

Do NOT produce:

- bloated admin pages
- long form-like list cards
- giant welcome or hero sections
- thick stacked panels
- heavy shadows
- oversized rounded surfaces
- repeated field labels on every card
- marketplace-style browsing layouts
- photography-first layouts
- marketing-site headers
- “put every detail on the first screen” layouts

## Mandatory page hierarchy

Every business page must have a clear top-to-bottom structure:

1. page header
2. summary/action layer
3. control/filter layer
4. main content layer
5. supporting detail / history / audit layer when needed

Do not collapse all of these into one oversized container.

### Page header

Use:

- clear page title
- one short line of context if truly useful
- only necessary quick actions
- concise right-side action area

Avoid:

- landing-page tone
- large welcome copy
- tall header stacks
- excessive vertical padding
- decorative top banners

### Summary / action layer

Use:

- compact summary strip
- short stat tiles or KPI cards
- short labels
- one main value
- one supporting note or tiny comparison

Avoid:

- 4 giant dashboard cards
- verbose explanations
- tall metric blocks that waste first-screen height
- status-heavy rainbow summary rows

### Control / filter layer

Filters should feel like a compact control surface, not a form.

Use:

- search first
- then key filters
- popover / dropdown expansion for secondary controls
- equal control heights
- short labels
- clear reset behavior

Avoid:

- stacked form rows
- large advanced-filter boxes always open
- oversized inputs
- thick control bars that push work below the fold

### Main content layer

Main content should carry the real work.

Prefer:

- dense business cards
- dense tables
- focused split views
- shallow list items with progressive details
- clear row-level or local action placement

Avoid:

- card inside card inside card
- mini detail pages inside list items
- explanatory paragraphs repeated per row
- scattered action buttons with no clear priority

## Progressive disclosure

Default state must be concise.

Actions and details should expand progressively through:

- hover
- click
- context menu
- side panel
- detail page
- tabs / collapsible secondary sections

Do not keep all actions visible by default unless the workflow truly requires it.

## Information density rules

Premium enterprise UI in this CRM should come from:

- stronger hierarchy
- spacing discipline
- tighter but stable vertical rhythm
- fewer repeated words
- clearer alignment
- cleaner grouping
- better section ordering
- cleaner action priority

It should NOT come from:

- stronger decoration
- more badges
- more shadows
- louder colors
- more visual effects
- larger cards
- more panels

## List and card rules

List cards must not become mini detail pages.

Dense business cards should usually follow these rules:

- 3 to 5 meaningful lines only
- no nested cards inside cards
- no permanent action sidebar
- no long descriptive blocks
- no repeated micro-sections
- keep card heights visually stable
- surface only recognition-critical data by default

If the card already has clear context, do not repeat obvious labels such as:

- 姓名
- 电话
- 地址
- 已购产品
- 当前负责人
- 客户状态

Show the values directly with hierarchy instead.

Bad:

- 姓名：张三
- 电话：138xxxx
- 地址：上海……
- 已购产品：茅台……

Better:

- 张三
- 138xxxx
- 上海……
- 茅台……

## Business card rule

Operational list items should be recognition-first:

- primary line: name / title / amount / key state
- secondary line: phone / channel / short location / short product
- tertiary line: time / scope / helper metadata

If a list item needs many sections, it probably should become a detail page instead.

## Hover and action rules

Desktop hover behavior should be calm and restrained:

- default state minimal
- hover reveals a light action layer or light inline actions
- actions stay few and clear
- blank hover space may enter detail where appropriate

Avoid:

- thick glassmorphism
- dark masks
- exaggerated motion
- large floating toolbars
- hover effects that bury content
- consumer-style reveal drama

## Visual language

Use:

- light neutral backgrounds
- subtle borders
- very soft shadows only when needed
- crisp alignment
- compact-to-medium radii
- typography-led hierarchy
- restrained accent usage
- clean KPI rows
- strong table readability

Avoid:

- decorative gradients as a default page language
- candy-like chips
- noisy card headers
- inconsistent spacing systems
- heavy dark UI unless explicitly requested
- marketplace / gallery composition

## First-screen discipline

The first screen must show useful work immediately.

Always check:

- can the user see meaningful content above the fold?
- is the header too tall?
- are summary cards too tall?
- is the filter layer too thick?
- is there repeated explanatory text pushing the work downward?
- are there too many panels before the real content starts?

If yes, compress structure before tuning colors or padding.

## Detail page baseline

Detail pages should still stay restrained.

Use:

- compact summary header
- short metadata rows
- quick actions
- tabs or clear sections
- records / timeline below
- stronger value hierarchy
- business-first grouping

Do not turn detail pages into long documentation pages.

## Table rules

Tables are first-class patterns in this repository.

Use:

- tight but readable row height
- visually light headers
- clear alignment
- restrained status styling
- sticky headers where useful
- clean action columns
- muted metadata
- row hover that helps scanning, not distracts

Avoid:

- overdecorated headers
- multi-line noise in every cell
- too many colored pills
- large embedded card blocks inside rows

## Route-specific UI guidance

### `/customers`

This is a primary daily workbench.

Prioritize:

- compact filter/search strip
- stronger customer recognition
- owner / activity / value clarity
- tighter list cards or table rows
- less label repetition
- calmer hover actions

### `/customers/[id]`

This page should feel like a compact operational dossier.

Prioritize:

- shorter profile header
- stronger cumulative purchase visibility
- clearer section grouping
- tighter records presentation
- less visual bulk
- more obvious action priority

### `/fulfillment`

This is a dense operational workbench.

Prioritize:

- compact tab hierarchy
- readable execution tables
- smaller but clearer top summary strip
- local row-context actions
- no verbose dashboard theater

### `/products`

This is a clean master-data center.

Prioritize:

- stable list readability
- compact create/edit flows
- clear supplier-tab transition
- obvious top actions

### `/customers/public-pool`

This is an ownership lifecycle workbench, not a lead-style gallery.

Prioritize:

- ownership-state clarity
- dense operational rows/cards
- clean claim / assign / recycle / auto-assign actions
- clear settings/reports linkage

## Route guardrail

When redesigning UI, verify against `UI_ENTRYPOINTS.md`:

- the unique mainline entrypoint did not change
- compatibility routes still make sense
- hover / dropdown / more-actions did not drift
- empty-state buttons did not reopen deprecated workflows
- list-level shortcuts did not grow into second workbenches

## Definition of good output

A good CRM page should:

- look closer to a premium enterprise workbench
- show more useful content in one screen
- reduce labels and repeated wording
- feel lighter and more ordered
- keep actions discoverable without clutter
- get its quality from structure, not decoration
- stay aligned with route truth and business mainlines