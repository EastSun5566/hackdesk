# HackDesk design rubric

The visual half of the design audit. `pnpm design:audit` writes screenshots of each scene in light
and dark, plus an automated report (`report.md`) that measures what can be measured. This rubric
covers what needs judgment. Grade from the screenshots, and use the report as evidence, not as the
grade.

Reference: HackDesk follows the HackMD web design language (neutral zinc surfaces, one primary
violet, quiet 1px borders, 14px UI text). A good score means the app reads as one calm, deliberate
desktop tool, not a set of components that each made their own choices.

## Scoring

Rate each criterion 1–5, then weight it. The rubric score is
`sum(weight × (rating − 1) / 4)` out of 100.

| Rating | Meaning |
|---|---|
| 5 | Deliberate and consistent. Nothing to fix. |
| 4 | Good. One or two small nits a careful designer would notice. |
| 3 | Acceptable. Several visible inconsistencies, nothing broken. |
| 2 | Distracting. Inconsistencies a typical user notices. |
| 1 | Broken or confusing. |

For every rating, cite the specific evidence (scene, theme, the element and what is wrong with it).
A rating without evidence does not count.

## Criteria

### 1. Panels and surfaces (weight 20)

- The chrome (top bar, sidebar, footer) and the content (editor) read as distinct layers, with one
  consistent way of separating panels: a single divider, or a gap with a framed card, not a mix.
- Surface colours step in a clear order (page, panel, raised, overlay). No panel is a slightly
  different grey for no reason.
- Panel edges line up: headers in neighbouring panels share a height and baseline, and dividers run
  the full length of what they divide.

### 2. Borders and dividers (weight 15)

- Structural lines use one neutral colour (two at most: default and subtle), in both themes.
- No doubled lines where two components meet, and no line that stops short or overshoots.
- Controls at rest share one border treatment. Stronger borders mean hover, focus, or selection,
  not a different component.

### 3. Sidebar and tree (weight 20)

- Rows have a steady rhythm: one row height per row type, and the same icon size and icon-to-text gap.
- The hierarchy is clear: the title outranks metadata (weight, size, or colour), folders read
  differently from notes, and the indentation step is consistent, with guides that line up with
  parent icons.
- Hover, selected and focused rows are distinct and use the shared selection colours.
- Counts, chevrons and trailing actions sit in one aligned column.

### 4. Alignment and spacing (weight 15)

- Items in a row share a vertical centre (icon buttons beside a title, for example).
- Gutters repeat: the sidebar's inner padding matches the editor header's, and the footer's matches
  the top bar's.
- Spacing comes from the 4px scale. No cramped or over-padded one-offs.

### 5. Typography (weight 10)

- A small, clear type scale for the chrome: title, body, and meta tiers.
- Weight and colour carry hierarchy consistently. Truncation is graceful.

### 6. Controls and states (weight 10)

- Buttons, icon buttons, tabs, inputs and keyboard hints each have one style and one size per context.
- Disabled, active and focus states are visible and consistent.

### 7. Theme parity (weight 10)

- Light and dark both look intentional: the same hierarchy, no element that disappears or glares in
  one theme.

## Output format

Return:

1. A table of the criteria with rating, weighted points, and one line of evidence each.
2. The rubric score out of 100.
3. The five highest-impact fixes, most important first. Name the scene, the element, what is wrong,
   and the concrete change (colour token, spacing step, alignment).
