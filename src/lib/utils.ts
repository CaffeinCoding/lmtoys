import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Removes leading zeros from a numeric string, while preserving '0.' for decimals.
 * Useful for number inputs to prevent values like '012'.
 */
export function removeLeadingZeros(value: string | number): string {
  const s = String(value);
  if (!s) return "0";
  
  // If it's just '0', keep it
  if (s === "0") return "0";
  
  // If it starts with '0.', keep it (e.g. 0.5)
  if (s.startsWith("0.")) return s;
  
  // Otherwise, remove leading zeros
  const cleaned = s.replace(/^0+/, "");
  
  // If we removed everything (e.g. "000"), return "0"
  return cleaned === "" || cleaned.startsWith(".") ? "0" + cleaned : cleaned;
}
