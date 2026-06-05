# Contributing

## Goals

- Keep changes small and focused.
- Preserve the minimal black-and-white visual direction.
- Keep Electron main-process file access isolated from the renderer.

## Workflow

1. Create a branch for your change.
2. Make the smallest correct change.
3. Verify the app still builds.
4. Update the README or changelog when behavior changes.

## Expectations

- Prefer direct, testable implementations over speculative abstractions.
- Do not introduce cloud services, collaboration, or plugin systems in v1 without explicit approval.
- If you change the app contract or file format behavior, document it.
