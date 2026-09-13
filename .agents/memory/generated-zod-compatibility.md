---
name: Generated Zod compatibility
description: Compatibility rule for regenerating server validation schemas in this workspace.
---

After OpenAPI generation, replace Zod 4-only primitive helpers with their Zod 3 equivalents and preserve the selective generated-type exports. The API-spec codegen command now applies this compatibility step automatically.

**Why:** The generator emits helpers such as standalone integer and email constructors, while the workspace currently resolves Zod 3.25. Regeneration otherwise breaks the library typecheck and can restore duplicate barrel exports.

**How to apply:** After every API codegen run, check generated validation output for unsupported helpers and check the validation package barrel for duplicate wildcard exports before running library typechecks. Keep the compatibility post-processing script in the codegen command.