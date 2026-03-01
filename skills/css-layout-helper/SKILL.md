---
name: css-layout-helper
description: Diagnose CSS layout, alignment, and spacing issues in existing UI code and propose minimal, practical fixes. Use when a developer is struggling with flexbox/grid behavior, centering, overflow, sizing, gaps/margins, responsive breakpoints, or cross-browser layout differences.
---

# CSS Layout Helper

## Inputs to Request
- Request the relevant HTML structure and CSS snippet.
- Request the desired layout outcome and a screenshot (or clear visual description).
- Request target browsers and breakpoint requirements.

## Workflow
1. Identify container/child roles and the active layout context (`block`, `flex`, `grid`, `positioned`).
2. Isolate the root cause (`display`, sizing, alignment axes, spacing model, overflow, inheritance, or specificity).
3. Propose the smallest safe change set before suggesting larger rewrites.
4. Prefer `flex` or `grid` intentionally; explain why the chosen model matches the desired behavior.
5. Include responsive implications and browser caveats when relevant.

## Output
- Provide a short diagnosis.
- Provide minimal CSS/HTML changes to test first.
- State expected visual result and what to verify at key breakpoints.

## Quality Bar
- Minimize churn and avoid unnecessary refactors.
- Preserve existing class names and structure unless a structural change is required.
- Call out tradeoffs when multiple valid fixes exist.
