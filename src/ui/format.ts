export function formatDecimalDown(value: number): string {
  return String(Math.floor(value * 10) / 10);
}

export const formatOrderPrice = formatDecimalDown;
