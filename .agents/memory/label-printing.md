---
name: Thermal label preview accuracy
description: Browser printing boundaries and physical-label preview pitfalls.
---

Printer selection in the app is a saved configuration profile, not a hardware connection. Actual printer selection remains in the native print dialog.

**Why:** Browser APIs cannot enumerate/select installed printers; the requested Phomemo workflow must not claim direct device support without a separate integration.

**How to apply:** Keep this distinction visible when adding printer features, and do not imply physical output was verified by browser tests.

Preview and printing must use identical physical layout and measured text fitting, not character-count estimates.

**Why:** Container-query units on the container's own padding/gap resolved against the viewport, distorting previews. Character-length estimates also missed overflow with wide glyphs.

**How to apply:** Scale an exact physical-size layout for preview and measure rendered text/QR bounds before enabling print, including long names and the smallest presets.