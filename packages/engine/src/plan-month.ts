import {
  allocate,
  BP_SCALE,
  formatMoney,
  fromBase,
  maxBig,
  minBig,
  money,
  shareBp,
  sumBig,
  toDecimalString,
} from "@pip/money";
import { acceleratorMultiplierBp } from "./accelerator";
import { bandFor, renormalizedWeights, weightBp } from "./bands";
import type {
  Alert,
  Band,
  ClassState,
  EtfRounding,
  Plan,
  PlanItem,
  PlanState,
  PurchaseInstrument,
  Rationale,
} from "./types";

const QUANTITY_DIGITS = 4;
const QUANTITY_SCALE = 10n ** BigInt(QUANTITY_DIGITS);

interface Share {
  cls: ClassState;
  amount: bigint;
}

export function planMonth(state: PlanState, surplusMinor: bigint): Plan {
  if (surplusMinor < 0n) throw new RangeError("Nadwyżka nie może być ujemna");

  const items: PlanItem[] = [];
  const rationale: Rationale[] = [];
  const alerts: Alert[] = [];

  const realEstate = state.classes.find((c) => c.kind === "REAL_ESTATE");
  const investClasses = state.classes.filter((c) => c.kind !== "REAL_ESTATE");
  // Until a property is counted, the portfolio is equities/bonds/gold only, so bands use renormalized weights.
  const realEstateCounted = (realEstate?.valueMinor ?? 0n) > 0n;
  const bandClasses = realEstateCounted ? state.classes : investClasses;
  const bandWeights = renormalizedWeights(bandClasses);
  const bands = new Map(
    bandClasses.map((c) => [c.id, bandFor(bandWeights.get(c.id) ?? 0, c)] as const),
  );
  const bandTotal = sumBig(bandClasses.map((c) => c.valueMinor));

  // 1. Cushion
  const { cushion } = state;
  const cushionGap = maxBig(0n, cushion.targetMinor - cushion.balanceMinor);
  const toCushion = minBig(cushionGap, shareBp(surplusMinor, cushion.surplusShareBp));
  if (toCushion > 0n) {
    items.push({ kind: "CUSHION", accountId: cushion.accountId, amountMinor: toCushion });
    rationale.push({
      subject: "CUSHION",
      text: `Poduszce brakuje ${pln(cushionGap)} do celu ${pln(cushion.targetMinor)}, więc najpierw ${pln(toCushion)} idzie na poduszkę.`,
    });
  }
  const investable = surplusMinor - toCushion;
  let pool = investable + state.carryInMinor;

  // 2. Real-estate stream
  let toRealEstate = 0n;
  let overpayment = 0n;
  if (realEstate && investable > 0n) {
    const stream = shareBp(investable, realEstate.targetWeightBp);
    const { goal, mortgage } = state.realEstate;
    const band = bands.get(realEstate.id);
    const currentBp = weightBp(realEstate.valueMinor, bandTotal);
    let text: string;
    if (goal) {
      toRealEstate = minBig(stream, goal.remainingMinor);
      if (toRealEstate > 0n) {
        items.push({
          kind: "GOAL",
          goalId: goal.id,
          accountId: goal.accountId,
          amountMinor: toRealEstate,
        });
      }
      text =
        toRealEstate === stream
          ? `${pct(realEstate.targetWeightBp)} nadwyżki (${pln(stream)}) idzie na wkład własny, poza rebalancingiem.`
          : `Do wkładu własnego brakuje ${pln(goal.remainingMinor)}; reszta strumienia nieruchomości wraca do puli.`;
    } else if (mortgage && band && currentBp > band.upperBp) {
      text = `Nieruchomości mają ${pct(currentBp)} przy górnej granicy pasma ${pct(band.upperBp)}, więc nadpłata czeka, a ${pln(stream)} wraca do puli.`;
    } else if (mortgage) {
      toRealEstate = minBig(stream, mortgage.balanceMinor);
      overpayment = toRealEstate;
      if (overpayment > 0n) {
        items.push({ kind: "OVERPAYMENT", mortgageId: mortgage.id, amountMinor: overpayment });
      }
      text = `${pln(overpayment)} idzie w nadpłatę kredytu.`;
    } else {
      text = `Brak celu i kredytu, więc strumień nieruchomości (${pln(stream)}) wraca do puli.`;
    }
    pool -= toRealEstate;
    rationale.push({ subject: "REAL_ESTATE", text });
  }

  // 3. Split the pool: deficits against post-deposit targets first, any rest by weight
  const shares = splitPool(investClasses, pool);

  // 4. Accelerator
  const equityShare = shares.find((s) => s.cls.kind === "EQUITY");
  let acceleratorNote = "";
  const multiplierBp = acceleratorMultiplierBp(state.acceleratorTable, state.equityDrawdownBp);
  const equityBand = equityShare && bands.get(equityShare.cls.id);
  const equityAtUpperBand =
    equityShare !== undefined &&
    equityBand !== undefined &&
    bandTotal > 0n &&
    weightBp(equityShare.cls.valueMinor, bandTotal) >= equityBand.upperBp;
  if (equityAtUpperBand && multiplierBp > 10_000) {
    acceleratorNote = ` Accelerator wstrzymany: akcje są na górnej granicy pasma ${pct(equityBand.upperBp)}.`;
  } else if (equityShare && equityBand && multiplierBp > 10_000 && pool > 0n) {
    const weightSum = BigInt(investClasses.reduce((acc, c) => acc + c.targetWeightBp, 0));
    const base = (pool * BigInt(equityShare.cls.targetWeightBp)) / weightSum;
    const boosted = (base * BigInt(multiplierBp)) / BP_SCALE;
    const totalAfter = bandTotal + pool + (realEstateCounted ? overpayment : 0n);
    const cap = maxBig(
      0n,
      (totalAfter * BigInt(equityBand.upperBp)) / BP_SCALE - equityShare.cls.valueMinor,
    );
    const wanted = minBig(minBig(boosted, cap), pool);
    if (wanted > equityShare.amount) {
      const extra = wanted - equityShare.amount;
      const others = shares.filter((s) => s !== equityShare);
      const cuts = allocate(
        extra,
        others.map((s) => s.amount),
      );
      others.forEach((s, i) => {
        s.amount -= cuts[i] ?? 0n;
      });
      equityShare.amount = wanted;
      acceleratorNote = ` Accelerator ×${multiplier(multiplierBp)} przy spadku ${pct(state.equityDrawdownBp)} dokłada ${pln(extra)} kosztem pozostałych klas.`;
    } else if (boosted > equityShare.amount && cap <= equityShare.amount) {
      acceleratorNote = ` Accelerator wstrzymany: akcje doszły do górnej granicy pasma ${pct(equityBand.upperBp)}.`;
    }
  }

  if (pool > 0n) {
    for (const { cls, amount } of shares) {
      const position =
        bandTotal === 0n
          ? "portfel startuje"
          : `${pct(weightBp(cls.valueMinor, bandTotal))} przy celu ${pct(bandWeights.get(cls.id) ?? 0)}`;
      const text =
        amount > 0n
          ? `${cls.name}: ${position} → ${pln(amount)}.`
          : `${cls.name}: ${position} — w tym miesiącu bez wpłat, inne klasy są bardziej niedoważone.`;
      rationale.push({
        subject: cls.id,
        text: cls.kind === "EQUITY" ? text + acceleratorNote : text,
      });
    }
  }

  // 5–6. Map to accounts within remaining limits and round to purchasable units
  const accounts = new Map(state.accounts.map((a) => [a.id, a]));
  const room = new Map(state.accounts.map((a) => [a.id, a.remainingLimitMinor]));
  let carryOutMinor = 0n;
  for (const { cls, amount } of shares) {
    if (amount === 0n) continue;
    const { instrument } = cls;
    if (!instrument) throw new Error(`Klasa „${cls.name}” nie ma instrumentu do zakupu`);
    let left = amount;
    for (const accountId of cls.accountQueue) {
      if (left === 0n) break;
      const account = accounts.get(accountId);
      if (!account) throw new Error(`Nieznane konto ${accountId} w kolejce klasy „${cls.name}”`);
      const limit = room.get(accountId) ?? null;
      const take = limit === null ? left : minBig(left, limit);
      if (take <= 0n) continue;
      const { spentMinor, quantity } = roundPurchase(take, instrument, state.etfRounding);
      left -= take;
      carryOutMinor += take - spentMinor;
      if (limit !== null) room.set(accountId, limit - spentMinor);
      if (spentMinor > 0n) {
        items.push({
          kind: "BUY",
          classId: cls.id,
          accountId,
          instrumentId: instrument.id,
          amountMinor: spentMinor,
          accountAmountMinor: fromBase(spentMinor, account.fxRate),
          currency: account.currency,
          quantity,
        });
      }
    }
    if (left > 0n) {
      alerts.push({ type: "NO_ACCOUNT_CAPACITY", classId: cls.id, unplacedMinor: left });
      carryOutMinor += left;
    }
  }

  // 7. Bands after this month's deposits
  const valueAfter = new Map(bandClasses.map((c) => [c.id, c.valueMinor]));
  for (const { cls, amount } of shares) {
    valueAfter.set(cls.id, cls.valueMinor + amount);
  }
  if (realEstate && realEstateCounted) {
    valueAfter.set(realEstate.id, realEstate.valueMinor + overpayment);
  }
  const totalAfter = sumBig([...valueAfter.values()]);
  if (totalAfter > 0n) {
    for (const cls of bandClasses) {
      const band = bands.get(cls.id);
      const value = valueAfter.get(cls.id) ?? 0n;
      if (!band) continue;
      const current = weightBp(value, totalAfter);
      if (current >= band.lowerBp && current <= band.upperBp) continue;
      if (cls.kind === "REAL_ESTATE") {
        if (current > band.upperBp) {
          alerts.push({
            type: "REAL_ESTATE_CONCENTRATION",
            classId: cls.id,
            weightBp: current,
            band,
          });
        }
        continue;
      }
      const months = monthsToReturn(value, totalAfter, band, surplusMinor);
      if (months === null || months > state.alertMonthsThreshold) {
        alerts.push({
          type: "OUT_OF_BAND",
          classId: cls.id,
          weightBp: current,
          band,
          monthsToReturn: months,
        });
      }
    }
  }

  const allocation: Record<string, bigint> = Object.fromEntries(
    shares.map((s) => [s.cls.id, s.amount]),
  );
  if (realEstate) allocation[realEstate.id] = toRealEstate;

  return {
    month: state.month,
    surplusMinor,
    items,
    rationale,
    alerts,
    allocation,
    carryOutMinor,
  };
}

function splitPool(classes: readonly ClassState[], pool: bigint): Share[] {
  const weightSum = BigInt(classes.reduce((acc, c) => acc + c.targetWeightBp, 0));
  if (weightSum === 0n) {
    if (pool > 0n) throw new Error("Brak klas aktywów z wagą docelową");
    return classes.map((cls) => ({ cls, amount: 0n }));
  }
  const totalAfter = sumBig(classes.map((c) => c.valueMinor)) + pool;
  const deficits = classes.map((c) =>
    maxBig(0n, (totalAfter * BigInt(c.targetWeightBp)) / weightSum - c.valueMinor),
  );
  const fromDeficits = minBig(pool, sumBig(deficits));
  const byDeficit = allocate(fromDeficits, deficits);
  const byWeight = allocate(
    pool - fromDeficits,
    classes.map((c) => BigInt(c.targetWeightBp)),
  );
  return classes.map((cls, i) => ({ cls, amount: (byDeficit[i] ?? 0n) + (byWeight[i] ?? 0n) }));
}

function roundPurchase(
  amountMinor: bigint,
  instrument: PurchaseInstrument,
  etfRounding: EtfRounding,
): { spentMinor: bigint; quantity: string | null } {
  const price = instrument.unitPriceMinor;
  if (price === null) return { spentMinor: amountMinor, quantity: null };
  const wholeUnits =
    instrument.type === "BOND" || (instrument.type === "ETF" && etfRounding === "WHOLE");
  if (wholeUnits) {
    const units = amountMinor / price;
    return { spentMinor: units * price, quantity: units.toString() };
  }
  return {
    spentMinor: amountMinor,
    quantity: toDecimalString((amountMinor * QUANTITY_SCALE) / price, QUANTITY_DIGITS),
  };
}

/** Months of new money needed to bring a class back into its band without selling. */
function monthsToReturn(
  value: bigint,
  total: bigint,
  band: Band,
  monthlyMinor: bigint,
): number | null {
  const lower = BigInt(band.lowerBp);
  const upper = BigInt(band.upperBp);
  let gap: bigint;
  if (value * BP_SCALE < lower * total) {
    // Money x into this class: (v + x) / (T + x) = lower
    gap = divCeil(lower * total - value * BP_SCALE, BP_SCALE - lower);
  } else {
    // Money x into other classes: v / (T + x) = upper
    if (upper === 0n) return null;
    gap = divCeil(value * BP_SCALE - upper * total, upper);
  }
  if (monthlyMinor <= 0n) return null;
  return Number(divCeil(gap, monthlyMinor));
}

function divCeil(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

function pln(minor: bigint): string {
  return formatMoney(money(minor));
}

function pct(bp: number): string {
  return `${(bp / 100).toFixed(1).replace(".", ",")}%`;
}

function multiplier(bp: number): string {
  return (bp / 10_000).toFixed(1).replace(".", ",");
}
