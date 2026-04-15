export const COUNTRIES: { code: string; name: string }[] = [
  { code: "US", name: "United States" },
  { code: "UK", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "IN", name: "India" },
  { code: "BR", name: "Brazil" },
  { code: "JP", name: "Japan" },
  { code: "SG", name: "Singapore" },
  { code: "RU", name: "Russia" },
];

export const EU_MEMBER_CODES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

export function isEuMemberCountry(code: string): boolean {
  return EU_MEMBER_CODES.includes(code);
}

export function countryFlag(code: string): string {
  // EU has no ISO 3166-1 alpha-2 code — use the flag emoji directly
  if (code === "EU") return "🇪🇺";
  // Convert each letter to its Unicode regional indicator symbol (A=0x1F1E6, B=0x1F1E7, ...)
  // Two regional indicators together form a country flag emoji
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}
