# Tracker inwestycji

Wewnętrzna aplikacja dla gospodarstwa domowego (singiel albo para). Co miesiąc mówi, ile i na które konto przelać, żeby portfel wracał do wag docelowych, i pokazuje majątek oraz zysk każdej klasy aktywów. Realizuje algorytm z poradnika *Inwestowanie od zera*: poduszka → strumień nieruchomości → rebalancing nowymi wpłatami → accelerator → kolejka kont IKE/IKZE/zwykłe.

Pełna specyfikacja: [docs/spec.md](docs/spec.md).

## Stan

| Część | Status |
| --- | --- |
| `packages/money`: kwoty jako `bigint`, podział bez gubienia groszy, formatowanie zł.gr, kursy NBP | gotowe |
| `packages/engine`: `planMonth`, pasma, accelerator, limity IKE/IKZE, walidacja kont osoby | gotowe, z testami scenariuszy z poradnika |
| `packages/db`: schemat Drizzle + migracja początkowa | gotowe |
| `packages/auth`: Better Auth (e-mail + hasło, zamknięta rejestracja) | gotowe, bez UI |
| `packages/api` (tRPC), `apps/web` (Next.js + shadcn), `apps/worker`, `packages/sources` | do zrobienia |

## Wymagania

- Node 24+, pnpm 10 (`corepack enable`)
- Postgres 16+ (lokalnie: `docker compose up -d`, port 5433)

## Start

```bash
pnpm install
cp .env.example .env
pnpm --filter @pip/auth exec auth secret   # wynik wklej do BETTER_AUTH_SECRET
docker compose up -d
pnpm db:migrate
```

## Polecenia

| Polecenie | Co robi |
| --- | --- |
| `pnpm test` | testy wszystkich pakietów (Vitest) |
| `pnpm typecheck` | `tsc` we wszystkich pakietach |
| `pnpm lint` / `pnpm format` | Biome: sprawdzenie / poprawki |
| `pnpm db:generate` | nowa migracja z różnicy schematu (`drizzle-kit generate`) |
| `pnpm db:migrate` | zastosowanie migracji na bazie z `DATABASE_URL` |
| `pnpm auth:generate` | regeneracja tabel Better Auth do `packages/db/src/schema/auth.ts` (wymaga `DATABASE_URL` w środowisku) |

Migracji i pliku `schema/auth.ts` nie edytuje się ręcznie — zawsze przez generatory powyżej.

## Struktura

```
apps/
  web/        Next.js (App Router) + shadcn/ui, klient tRPC, handler Better Auth   (planowane)
  worker/     cron: notowania, kursy NBP, CPI, scrapery                           (planowane)
packages/
  engine/     czysty TS: planMonth, pasma, accelerator, limity
  money/      bigint w najmniejszej jednostce, allocate, formatMoney, kursy
  db/         schemat Drizzle, migracje w drizzle/
  auth/       konfiguracja Better Auth
  api/        routery tRPC                                                         (planowane)
  sources/    fetch → parse → validate → snapshot per źródło                      (planowane)
```

## Zasady, których pilnuje kod

- **Pieniądze** to zawsze `bigint` w groszach/centach; wagi w punktach bazowych (4500 = 45%), kursy walut × 10⁶. Żadnej arytmetyki na `number` dla kwot — używaj `@pip/money`.
- **Silnik jest czysty.** `planMonth(state, surplus)` nie zna bazy ani sieci i nie wie, ile osób jest w gospodarstwie — widzi tylko konta, ich kolejki i pozostałe limity.
- **Jedno IKE i jedno IKZE na osobę.** IKE-Obligacje / IKZE-Obligacje zajmują ten sam slot. Pilnuje tego unikalny indeks w bazie i `validatePersonAccounts` w silniku; IKE/IKZE tylko w PLN (constraint `CHECK`).
- **Rejestracja zamknięta.** Pierwszy użytkownik zakłada instancję, kolejni tylko z ważnym zaproszeniem na swój e-mail (hook `user.create.before` w `packages/auth`).
- **Transakcje są źródłem prawdy.** Wartości, wagi i zyski są wyliczane, nigdy zapisywane.

## Silnik w skrócie

```ts
import { planMonth, DEFAULT_ACCELERATOR_TABLE } from "@pip/engine";

const plan = planMonth(state, 1_000_000n); // 10 000,00 zł nadwyżki
plan.items;      // przelewy: CUSHION | GOAL | OVERPAYMENT | BUY (konto, kwota w walucie konta, ilość)
plan.rationale;  // jedno zdanie per poduszka / nieruchomości / klasa
plan.alerts;     // OUT_OF_BAND | REAL_ESTATE_CONCENTRATION | NO_ACCOUNT_CAPACITY
plan.carryOutMinor; // reszta z zaokrągleń na następny miesiąc
```

Scenariusze w testach (`packages/engine/src/plan-month.test.ts`): budowa poduszki, start portfela 45/25/25/5 z wkładem własnym, spadek akcji o 30% (przykład 11.2), mieszkanie przeważone do 55% (etap C), accelerator i jego bezpiecznik na górnej granicy pasma, przepełniony limit IKE, singiel z IKE + IKZE-Obligacje, zaokrąglenia do całych jednostek.

---

Materiał edukacyjny, nie rekomendacja inwestycyjna ani podatkowa.
