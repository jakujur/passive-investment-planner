# Tracker inwestycji — specyfikacja

Oct 4, 2026 · @Jakub

## Cel i założenia

Aplikacja co miesiąc mówi, ile i na które konto przelać, żeby portfel wracał do wag docelowych, oraz pokazuje majątek i zysk każdej klasy aktywów. Realizuje algorytm z poradnika *Inwestowanie od zera*.

Założenia wersji 1:

- **Broker:** XTB, bez API. Dane z importu CSV/XLSX lub ręcznie.
- **Waluty:** IKE i IKZE tylko w PLN. Zwykłe konta mogą być w dowolnej walucie, przeliczane kursem NBP.
- **Tylko wpłaty:** żadnych wypłat ani sprzedaży. Rebalancing wyłącznie nowymi wpłatami (zmienną kwotą). Gdy nowe wpłaty nie wystarczają — tylko informacja.
- **Klasy aktywów:** globalne akcje (ETF), obligacje skarbowe (EDO i inne detaliczne), nieruchomości, złoto. Bez Catalyst i bez zamienników typu IB01.
- **Benchmark:** każda klasa ma przypisany indeks odniesienia i wagę w portfelu, do porównywania zysków.
- **Użytkownicy:** gospodarstwo domowe z jedną osobą (singiel) albo z wieloma osobami (np. małżonkowie), każda z własnymi kontami i limitami. Silnik nie zakłada liczby osób.
- **Dostęp:** aplikacja wymaga logowania; dane gospodarstwa widzą wyłącznie jego członkowie.
- **Pieniądze:** w bazie w groszach/centach (liczby całkowite), na froncie formatowane jako zł.gr.

## Gospodarstwo jednoosobowe i opakowania podatkowe

Każda osoba może mieć **jedno IKE i jedno IKZE**. IKE-Obligacje i IKZE-Obligacje to nie dodatkowe konta, tylko te same sloty u innego dostawcy (PKO BP), więc:

- Osoba ma co najwyżej jedno konto z rodziny IKE (`IKE` **albo** `IKE_OBLIGACJE`) i jedno z rodziny IKZE (`IKZE` **albo** `IKZE_OBLIGACJE`). Walidacja przy tworzeniu konta.
- Limit roczny liczony jest per osoba i per rodzina opakowania, nie per konto.
- Konta zwykłe (`REGULAR`) i gotówkowe (`CASH`) bez ograniczeń liczby.

Singiel ma więc dwa opakowania zamiast czterech (2026: 28 260 + 11 304 zł, przedsiębiorca 28 260 + 16 956 zł). Przy nadwyżce rzędu 10 000 zł/mies. większość wpłat spływa na zwykłe konta, dlatego kolejka kont musi zawsze kończyć się kontem bez limitu.

Przy zakładaniu gospodarstwa kreator proponuje gotowe kolejki (do ręcznej zmiany później):

| Wariant | IKE | IKZE | Kolejka akcji | Kolejka obligacji |
| --- | --- | --- | --- | --- |
| Singiel A (domyślny) | ETF | ETF | IKE → IKZE → zwykłe | zwykłe (EDO z Belką) |
| Singiel B | ETF | IKZE-Obligacje (EDO) | IKE → zwykłe | IKZE-Obligacje → zwykłe |
| Singiel C | IKE-Obligacje (EDO) | ETF | IKZE → zwykłe | IKE-Obligacje → zwykłe |
| Para (model z poradnika) | os. 1: ETF, os. 2: IKE-Obligacje | obie: ETF | IKE os. 1 → IKZE os. 1 → IKZE os. 2 → zwykłe | IKE-Obligacje os. 2 → zwykłe |

Konsekwencje w UI dla singla: jeden zestaw pasków limitów, brak podziału „per osoba” na dashboardzie i w planie, ustawienia osób zwinięte do jednej sekcji z możliwością dodania kolejnej osoby (przejście singiel → para bez migracji danych).

## Uwierzytelnianie i autoryzacja

- **Biblioteka:** Better Auth (adapter Drizzle, ta sama baza Postgres). Logowanie e-mail + hasło, sesja w ciasteczku httpOnly, `secure`, `sameSite=lax`. Hasło min. 12 znaków, wbudowany rate limit logowania.
- **Rejestracja otwarta** (e-mail + hasło). Każdy nowy użytkownik zakłada własne gospodarstwo w kreatorze. Dołączenie do istniejącego gospodarstwa (małżonek) — przez zaproszenie: jednorazowy link ważny 7 dni, przypisany do adresu e-mail (etap 5).
- **User ≠ Person.** `User` to login, `Person` to podmiot podatkowy z limitami. `Person.userId` jest opcjonalne — jedna osoba może prowadzić finanse całego gospodarstwa, a małżonek nie musi mieć konta.
- **Role:** `OWNER` (zaprasza i usuwa członków) i `MEMBER`. Obie role mają pełny dostęp do danych finansowych gospodarstwa.
- **tRPC:** `protectedProcedure` wymaga sesji; `householdProcedure` dokłada `householdId` z członkostwa. Każde zapytanie filtruje po `householdId`, a każde `id` z inputu jest sprawdzane pod kątem przynależności do gospodarstwa (brak dostępu = `NOT_FOUND`, nie `FORBIDDEN`).
- **Worker** nie używa sesji. Pracuje wyłącznie na danych globalnych (kursy, notowania, CPI, oferta obligacji, limity), które nie mają `householdId`.

## Ekrany

Główną stroną jest dashboard. Z każdej karty klasy aktywów prowadzi link do jej ustawień. Wszystkie ekrany poza logowaniem i akceptacją zaproszenia wymagają sesji.

### Logowanie

- Logowanie, wylogowanie, reset hasła.
- Rejestracja, potem kreator gospodarstwa: wariant kont (tabela wyżej), osoby, stała miesięczna wpłata, poduszka, opcjonalny cel na wkład własny.
- Akceptacja zaproszenia: ustawienie hasła i dołączenie do gospodarstwa.

### Dashboard

- Wartość netto (z mieszkaniem własnym) i wartość portfela inwestycyjnego (bez niego).
- Wykres wartości portfela na tle sumy wpłat, w stylu XTB; zysk jako XIRR, opcjonalnie linia benchmarku.
- Karty klas: waga aktualna vs docelowa z pasmem, zysk vs indeks odniesienia, link do ustawień.
- **Plan miesiąca:** liczony automatycznie ze stałej miesięcznej wpłaty (ustawienia), z opcją „w tym miesiącu wpłacam więcej” → lista przelewów (konto, kwota, co kupić) + jedno zdanie uzasadnienia. Przycisk „wykonane” księguje miesiąc: serwer liczy plan ponownie i zamienia go w transakcje; jeden zaksięgowany plan na miesiąc.
- Paski wykorzystania limitów IKE/IKZE na bieżący rok, osobno dla każdej osoby (u singla jeden zestaw).
- Alerty: klasa poza pasmem, której nie da się naprawić nowymi wpłatami w rozsądnym czasie; koncentracja nieruchomości; nieudane pobranie danych.

### Akcje (ETF)

- Konta i kolejka wypełniania (IKE → IKZE → zwykłe).
- Transakcje: data, konto, instrument (ISIN/ticker), ilość, cena, waluta, kurs; dodawanie wstecz; import CSV/XLSX z XTB.
- Wykres pozycji i zysk per konto.

### Obligacje

- Posiadane serie (EDO itd.): data zakupu, liczba sztuk, konto (IKE-Obligacje, IKZE-Obligacje lub zwykłe), wycena automatyczna z CPI.
- Porównywarka bieżącej oferty obligacji detalicznych ze scrapera: oprocentowanie, marża, opłata za wcześniejszy wykup, realny zwrot przy założonej inflacji, z Belką i bez.

### Nieruchomości

- U góry: czynsz za mieszkanie, w którym mieszkasz, jeśli nie masz własnego (wpływa na wydatki i poduszkę, nie na portfel).
- Lista mieszkań. Każde ma dwa wymiary: przeznaczenie (własne / wynajem) i finansowanie (gotówka / kredyt).
  - Kredyt: saldo, oprocentowanie, rata; saldo aktualizowane nadpłatami.
  - Własne: tylko wzrost wartości; domyślnie poza rebalancingiem.
  - Wynajem: czynsz, koszty, pustostan → „dywidenda” netto + wzrost wartości.
- Pod listą „+ dodaj cel”: kolejne mieszkanie jako cel z kwotą wkładu własnego i paskiem postępu.
- Obok „+” alert koncentracji, gdy nieruchomości przekraczają pasmo.

### Złoto

- Pozycja z ilością i ręczną wyceną lub notowaniem.

### Ustawienia globalne

- Osoby w gospodarstwie i ich konta (z walidacją jednego IKE i jednego IKZE na osobę).
- Członkowie gospodarstwa (użytkownicy) i zaproszenia.
- Wagi klas (slidery z blokadą sumy 100%), pasma, benchmark per klasa.
- Tabela progu acceleratora.
- Wydatki miesięczne i docelowa poduszka.
- Źródła danych: status ostatniego pobrania, ręczne nadpisanie wartości, dziennik zmian.

## Reguły silnika

Sercem aplikacji jest czysta funkcja `planMonth(state, surplus) → Plan`. Nie zna bazy ani sieci: dostaje stan i zwraca listę przelewów, uzasadnienie i alerty. Nie zna też liczby osób — widzi tylko konta, ich kolejki i pozostałe limity.

### Kroki planu miesiąca

1. **Poduszka.** Jeśli poduszka jest poniżej celu, cała nadwyżka (lub skonfigurowana część) idzie na poduszkę. Poduszka nigdy nie wchodzi do rebalancingu.
2. **Strumień nieruchomości.** Kwota = waga nieruchomości × nadwyżka.
   - Jest aktywny cel (zbieranie na wkład): kwota idzie na konto celu, poza rebalancingiem.
   - Brak celu, jest kredyt na mieszkaniu w rebalancingu: kwota idzie w nadpłatę, chyba że nieruchomości są powyżej pasma — wtedy wraca do puli.
   - Brak celu i kredytu: kwota wraca do puli.
3. **Podział puli między klasy.** Wagi pozostałych klas są renormalizowane do 100% (np. 45 : 25 : 5 → 60 / 33,3 / 6,7%). Najpierw dopłacane są niedobory względem celu (wartość docelowa po wpłacie minus wartość bieżąca), proporcjonalnie do ich wielkości. Nadwyżka ponad sumę niedoborów jest dzielona według wag.
4. **Accelerator.** Mnożnik z tabeli zależnie od spadku indeksu akcji od szczytu. Zwiększa kwotę na akcje kosztem pozostałych klas w tym miesiącu, nigdy kosztem poduszki. Kończy się, gdy akcje dojdą do górnej granicy pasma.
5. **Mapowanie na konta.** Każda klasa ma kolejkę kont (np. akcje: IKE → IKZE → zwykłe; obligacje: IKE-Obligacje → zwykłe). Silnik wypełnia kolejkę do pozostałego rocznego limitu każdego konta, reszta spływa dalej. Limit jest współdzielony, gdy to samo konto występuje w kilku kolejkach.
6. **Zaokrąglenia.** Obligacje w pełnych 100 zł. ETF według ustawienia: całe jednostki albo ułamkowe. Reszta trafia jako gotówka do następnego miesiąca.
7. **Wynik.** Lista przelewów (konto, kwota w walucie konta, instrument, ilość), jedno zdanie uzasadnienia per klasa i alerty.

### Pasma i alerty

- Pasmo ±5 pp dla klas z wagą ≥ 20%, ±25% wagi dla mniejszych (złoto 5% → 3,75–6,25%).
- Dopóki żadne mieszkanie nie jest liczone do rebalancingu, pasma liczone są od wag renormalizowanych bez nieruchomości (akcje 45% → 60%).
- Sprzedaży nie ma, więc alert pojawia się, gdy klasa jest poza pasmem, a szacowana liczba miesięcy do powrotu (luka / miesięczna wpłata) przekracza konfigurowalny próg, np. 12.
- Sprawdzanie pasm: przy każdym planie; pełny przegląd raz w roku.

### Limity

- Limit roczny per osoba i rodzina opakowania (IKE / IKZE), zależny od roku i rodzaju (IKZE zwykłe / przedsiębiorcy).
- Wykorzystanie = suma wpłat w roku kalendarzowym. Silnik nigdy nie planuje wpłaty ponad limit.

### Wyceny i zysk

- Wartość ETF = ilość × cena × kurs NBP. EDO = nominał skapitalizowany według oprocentowania serii i CPI.
- Zysk portfela i klas jako XIRR (ważony kapitałem). Porównanie z benchmarkiem: symulacja tych samych wpłat w indeks odniesienia.
- Mieszkanie: kapitał własny = wartość − saldo kredytu; do rebalancingu tylko mieszkania z przełącznikiem „liczyć”.

## Model danych

Źródłem prawdy są transakcje. Wartości, wagi i zyski są zawsze wyliczane z transakcji i notowań, nigdy zapisywane. Kwoty jako `bigint` w najmniejszej jednostce waluty.

| Encja | Kluczowe pola | Uwagi |
| --- | --- | --- |
| User, Session, AuthAccount, Verification | wg Better Auth | Generowane przez CLI Better Auth |
| HouseholdMember | householdId, userId, role (OWNER / MEMBER) | User należy do jednego gospodarstwa |
| HouseholdInvite | id, householdId, email, tokenHash, expiresAt, acceptedAt | Jednorazowe, 7 dni |
| Household | id, name, baseCurrency (PLN) | Jedno gospodarstwo = jeden zestaw wag |
| Person | id, householdId, userId?, name, isEntrepreneur | Flaga decyduje o limicie IKZE |
| Account | id, personId, broker, wrapper (IKE / IKE\_OBLIGACJE / IKZE / IKZE\_OBLIGACJE / REGULAR / CASH), currency, assetClassId | IKE/IKZE wymuszają PLN; max jedno IKE\* i jedno IKZE\* na osobę |
| AssetClass | id, householdId, kind, name, targetWeight, bandAbs, bandRel, benchmarkInstrumentId, purchaseInstrumentId, accountQueue\[\] | Wagi w punktach bazowych (4500 = 45%); jedna klasa danego rodzaju na gospodarstwo |
| Instrument | id, isin, ticker, type (ETF / BOND / GOLD), currency, assetKind | Globalne jak notowania, więc wskazują rodzaj klasy, nie klasę gospodarstwa |
| Transaction | id, accountId, instrumentId, date, type (BUY / DEPOSIT / FEE / INTEREST), quantity, priceMinor, fxRate, amountMinor, source (manual / import / plan) | Brak SELL i WITHDRAW w v1 |
| BondLot | id, accountId, series, purchaseDate, units | Wycena z oferty serii + CPI |
| Property | id, name, usage (OWN / RENTAL), valueMinor, valuationDate, includeInRebalancing | Własne domyślnie false |
| Mortgage | id, propertyId, balanceMinor, rate, installmentMinor | Saldo zmniejszają transakcje nadpłaty |
| RentalIncome | propertyId, rentMinor, costsMinor, vacancyMonthsPerYear | „Dywidenda” netto |
| PropertyGoal | id, name, targetDownPaymentMinor, accountId, status (ACTIVE / DONE) | Konto celu poza rebalancingiem |
| Settings | householdId, monthlyExpensesMinor, cushionMonths, currentRentMinor, acceleratorTable, alertMonthsThreshold, etfRounding | Czynsz tylko przy braku własnego mieszkania |
| Plan | id, month, surplusMinor, items\[\], status (DRAFT / DONE) | „Wykonane” tworzy transakcje |
| Price | instrumentId, date, closeMinor, currency | Dzienne notowania, globalne |
| FxRate | currency, date, rate | Tabela A NBP, globalne |
| DataSnapshot | sourceId, key, value, effectiveFrom, fetchedAt, status (OK / PENDING\_REVIEW / MANUAL) | Limity, oferta obligacji, CPI; globalne |

## Źródła danych

API wszędzie, gdzie istnieje; scraper tylko tam, gdzie API brak. Każde źródło to moduł fetch → parse → validate → snapshot. Konkretne adresy do potwierdzenia przy implementacji.

| Dane | Metoda | Częstotliwość | Walidacja | Gdy się nie uda |
| --- | --- | --- | --- | --- |
| Kursy walut | API NBP (tabela A) | Codziennie | Kurs > 0, zmiana dzienna < 10% | Ostatni znany kurs + znacznik daty |
| Notowania ETF | Yahoo chart API (nieoficjalne; Stooq blokuje pobieranie wyzwaniem JS) | Codziennie | Cena > 0, zmiana dzienna < 20% | Ostatnia cena + ostrzeżenie na dashboardzie |
| Cena złota | API NBP (cenyzlota, PLN za gram) | Codziennie | Cena > 0, zmiana dzienna < 20% | Ostatnia cena + ostrzeżenie na dashboardzie |
| CPI (wycena EDO) | API GUS lub scraper komunikatu | Miesięcznie | Zakres −10…+30% r/r | Status PENDING\_REVIEW, wycena na ostatnim CPI |
| Oferta obligacji detalicznych | Scraper strony z ofertą MF | Miesięcznie | Znane typy serii, oprocentowanie 0–15% | Komunikat „nie udało się pobrać” + ręczne wpisanie |
| Limity IKE/IKZE | Scraper komunikatu MRPiPS na gov.pl | Raz w roku (grudzień) + na żądanie | Limit w zakresie 10–60 tys., zmiana r/r < 20% | Komunikat „nie udało się pobrać” + formularz własnych wartości |
| Transakcje XTB | Import CSV/XLSX eksportu | Na żądanie | Deduplikacja po ID operacji | Wpis ręczny |

Zasady wspólne:

- Każdy odczyt to nowy `DataSnapshot` z `effectiveFrom`, nigdy nadpisanie. Historyczne plany liczą się na historycznych wartościach.
- Wartość spoza zakresu walidacji dostaje status PENDING\_REVIEW i nie jest używana do czasu zatwierdzenia.
- Ręczna wartość ma status MANUAL i wygrywa z pobraną do czasu, aż użytkownik ją zdejmie.
- Dziennik zmian w ustawieniach: data, źródło, stara i nowa wartość, status.
- Scrapery z cache, nagłówkiem User-Agent i przestrzeganiem robots.txt; bez Playwrighta, wystarczy cheerio.

## Architektura

Turborepo z Next.js + shadcn/ui na froncie, tRPC jako API i osobnym workerem na zadania cykliczne.

```
apps/
  web/        Next.js (App Router) + shadcn/ui, klient tRPC, handler Better Auth
  worker/     cron: notowania, kursy NBP, CPI, scrapery
packages/
  engine/     czysty TS: planMonth, wyceny EDO, XIRR, pasma, accelerator, limity
  api/        routery tRPC (household, accounts, transactions, plan, sources)
  auth/       konfiguracja Better Auth, helpery sesji i członkostwa
  db/         schema Drizzle + migracje, Postgres
  sources/    moduł per źródło: fetch → parse → validate → snapshot
  money/      typy Money, formatowanie zł.gr, przeliczenia walut
  ui/         współdzielone komponenty shadcn
```

Decyzje:

- **Pieniądze** w bazie jako liczby całkowite w najmniejszej jednostce; w TS jako `bigint`, przez tRPC z `superjson`. Osobny pakiet `money`, żeby nikt nie robił arytmetyki na `number`.
- **`engine` bez zależności** od bazy i sieci. Testy jednostkowe na scenariuszach z poradnika: spadek akcji o 30%, przepełniony limit IKE, faza wkład własny → nadpłaty, singiel z jednym IKE i jednym IKZE.
- **Worker osobno**, bo Next nie ma natywnego crona, a padnięty scraper nie powinien kłaść aplikacji.
- **Walidacja wejść** tRPC przez schematy współdzielone między `api` a formularzami w `web`.
- **ORM:** Drizzle; migracje wyłącznie przez `drizzle-kit generate`, tabele auth przez CLI Better Auth.

## Kolejność budowy

Najpierw silnik i plan miesiąca na ręcznych danych, potem automatyczne źródła, na końcu prognozy.

1. **MVP:** `engine` z testami, logowanie i bootstrap gospodarstwa (singiel lub para), ustawienia wag i kont, ręczne transakcje, plan miesiąca z przyciskiem „wykonane”, paski limitów. Limity wpisane ręcznie.
2. **Wyceny:** kursy NBP, notowania ETF, wycena EDO z CPI, wykres wartości vs wpłaty, XIRR, dashboard z kartami klas.
3. **Nieruchomości:** lista mieszkań z przeznaczeniem i kredytem, cele z paskiem postępu, nadpłaty, alert koncentracji.
4. **Źródła automatyczne:** worker, scrapery limitów i oferty obligacji, statusy i dziennik zmian, porównywarka obligacji.
5. **Import XTB** z deduplikacją i benchmarki per klasa; zaproszenia kolejnych członków gospodarstwa.
6. **Prognozy:** Monte Carlo z wachlarzem percentyli, pytania odwrócone („kiedy X?”, „ile wpłacać?”), scenariusz krachu.
