---
name: codex-design-studio
description: Open the DSH-style design workbench in the Codex sidebar. Use when the user wants to see, review, click-to-edit, or tweak an HTML design artifact produced by Open Design or any local HTML file.
---

# Codex Design Studio

A design workbench docked in the Codex sidebar, like DSH's design studio.

## When to use

- The user wants to see a design/HTML page in a device frame.
- The user wants to click an element and send a precise edit to the agent.
- The user wants to adjust colors, radius or spacing with live sliders.

## Open the workbench

Call `open_design_studio` with the absolute `projectDir`. To show a specific screen, pass its path as `entryPath` (relative to the project, e.g. `.open-design/demo-landing/landing.html`). The tool opens the workbench as a native MCP App in the sidebar.

## List screens

Call `list_designs` with `projectDir` to find HTML artifacts. It looks inside `.open-design/` and common output folders. Each result has a path and a title.

## Click-to-edit annotations

When the user clicks an element in the preview and sends the annotation, the workbench writes a comment with the CSS selector, source file, text snippet and element position into `<entry>.comments.json` next to the design. Read that file to see exactly which element to change. After editing the element, remove the comment or mark it resolved.

## Tweaks

The Tweaks panel edits `:root` CSS variables in the HTML file. When the user applies a tweak, the workbench writes only those variable values back to the file. Prefer designs that use CSS variables; if a design hard-codes values, tokenize it first.

## Notes

- Paths are workspace-relative inside the MCP server.
- The workbench serves only HTML files inside the given project directory.
- All writes are plain file edits and can be undone with git.
