export function formatPrice(price: number | null | undefined) {
  if (price === null || price === undefined) {
    return "Fee on request";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(price);
}

export function formatDate(date: string | null | undefined) {
  if (!date) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(date));
}

export function initials(value: string | null | undefined) {
  if (!value) {
    return "R9";
  }

  return value
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
