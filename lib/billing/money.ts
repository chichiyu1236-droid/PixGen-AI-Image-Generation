const cnyFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
});

/** Formats an integer amount in fen as a zh-CN currency string, e.g. 990 -> ¥9.90. */
export function formatFenAsCny(amountFen: number): string {
  return cnyFormatter.format(amountFen / 100);
}

/** Converts fen to the yuan string aggregators expect, e.g. 990 -> "9.90". */
export function fenToYuanString(amountFen: number): string {
  return (amountFen / 100).toFixed(2);
}

/** Parses a yuan amount string ("9.90", "9.9") into fen. Throws on invalid input. */
export function yuanStringToFen(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error(`invalid_yuan_amount: ${value}`);
  }

  return Math.round(Number.parseFloat(value) * 100);
}
