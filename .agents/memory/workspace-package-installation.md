---
name: Workspace package installation
description: Artifact-scoped dependency installation behavior in this pnpm workspace.
---

Declare client-only dependencies in the target artifact package, not at the workspace root.

**Why:** The package installation helper invokes a root-level add and pnpm rejects it in this workspace, so it cannot infer the intended artifact.

**How to apply:** Keep dependency ownership in the target artifact package and refresh the workspace lockfile after the declaration is scoped correctly.