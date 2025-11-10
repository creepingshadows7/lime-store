import { formatEuro } from "./currency";

const parsePrice = (value) => {
  if (value === null || value === undefined) {
    return NaN;
  }
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : NaN;
};

export const getPricingDetails = (price, discountPrice) => {
  const baseRaw = parsePrice(price);
  const baseValue = Number.isFinite(baseRaw) && baseRaw > 0 ? baseRaw : 0;
  const discountRaw = parsePrice(discountPrice);
  const hasDiscount =
    Number.isFinite(discountRaw) && discountRaw > 0 && discountRaw < baseValue;
  const discountValue = hasDiscount ? discountRaw : null;
  const currentValue = hasDiscount ? discountValue : baseValue;

  const savingsPercent =
    hasDiscount && baseValue > 0
      ? Math.min(
          99,
          Math.max(1, Math.round(((baseValue - discountValue) / baseValue) * 100))
        )
      : null;

  return {
    baseValue,
    currentValue,
    discountValue,
    hasDiscount,
    baseLabel: formatEuro(baseValue),
    currentLabel: formatEuro(currentValue),
    discountLabel: discountValue !== null ? formatEuro(discountValue) : null,
    savingsPercent,
  };
};

export default getPricingDetails;
