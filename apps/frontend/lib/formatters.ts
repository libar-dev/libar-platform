/**
 * Currency formatting utility
 * Formats a number as USD currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

/**
 * Date formatting utility
 * Formats a timestamp as a readable date string
 */
export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

/**
 * Relative time formatting utility
 * Formats a timestamp as a relative time string (e.g., "2 hours ago", "yesterday")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffInSeconds = Math.floor((now - timestamp) / 1000);

  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

  // Less than a minute
  if (diffInSeconds < 60) {
    return rtf.format(-diffInSeconds, "second");
  }

  // Less than an hour
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return rtf.format(-diffInMinutes, "minute");
  }

  // Less than a day
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return rtf.format(-diffInHours, "hour");
  }

  // Less than a week
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return rtf.format(-diffInDays, "day");
  }

  // Less than a month (approximate)
  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return rtf.format(-diffInWeeks, "week");
  }

  // Less than a year (approximate)
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return rtf.format(-diffInMonths, "month");
  }

  // Years
  const diffInYears = Math.floor(diffInDays / 365);
  return rtf.format(-diffInYears, "year");
}
