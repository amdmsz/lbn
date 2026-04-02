---
name: enterprise-workbench-redesign
description: Use this skill when redesigning business-facing workbench pages into cleaner, denser, more premium enterprise SaaS layouts. Especially for dashboard, customers, orders, shipping, settings, and list-heavy operational pages.
---

# Enterprise Workbench Redesign

## Purpose

Use this skill when a business-facing page needs to move from a bloated admin-like layout to a premium enterprise workbench.

This skill is especially for:

- `/dashboard`
- `/customers`
- `/customers/[id]`
- `/orders`
- `/shipping`
- `/settings`
- other list-heavy operational pages

## Design target

Transform:

- thick admin pages
- stacked boxes
- long list cards
- high-scroll first screens
- action-heavy default states

Into:

- premium workbenches
- denser and cleaner first screens
- calmer default states
- stronger hierarchy
- progressive actions

The target feeling should be closer to:

- Chinese top-tier enterprise SaaS
- ByteDance-style structural order
- Apple-like restraint and polish

## Core rules

### 1. First-screen compression

The first screen must not be wasted.

Compress aggressively:

- page header height
- intro copy
- summary cards
- filter surfaces
- repeated helper text

If the first screen still feels tall and slow, the redesign is not finished.

### 2. Premium through restraint

Improve quality through:

- fewer words
- fewer labels
- stronger hierarchy
- better spacing discipline
- better alignment

Do NOT try to make the page feel premium with:

- large shadows
- giant radii
- decorative gradients
- complex ornament

### 3. Default minimal, progressive on hover / click

Default states should be quiet and clear.

Actions and extra detail should appear progressively through:

- hover
- click
- overflow menu
- detail page

Do not expose every action by default.

### 4. Business cards, not mini detail pages

Operational cards must show only recognition-critical information.

They are not allowed to become:

- multi-section mini detail pages
- nested panel stacks
- text-heavy summaries
- field-label matrices

If a card needs too much explanation, move that information into the detail page.

### 5. Fewer labels

If the user already knows the card context, remove repeated labels.

Bad:

- 姓名：张三
- 电话：138xxxx
- 地址：上海……
- 已购产品：五粮液……

Better:

- 张三
- 138xxxx
- 上海……
- 五粮液……

## Page-level redesign checklist

When applying this skill, review these layers in order:

1. page header
2. summary strip
3. control/filter layer
4. list or table surface
5. action reveal pattern
6. adaptive behavior on tablet/mobile

If only colors or spacing changed, the redesign is probably incomplete.

## Customer page rule

For `/customers`, list items should become dense business cards.

The card should default to:

1. customer name
2. phone
3. address
4. imported purchased-product text
5. imported time as small metadata

Avoid repeated labels such as:

- 姓名
- 电话
- 地址
- 已购产品

Show the values directly.

## Customer hover rule

Customer cards should behave like this:

- default state is minimal
- hover reveals a light translucent action layer
- the layer does not fully bury the content
- action buttons are only:
  - 通话
  - 通话记录
  - 创建订单
- clicking blank hover space enters detail

Avoid:

- heavy frosted glass
- dark overlays
- loud motion
- big hover lifts

The hover feel should be closer to ByteDance enterprise products than consumer marketing UI.

## Adaptive rules

### Desktop

- prefer multi-column density when width allows
- use hover to reveal actions
- keep list scanning fast

### Tablet

- fall back to compact single-column cards
- preserve hierarchy
- do not stretch cards awkwardly

### Mobile

- do not rely on hover
- card click enters detail
- use a compact more-actions entry
- keep the same action set:
  - 通话
  - 通话记录
  - 创建订单

## Success criteria

A redesign is successful when:

- the page looks visibly lighter
- the first screen wastes less height
- cards no longer feel like backend forms
- labels and noise are reduced
- hierarchy is clearer
- actions are discoverable without being always-on
- the page feels closer to a premium enterprise workbench
