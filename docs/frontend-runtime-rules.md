# Frontend Runtime Rules

## Prisma enum runtime usage

Prisma enums are the database truth for schema typing and backend constraints, but they are not the runtime constant source for frontend-facing or shared module initialization paths.

Use this rule whenever a file may be imported by:

- metadata modules
- settings modules
- workbench or page components
- client-side forms
- filter or option builders
- shared constants
- server actions that are directly referenced from UI modules

### Required rule

- Use Prisma enums for typing and backend truth/query/service code.
- Use local string constants for runtime options, labels, defaults, and UI-facing metadata.
- Prefer `import type` when only types are needed.
- Validate user input in server actions or services against local runtime constants.
- Do not write `PrismaEnum.X` or `Object.values(PrismaEnum)` in frontend/shared risk chains.

### Correct pattern

```ts
import type { PublicPoolAutoAssignStrategy } from "@prisma/client";
import { z } from "zod";

export const PUBLIC_POOL_AUTO_ASSIGN_STRATEGIES = [
  "NONE",
  "ROUND_ROBIN",
  "LOAD_BALANCING",
] as const satisfies readonly PublicPoolAutoAssignStrategy[];

export type PublicPoolAutoAssignStrategyValue =
  (typeof PUBLIC_POOL_AUTO_ASSIGN_STRATEGIES)[number];

export const DEFAULT_PUBLIC_POOL_AUTO_ASSIGN_STRATEGY: PublicPoolAutoAssignStrategyValue =
  "NONE";

export const PUBLIC_POOL_AUTO_ASSIGN_STRATEGY_LABELS: Record<
  PublicPoolAutoAssignStrategyValue,
  string
> = {
  NONE: "关闭",
  ROUND_ROBIN: "轮转分配",
  LOAD_BALANCING: "低负载优先",
};

const schema = z.object({
  autoAssignStrategy: z.enum(PUBLIC_POOL_AUTO_ASSIGN_STRATEGIES),
});
```

### Incorrect pattern

```ts
import { PublicPoolAutoAssignStrategy } from "@prisma/client";

const defaultStrategy = PublicPoolAutoAssignStrategy.NONE;
const options = Object.values(PublicPoolAutoAssignStrategy).map((value) => ({
  value,
  label: value,
}));
```

The incorrect pattern can fail during module initialization or frontend/shared runtime loading, even when the Prisma enum looks available in server-only code.

### Safe boundary

These usages are still acceptable when the file is clearly backend-only:

- Prisma query builders
- mutation and transaction services
- truth-layer comparisons inside server-only business services
- database writes that must stay aligned with Prisma enum values

If a file may cross into page initialization, shared UI, or client-adjacent imports, move runtime enum options out into local constants first.
