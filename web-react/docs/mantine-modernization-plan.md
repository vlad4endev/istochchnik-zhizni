# Mantine modernization plan

This plan focuses on low-risk iterative improvements for the current app stack
(Mantine + Tailwind + custom CSS variables).

## Current baseline

- Mantine provider is already connected to the app appearance store.
- Theme defaults are centralized in `src/lib/theme.ts`.
- A shared token source is available in `src/lib/designTokens.ts`.
- Legacy dark-mode bridge styles still exist in `src/index.css`.
- Core defaults (radii/shadows/table/nav variants) are now tokenized in one place.

## Phase 1: Safe consolidation (no UI behavior changes)

1. Keep all existing visual values unchanged.
2. Expand token source for radii, shadows, and semantic text colors.
3. Reference these tokens from Mantine theme overrides first.
4. Add docs/examples for "when to use Mantine props vs Tailwind classes".

### Phase 1 rollout order

1. `designTokens.ts`: add/adjust only semantic token maps.
2. `theme.ts`: consume token maps, no direct hardcoded literals for shared defaults.
3. Build + visual smoke-check on key pages (`Songbook`, `SongDetail`, `MySongs`).
4. Only after smoke-check, continue to feature-level token migration.

### Phase 1.2 scope (completed foundation)

- Added semantic light/dark token contracts in `src/lib/designTokens.ts`.
- No page-level styles were switched yet (intentionally zero-risk).
- Next step is to migrate feature screens one-by-one to semantic tokens and
  remove corresponding legacy bridge rules only after verification.

### Phase 1.3 pilot migration (Songbook)

- `src/features/songbook/pages/SongbookPage.tsx` now uses local semantic
  CSS variables (with global variable fallbacks) instead of direct mixed
  utility color literals.
- No bridge rule removal was performed.
- Build and type checks pass after the migration.

### Phase 1.4 pilot migration (Song detail)

- `src/features/songbook/pages/SongDetailPage.tsx` migrated to local semantic
  CSS variables (`--sd-*`) with fallbacks to existing global variables.
- Error states and action controls now use semantic token-driven colors.
- No layout/logic changes and no bridge rule removal were introduced.

### Phase 1.5 pilot migration (My songs)

- `src/features/studio/pages/MySongsPage.tsx` migrated to local semantic
  CSS variables (`--ms-*`) with fallbacks to existing global variables.
- Main content surfaces, tab controls, form fields, list cards, and publish
  actions now use page-scoped semantic tokens.
- Existing import-source badges (amber/sky/violet) were kept as-is for feature
  semantics; bridge rules were not removed.

## Phase 2: Controlled cleanup (screen-by-screen)

1. Select one feature page at a time.
2. Replace ad-hoc utility color classes with semantic tokens.
3. Remove only bridge CSS rules that are no longer needed by that page.
4. Verify light/dark/system modes before moving to next page.

## Phase 3: Modern UX hardening

1. Introduce visual regression checks for critical flows.
2. Add a small theme smoke test suite (provider + color scheme sync).
3. Enforce bundle growth guardrails for UI-related dependencies.

## Definition of done for modernization

- No new global bridge rules are added.
- New pages use semantic tokens and shared UI primitives.
- Light, dark, and system themes remain synchronized across the app.
- Performance and accessibility checks pass on key screens.
