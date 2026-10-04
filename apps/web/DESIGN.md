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
| Hero amount  | `font-heading text-4xl`                    | 36/1.1    | 500    | household total (dashboard) |
| Card amount  | `font-heading text-3xl` / `text-2xl`       | 30 / 24   | 500    | month total, class value |
| Page title   | `font-heading text-2xl leading-tight`      | 24/28     | 500    | one per page |
| Card title   | `CardTitle` (serif, uppercase, tracked)    | 18/28     | 600    | section headers |
| Lead         | `text-base`                                | 16/24     | 400    | page lead paragraphs |
| Body         | `text-sm`                                  | 14/20     | 400    | default |
| Label        | `Label`/`FieldLabel` (uppercase, tracked)  | 12/16     | 600    | form labels, strip legends |
| Tag          | `Badge` (uppercase, tracked)               | 10/—      | 600    | wrapper tags (IKE/IKZE) only |

Body copy never below 14px; `Badge` is the single sanctioned exception for 2–5-letter tags.

## 4. Spacing & layout

4px base (Tailwind spacing scale). Named steps: `1`=4, `2`=8, `3`=12, `4`=16, `6`=24, `8`=32,
`12`=48, `16`=64. Cards use `--card-spacing` (32 default, 20 for `size="sm"`).

- Page gutter `px-4 sm:px-6`; main column `py-5 sm:py-6`, sections `gap-6`, card grids `gap-4`.
  The header is a single 48px row (wordmark · household · nav · profile link); page headers are
  eyebrow · 24px title · 14px lead so the top of a page never takes more than ~150px.
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
- `AuthShell` / `AppHeader` — page frames for the auth pages and the signed-in app. `AppHeader`
  is one 48px row: `MainNav` (desktop: letterspaced links with a 2px primary underline for the
  active route; Pulpit · Plan · Akcje · Obligacje · Nieruchomości · Złoto), `MobileNav` (Sheet from
  the left, adds Profil) and the user name linking to `/profil` (sign-out lives there).
- `PageHeader` — eyebrow (small caps) · Fraunces 2xl title · 14px lead · right-aligned actions.
- `WeightGauge` — current share vs. its *tolerance range* ("tolerancja udziału") on a 0 → scale
  axis: tinted span in the class colour, hairline target tick, solid marker; marker and label turn
  `--warning` outside the range. The concept is never called "pasmo" in the UI.
- `ClassHead` — class page position in one line: value (3xl) · share / target / tolerance · a
  `dl` of class facts (contributed, result, drawdown, last quote, next maturity, equity, LTV…).
- `ClassCards` (dashboard) — four `size="sm"` cards in a 2-column grid (1 on mobile): title link
  (stretched), target + tolerance, value / contributed + result, gauge, a 2-column `dl` of facts
  incl. this month's amount, then `LimitBar`s of the class's own IKE/IKZE accounts.
- `PlanCard` (dashboard) — month title, total, `AllocationStrip`, the cushion (balance / target
  `Progress`) and the actions: `ExecuteDialog` + link to the plan; settings icon → plan settings.
- `LimitBar` — `Progress` with a `Badge` tag or a muted caption, optional owner, "used / limit".
- `AccountsCard` (class pages) — the class's accounts in fill order: ordinal in Fraunces, name,
  wrapper `Badge` (`wrapperTag`: "IKZE · przeds." for the entrepreneur limit), platform · owner,
  `LimitBar`; up/down reorder saves immediately; edit (name, platform, IKZE type) and delete
  dialogs; add dialog (type → platform → owner when >1 person → optional name).
- `InstrumentCard` (equity) — current instrument on top, `SymbolSearch` below.
- `SymbolSearch` — debounced (300 ms) Yahoo search: `InputGroup` with a search/spinner addon,
  hairline result rows (name · type `Badge` · symbol · exchange); choosing a row is a `button`.
- Charts (`components/charts`, recharts via shadcn `ChartContainer`): `ValueChart` (value line
  over a stepped contributions area in `--class-cushion`), `MarketChart` (area in the class colour
  on a numeric time axis, 1R/5L/Max `ToggleGroup`, dashed purchase lines + dots at the purchase
  date with a hover frame, "Porównaj z…" second line in `--class-cushion` with both lines
  normalised to % from the start of the range), `MaturityChart` (bars per year),
  `ContributionsChart` (monthly bars in `--class-cushion` + cumulative line in `--primary`).
  Tooltips are the project `ChartTooltipFrame` (popover surface, small-caps title, swatch rows)
  and format amounts from the original bigint; only axis ticks are formatted from floats.
- Dialogs: `Dialog` for forms (transaction, property, goal, account), `AlertDialog` for every
  irreversible action (book month, delete, remove person). Footer order: outline "Anuluj" ·
  primary action. `ExecuteDialog` ("Wykonane") is shared by the dashboard and the plan page.
- Forms: one `Card` per concern, `FieldGroup` inside, primary "Zapisz …" button with an inline
  `role="status"` "Zapisano." confirmation; server errors as `Alert variant="destructive"` or
  `FieldError`. Weight sliders carry a `± pp` tolerance `InputGroup` and the resulting range.
- Correction control (plan page): `Slider` over 0 … 2× the contribution (step 100 zł) so the
  regular amount sits at the centre tick ("stała wpłata"), beside an exact `MoneyInput` and a
  ghost reset; the signed difference reads "korekta −1 500,00 zł" (`formatAdjustment`, amber
  below / primary above). The plan recomputes after a 300 ms debounce and fades while stale.
- `PlanCard` spans both class-card rows on `lg`: strip without legend, the `PlanLedger` (container
  query stacks its rows below `@xl`), then the cushion and actions pinned with `mt-auto`.
- Account fill mode (plan settings, first after the weights): two `RadioGroup` cards — "Równomiernie
  na wszystkie konta" (EVEN: each IKE/IKZE up to 1/12 of its yearly limit per month, the rest to
  the regular account) / "Po kolei" (SEQUENTIAL). `AccountsCard` mirrors it: ordinals in
  sequential mode, "+" for tax accounts and "→" for the regular ones in EVEN, and each tax
  account's `LimitBar` caption reads "miesięcznie do X zł" (limit ÷ 12).
- Real estate is one flow card „Mieszkania” with a stage indicator (Cel › Kupione › Nadpłaty) and
  two numbered sections, each with a one-line note on what the plan does there: „1 · Zbieram na
  wkład własny” (goal rows: name, „Zasilany z planu” Badge, `Progress`, „Edytuj” + primary
  „Kupione”) and „2 · Posiadane” (bordered property tiles: usage/financing/portfolio Badges,
  value + equity/LTV, equity-vs-debt bar, mortgage and rent `dl`s). „Kupione” opens the shared
  property form (`PropertyFields`) prefilled from the goal — usage Wynajem, financing Hipoteka,
  price → suggested mortgage balance = price − saved — and submits `realEstate.completeGoal`.
  The „Liczone do portfela” `Switch` carries the fixed explanation copy.
- Mortgage („harmonogram + korekta z banku”): `MortgageTermsFields` (saldo · oprocentowanie ·
  rata · ostatnia rata as `type="month"`) with a live `FieldDescription` hint computed by
  `@pip/engine` `completeTerms` („rata ≈ 4 168,66 zł” / „spłata do lis 2051 (301 rat)”), used by
  the property form (plus Równe/Malejące and Skraca okres/Obniża ratę radios) and by the
  „Aktualizuj z banku” `Dialog`. The property tile shows `MortgageSummary` (saldo · rata · spłata
  „kwi 2051 · 294 rat” · zaoszczędzone odsetki in `--primary`) and `MortgagePanel`: the bank
  button, paid/remaining interest, and a `<details>` with `MortgageChart` (booked balance solid,
  projection dashed, both in `--class-real-estate`) and the credit history list (date · kind
  `Badge` · amount; interest/principal/saved/balance/installment on a muted second line; delete
  only on „Stan z banku”). Goal rows and the dashboard legend carry the down-payment ETA
  („zbierzesz w 54 mies. — marzec 2031”).
- Instrument changes and out-of-plan purchases live behind secondary buttons ("Edytuj",
  "Dodaj wcześniejszy zakup") that open a `Dialog`; page headers carry no primary action.
- Opening balances: `AddPositionDialog` („Dodaj posiadane”, Pozycje card of Akcje/Złoto) takes
  account · instrument · quantity (szt./g) · average price · „stan na” date · deposits this year
  (tax accounts only) and previews koszt / wartość / zysk in a 3-column `dl`; the holdings table
  shows Ilość · Śr. cena · Kurs · Koszt · Wartość · Zysk (zł and %). `AddBondsDialog` („Dodaj
  posiadane obligacje”, Serie card) is an editable statement table: # · Emisja (uppercase input
  with the live „ROD · 12 lat” hint) · Liczba · Wartość nominalna (computed) · Data wykupu · Data
  zakupu (computed) · remove, a „Razem” footer with „Dodaj wiersz”, Enter in the last row adds a
  row, row errors (incl. API „Wiersz N”) tint the row `bg-destructive/5`. OPENING transactions
  carry the „Stan początkowy” tag.
- Booked months: `UndoMonthDialog` ("Cofnij księgowanie", outline + `AlertDialog`, destructive
  confirm) appears wherever the newest booked month is shown (plan card, booked /plan, profile);
  `EditMonthDialog` ("Edytuj" on every history month) is a `Dialog` with the booking date and one
  hairline row per line: ledger label · `MoneyInput` in the account currency · quantity
  `InputGroup` (whole units for EDO) · remove (row dims, label struck, "Przywróć" restores).
- Ledger row pattern (`PlanLedger`): class dot · kind (small caps) · account · platform · owner ·
  what to buy + quantity in muted ink · right-aligned 14px amount; hairline rows, ~40px each, so a
  6-row plan with its footer fits 1440×900. Alerts are one-line amber/red rows, the rationale a
  `<details>`. Reused on the profile's month history inside `<details>` rows.

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

- 375: single column; ledger rows stack detail under the account line; allocation legend wraps;
  the plan card precedes the class cards.
- 768: class cards in 2 columns; ledger rows in one line; weight rows put the tolerance input
  beside the slider.
- 1024+: dashboard = full-width total strip, then 2×2 class cards beside the month card (2:1);
  class pages put the two charts side by side (`xl:grid-cols-2`) and accounts beside the
  instrument card (3:2); plan settings is a 3:2 split.
- Header: nav links hide below `md` (Sheet menu button appears); the household name shows from
  `lg`; the profile link collapses to its icon below `sm`.
- Full-height surfaces use `min-h-dvh`, never `h-screen`.

## 8. Accessibility & accepted debt

- All inputs labelled (`FieldLabel htmlFor`), errors via `role="alert"` (FieldError), radio cards
  are real radios (arrow-key navigation), focus ring always visible, hit targets ≥ 40px.
- Contrast: muted ink on paper ≈ 5.2:1; primary on paper ≈ 6.8:1; class colours are only used for
  segments with adjacent text labels.
- Debt: no dark mode (tokens are light only; `.dark` block intentionally absent). Badge at 10px.
  Polish copy only; no i18n layer.
