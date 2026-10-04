# DESIGN.md — „Księga” (Tracker inwestycji)

Operational, single-household finance tool. Restraint is correct, but the surface must still
read as one deliberate object: a bank passbook / household ledger, not a generic dashboard.

## 0. Research log

- **Brief:** internal Polish personal-finance planner (monthly plan, cushion, IKE/IKZE limits,
  down-payment goal). No visual reference supplied → greenfield, operational lane.
- **Stack lane:** Next 16 App Router, React 19, Tailwind 4, shadcn v4 (`base-sera` preset, Base UI,
  Lucide). The `sera` anatomy (square corners, hairline inputs, letterspaced uppercase labels, serif
  card titles) was chosen *because* it already reads as print/ledger; the preset's taupe palette and
  Noto/Playfair fonts were replaced (see below).
- **Type lane:** `next/font/google` list checked for `latin-ext` (Polish diacritics) + variable axes.
  Picked Fraunces (display, `opsz`+`SOFT`) and IBM Plex Sans (UI, tabular figures). Rejected:
  Inter/Geist/Noto (defaults), Playfair (preset default), Instrument Serif (400 only).
- **Domain lane:** `docs/spec.md` — asset classes (akcje, obligacje, nieruchomości, złoto), cushion
  before investing, IKE/IKZE as per-person wrappers with yearly limits, down payment as a goal
  outside rebalancing. Numbers are the content; the UI's job is to make amounts legible.

## 1. Atmosphere & identity

A quiet paper-and-ink ledger. Warm cream paper, near-black warm ink, hairline rules, square
corners, small letterspaced capitals for labels, and a single deep **treasury green** (zieleń
skarbowa) reserved for interactive elements and "money going in". Amounts are set in tabular Plex;
the few numbers that matter most (this month's surplus, the cushion target) are set large in
Fraunces. **Signature idea:** the monthly plan renders as a ruled ledger — one line per transfer
with a right-aligned amount column — topped by a single stacked *allocation strip* that shows where
the money goes, in the asset-class colours. Atmosphere comes from a faint green-tinted light band
at the top of every page fading into paper; nothing else is decorative.

## 2. Color

Light only (see §8). All values oklch. shadcn variables are the token layer; Tailwind utilities
(`bg-primary`, `text-muted-foreground`, …) are the only way colours enter components.

| Role                | Token                    | Value                     | Usage |
|---------------------|--------------------------|---------------------------|-------|
| Paper               | `--background`           | `oklch(0.975 0.006 85)`   | page background |
| Card                | `--card`                 | `oklch(0.992 0.004 85)`   | elevated surface |
| Ink                 | `--foreground`           | `oklch(0.21 0.015 60)`    | text, strong rules |
| Muted surface       | `--muted`                | `oklch(0.945 0.008 80)`   | tracks, hover wash |
| Muted ink           | `--muted-foreground`     | `oklch(0.49 0.02 65)`     | secondary text (≥ 4.5:1 on paper) |
| Hairline            | `--border` / `--input`   | `oklch(0.875 0.012 80)`   | rules, input baselines |
| Treasury green      | `--primary`              | `oklch(0.42 0.085 160)`   | buttons, checked states, progress |
| On green            | `--primary-foreground`   | `oklch(0.985 0.004 85)`   | text on primary |
| Green wash          | `--accent`               | `oklch(0.95 0.02 160)`    | selected-card wash, hover on ghost |
| On wash             | `--accent-foreground`    | `oklch(0.3 0.07 160)`     | text on green wash |
| Secondary           | `--secondary`            | `oklch(0.93 0.01 80)`     | secondary buttons |
| Focus ring          | `--ring`                 | `oklch(0.55 0.09 160)`    | focus-visible |
| Danger              | `--destructive`          | `oklch(0.52 0.19 28)`     | errors, destructive alerts |
| Warning             | `--warning`              | `oklch(0.6 0.13 70)`      | out-of-band alerts (`Alert variant="warning"`) |
| Akcje               | `--class-equity`         | `oklch(0.55 0.11 165)`    | equity segments/dots |
| Obligacje           | `--class-bonds`          | `oklch(0.52 0.08 250)`    | bonds |
| Nieruchomości       | `--class-real-estate`    | `oklch(0.62 0.13 40)`     | real estate, down-payment goal, overpayment |
| Złoto               | `--class-gold`           | `oklch(0.74 0.13 85)`     | gold |
| Poduszka            | `--class-cushion`        | `oklch(0.6 0.02 65)`      | cushion segment |
| Chart 1–5           | `--chart-1..5`           | aliases of the five above | shadcn charts, if ever |

Elevation recipe (Card): paper `--card` + `ring-1 ring-foreground/5` + shadow
`0 1px 0 0 oklch(0.21 0.015 60 / 4%), 0 12px 32px -20px oklch(0.21 0.015 60 / 30%)` (token
`--shadow-card`). Atmosphere band: `.atmosphere` — radial green light `--primary` at 10% fading to
transparent over the top 360px of the page.

## 3. Typography

Two families, both self-hosted via `next/font/google`, subsets `latin` + `latin-ext`.

- **Display:** Fraunces (variable; axes `opsz`, `SOFT`) → `--font-heading`, utility `font-heading`.
  Used for: page/card titles, hero amounts. `font-variation-settings: "SOFT" 30`.
- **UI/body:** IBM Plex Sans (variable) → `--font-sans`, utility `font-sans`. Every amount gets
  `tabular-nums`.

| Level        | Utility                                   | Size/Line | Weight | Usage |
|--------------|-------------------------------------------|-----------|--------|-------|
| Hero amount  | `font-heading text-4xl md:text-5xl`        | 36–48/1.1 | 500    | surplus, cushion target |
| Page title   | `font-heading text-3xl`                    | 30/36     | 500    | one per page |
| Card title   | `CardTitle` (serif, uppercase, tracked)    | 18/28     | 600    | section headers |
| Lead         | `text-base`                                | 16/24     | 400    | page lead paragraphs |
| Body         | `text-sm`                                  | 14/20     | 400    | default |
| Label        | `Label`/`FieldLabel` (uppercase, tracked)  | 12/16     | 600    | form labels, strip legends |
| Tag          | `Badge` (uppercase, tracked)               | 10/—      | 600    | wrapper tags (IKE/IKZE) only |

Body copy never below 14px; `Badge` is the single sanctioned exception for 2–5-letter tags.

## 4. Spacing & layout

4px base (Tailwind spacing scale). Named steps: `1`=4, `2`=8, `3`=12, `4`=16, `6`=24, `8`=32,
`12`=48, `16`=64. Cards use `--card-spacing` (32 default, 20 for `size="sm"`).

- Page gutter `px-4 sm:px-6`; vertical rhythm between sections `gap-8` (mobile) / `gap-12`.
- Max widths: auth `max-w-sm`; wizard `max-w-3xl`; plan page `max-w-6xl`.
- Grids use `minmax(min(16rem,100%),1fr)` style tracks via Tailwind `grid-cols-[…]` or
  `sm:grid-cols-2`, never bare `minmax(16rem,1fr)`.
- Breakpoints: Tailwind defaults (sm 640, md 768, lg 1024).
- Radius `--radius: 0` — everything square; the only curve is the radio dot.

## 5. Primitives

shadcn (`components/ui`, `base-sera`): Button (default/outline/secondary/ghost/destructive/link;
sizes default/sm/lg/icon), Input (hairline baseline, focus → ring colour), InputGroup (+Addon for
units), Label, Field/FieldLabel/FieldDescription/FieldError/FieldSet/FieldLegend/FieldGroup
(`data-invalid` on Field drives red text + `aria-invalid` on the control), Checkbox, RadioGroup/
RadioGroupItem (cards via `FieldLabel > Field` composition: checked → `accent` wash + green
border), Progress (2px track, primary indicator), Alert (default/destructive/**warning** added),
Badge, Card, Separator, Skeleton, Spinner.

Project primitives (`components/`):

- `Wordmark` — brand lockup: green square + "Tracker inwestycji" in Fraunces; sizes `sm`/`lg`.
- `MoneyInput` — InputGroup with "zł" (or currency) addon, `inputMode="decimal"`, error wiring.
- `Stat` — label + big tabular amount (+ optional hint). States: default, muted (zero), hero.
- `AllocationStrip` — stacked horizontal segments in class colours with legend; states: empty
  (hatched muted track with caption), populated. Decorative strip is `aria-hidden`; legend carries
  the data.
- `AuthShell` / `AppHeader` — page frames for the auth pages and the signed-in app.
- Ledger row pattern (`PlanResult`): kind label (small caps) · account line · instrument/quantity
  in muted ink · right-aligned amount in Fraunces 2xl; rows separated by hairlines.
- Limit bar pattern (`Overview`): `Progress` with a `Badge` (IKE/IKZE) and "used / limit" value.

States required everywhere: default, hover (interactive only), focus-visible (ring 2px `--ring`
/30), disabled (opacity 50), invalid (destructive baseline + FieldError), loading (Spinner in
button, Skeleton rows), empty (caption in muted ink), error (Alert destructive).

## 6. Motion

- `--duration-fast` 150ms for colour/border changes (Tailwind `transition-colors`).
- Plan result enters with `animate-in fade-in slide-in-from-bottom-1 duration-300` (state change).
- Progress indicator width transitions 400ms ease-out.
- Nothing animates without an interaction or state change. `prefers-reduced-motion: reduce` →
  all transitions/animations disabled globally in `globals.css`.

## 7. Responsive behavior

- 375: single column; ledger rows stack kind/account above amount; allocation legend wraps.
- 768: overview becomes 2 columns; ledger rows in one line.
- 1280: plan page 3-column overview (poduszka / portfel / limity) over the full-width plan card.
- Full-height surfaces use `min-h-dvh`, never `h-screen`.

## 8. Accessibility & accepted debt

- All inputs labelled (`FieldLabel htmlFor`), errors via `role="alert"` (FieldError), radio cards
  are real radios (arrow-key navigation), focus ring always visible, hit targets ≥ 40px.
- Contrast: muted ink on paper ≈ 5.2:1; primary on paper ≈ 6.8:1; class colours are only used for
  segments with adjacent text labels.
- Debt: no dark mode (tokens are light only; `.dark` block intentionally absent). Badge at 10px.
  Polish copy only; no i18n layer.
