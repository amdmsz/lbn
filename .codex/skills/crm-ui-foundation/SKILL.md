---
name: crm-ui-foundation
description: Use this skill whenever you are changing page structure, list pages, detail pages, dashboard pages, cards, filters, tables, actions, or shared layout in this CRM. This is the default UI/UX skill for all business-facing pages.
---

# CRM UI Foundation

## Purpose

Use this skill as the repository-level UI/UX baseline for all business-facing CRM pages.

This CRM should feel closer to:

- Chinese top-tier enterprise SaaS
- ByteDance-style enterprise workbench order and structure
- Apple-like restraint, spacing discipline, and refinement

The goal is not decoration.  
The goal is operational clarity, density, and premium calm.

## Hard style direction

Target qualities:

- lighter
- denser but still readable
- more structured
- more ordered
- more restrained
- more premium through hierarchy

Do NOT produce:

- bloated admin pages
- long form-like list cards
- giant welcome or hero sections
- thick stacked panels
- heavy shadows
- oversized rounded surfaces
- repeated field labels on every card
- “put every detail on the first screen” layouts

## Mandatory page hierarchy

Every business page must have a clear top-to-bottom structure:

1. page header
2. summary/action layer
3. control/filter layer
4. main content layer

Do not collapse all of these into one oversized container.

### Page header

Use:

- clear page title
- one short line of context
- only necessary quick actions

Avoid:

- landing-page tone
- large welcome copy
- excessive vertical padding

### Summary / action layer

Use:

- compact summary strip
- short cards or stat tiles
- short labels, number, one-line note

Avoid:

- 4 giant dashboard cards
- verbose explanations
- tall metric blocks that waste first-screen height

### Control / filter layer

Filters should feel like a compact control surface, not a form.

Use:

- search first
- then key filters
- popover / dropdown expansion for secondary controls
- equal control heights
- short labels

Avoid:

- stacked form rows
- large advanced-filter boxes always open
- oversized inputs

### Main content layer

Main content should carry the real work.

Prefer:

- dense business cards
- dense tables
- focused split views
- shallow list items with progressive details

Avoid:

- card inside card inside card
- mini detail pages inside list items
- explanatory paragraphs repeated per row

## Progressive disclosure

Default state must be concise.

Actions and details should expand progressively through:

- hover
- click
- context menu
- side panel
- detail page

Do not keep all actions visible by default unless the workflow truly requires it.

## Information density rules

Premium enterprise UI in this CRM should come from:

- stronger hierarchy
- spacing discipline
- tighter but stable vertical rhythm
- fewer repeated words
- clearer alignment
- cleaner grouping

It should NOT come from:

- stronger decoration
- more badges
- more shadows
- louder colors
- more visual effects

## List and card rules

List cards must not become mini detail pages.

Dense business cards should usually follow these rules:

- 3 to 5 meaningful lines only
- no nested cards inside cards
- no permanent action sidebar
- no long descriptive blocks
- no repeated micro-sections
- keep card heights visually stable

If the card already has clear context, do not repeat obvious labels such as:

- 姓名
- 电话
- 地址
- 已购产品

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
- hover reveals a light translucent action layer
- actions stay few and clear
- blank hover space may enter detail

Avoid:

- thick glassmorphism
- dark masks
- exaggerated motion
- large floating toolbars

## Visual language

Use:

- light neutral backgrounds
- subtle borders
- very soft shadows only when needed
- crisp alignment
- compact radii
- typography-led hierarchy

Avoid:

- decorative gradients as a default page language
- candy-like chips
- noisy card headers
- inconsistent spacing systems

## First-screen discipline

The first screen must show useful work immediately.

Always check:

- can the user see meaningful content above the fold?
- is the header too tall?
- are summary cards too tall?
- is the filter layer too thick?
- is there repeated explanatory text pushing the work downward?

If yes, compress structure before tuning colors or padding.

## Detail page baseline

Detail pages should still stay restrained.

Use:

- compact summary header
- short metadata rows
- quick actions
- tabs or clear sections
- timeline / records below

Do not turn detail pages into long documentation pages.

## Definition of good output

A good CRM page should:

- look closer to a premium enterprise workbench
- show more useful content in one screen
- reduce labels and repeated wording
- feel lighter and more ordered
- keep actions discoverable without clutter
- get its quality from structure, not decoration
