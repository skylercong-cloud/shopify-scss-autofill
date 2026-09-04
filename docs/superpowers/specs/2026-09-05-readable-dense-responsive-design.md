# Readable/Dense Responsive Scaling Design

## Scope

Replace semantic element coefficients with two scaling profiles, add an optional fixed-core breakpoint, support inherited profile selection in nested SCSS, and allow configured entry files to be created after development watchers start.

Unmentioned behavior remains unchanged, including safe CSS synchronization, per-entry generation, `varScope`, incremental hashing, rollback, `r.vw()`, `r.re()`, shorthand expansion, and automatic mobile clamp-mode selection.

## Configuration

```json
{
  "design": { "desktopWidth": 1920, "mobileWidth": 750 },
  "fixedCore": null,
  "coefficients": {
    "readable": { "min": 0.625, "max": 1.5 },
    "dense": { "min": 0.5, "max": 1.5 }
  }
}
```

`fixedCore` accepts `null` or `{ "breakpoint": 1500, "width": 1200 }`. Both values must be positive and the breakpoint must exceed `autofill.mobileMax`. Width is validated metadata only; no core selector or `max-width` rule is generated.

Remove these legacy features completely:

- `responsive.mobileProfilePreset`
- `coefficients.mobile` and `coefficients.desktop`
- `maxCoefficients`, `floors`, and `ceilings`
- semantic keys such as `h1`, `body`, `badge`, and spacing categories
- built-in 375 and 590 semantic profile tables

The CLI stops with a migration error when legacy configuration is detected. `responsive.mobileClampMode` and its automatic thresholds remain unchanged.

## Scaling Rules

| Profile | Minimum | Maximum |
| --- | ---: | ---: |
| `readable` | `0.625` | `1.5` |
| `dense` | `0.5` | `1.5` |

Bounds are calculated directly as `design value * coefficient`. There are no absolute floors, ceilings, fallback division rules, or comparisons against fallback values.

```text
min-first:  clamp(profile minimum, fluid value, design value)
max-first:  clamp(design value, fluid value, profile maximum)
dual-bound: clamp(profile minimum, fluid value, profile maximum)
```

Validate positive coefficients, `min <= 1`, `max >= 1`, and `min <= max`, so runtime safety anchoring is unnecessary.

## Function API

```scss
r.resp($pc, $mobile, $desktop-profile: readable, $mobile-profile: null)
```

The fourth argument inherits the third when omitted. Both ranges default to `readable` unless a parent establishes another mode. A profile can be `readable`, `dense`, a positive number overriding only `min`, or a Sass map containing `min`, `max`, or both.

```scss
r.resp(24px, 16px);
r.resp(24px, 16px, dense);
r.resp(24px, 16px, readable, dense);
r.resp(24px, 16px, 0.7);
r.resp(24px, 16px, (max: 1.3));
r.resp(24px, 16px, (min: 0.7, max: 1.3));
r.resp(24px, 16px, (min: 0.7, max: 1.3), (min: 0.55, max: 1.4));
```

For a number or partial map, missing bounds come from the effective inherited mode, otherwise `readable`. Unsupported semantic names produce an actionable Sass error.

## Inherited Mode

```scss
.product-card {
  @include r.mode(dense);

  .title { font-size: r.resp(24px, 16px); }
  .description { font-size: r.resp(20px, 14px, readable); }
}
```

`r.mode()` emits inherited CSS custom properties. Root or configured `varScope` establishes `readable`. Calls without an explicit profile consume inherited values; explicit named, numeric, or map arguments emit their own bounds and override inheritance.

The autofill scanner recognizes two-argument calls and preserves omitted, named, numeric, and map specifications in mobile overrides. Existing AST nesting support and legacy fallback remain.

## Fixed Core

Below the breakpoint, normal desktop scaling and coefficient bounds remain active. At the breakpoint the generated mixin sets the desktop unit to one design pixel:

```scss
@media screen and (min-width: 1500px) {
  .configured-scope { --px-to-vw: 1px; }
}
```

This fixes PC values for `r.resp()`, `r.vw()`, and `r.vw_pc_raw()`. `r.re()` is non-dimensional. Per-entry output uses `varScope`; global output uses `:root`.

## Missing Configured Entries

`responsive:generate:entries` treats a missing configured entry as `pending` and exits successfully unless an existing entry fails generation. This allows `dev:theme:auto` to start.

When the file is created, the watcher:

1. Matches normalized string and object entries by `file`.
2. Creates the generated SCSS placeholder before adding imports, avoiding a Sass watcher race.
3. Adds boilerplate only when the entry is empty.
4. Generates the real per-entry autofill file.
5. Preserves object entries and `varScope` without appending a duplicate string.

Unexpected generation failures remain fatal and retain rollback behavior.

## Synchronization And Verification

`tools/scss-kit` remains the source of truth. Synchronize runtime, schema, snippets, configuration, and documentation changes to the create-scss-kit template, demo, initializer, root documentation, website documentation, and changelogs. Do not remove unrelated behavior.

Verify default readable, explicit dense, numeric and map overrides, third/fourth argument inheritance, all mobile modes, parent inheritance and child override, fixed-core output, migration errors, pending entries, boilerplate race prevention, object entry matching with `varScope`, source/template/demo synchronization, CLI smoke tests, and representative Sass compilation.
