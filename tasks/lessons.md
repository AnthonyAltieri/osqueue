# Lessons

## 2026-02-27
- What went wrong: Initial implementation planning omitted `@osqueue/worker` as a first-class publish target until the user corrected scope.
- Why it happened: I treated worker as part of client by default instead of validating all intended public package names before implementation.
- Prevention rule: For npm publication work, explicitly confirm the full public package matrix (`client`, `broker`, `worker`, and any extras) and lock linked version groups before changing manifests or architecture.
