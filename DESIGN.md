# posspace Design Direction

## Identity

Operational POS for Indonesian coffee shops. The interface should feel calm,
precise, fast, and trustworthy for owners and cashiers working during service.

## Reference

Use SvelteForge's compact shadcn-style dashboard shell as the structural
reference: clear sidebar navigation, restrained cards, thin borders, compact
tables, useful empty states, and responsive mobile navigation.

Use Stripe's visual restraint for product UI: neutral surfaces, strong
hierarchy, generous whitespace, crisp focus states, and purple primary actions.

## Palette

- Light: `#F6F8FA`, `#FFFFFF`, `#E6E8EB`, `#0A2540`, `#425466`, `#635BFF`.
- Dark: neutral gray surfaces `#101012`, `#1A1A1C`, `#26262A`, text `#F4F4F5`, accent `#7A73FF`.
- Semantic states must remain explicit: red for critical/errors, amber for
  warnings, green for healthy/success.

## Interaction

- Preserve POS speed: primary actions must be obvious, disabled while saving,
  and show a visible loading state.
- Never hide stock, HPP, payment, or validation feedback behind decorative UI.
- Keep desktop and mobile flows equally usable; do not rely on hover-only cues.
