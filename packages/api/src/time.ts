const warsawDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" });

/** `YYYY-MM-DD` in Polish time, so a transfer late in the evening lands on the right day. */
export function today(): string {
  return warsawDate.format(new Date());
}

/** `YYYY-MM` */
export function currentMonth(): string {
  return today().slice(0, 7);
}
