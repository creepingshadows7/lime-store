const EURO_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const parseNumericValue = (rawValue) => {
  if (typeof rawValue === "number") {
    return rawValue;
  }

  if (typeof rawValue === "string") {
    const normalized = rawValue.replace(/[^\d,.-]/g, "").replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  return NaN;
};

export const formatEuro = (rawValue) => {
  const numericValue = parseNumericValue(rawValue);
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
  return EURO_FORMATTER.format(safeValue);
};

export default formatEuro;
