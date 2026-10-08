export const FYE_BASE_CURRENCY = "USD";

export function assertSupportedCurrency(currency: string): void {
  if (currency.toUpperCase() !== FYE_BASE_CURRENCY) {
    throw new Error(
      `Only ${FYE_BASE_CURRENCY} is supported until FX conversion is implemented`,
    );
  }
}
