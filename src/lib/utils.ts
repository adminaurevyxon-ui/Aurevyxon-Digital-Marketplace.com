import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function safeJson(res: any, fallback: any = {}): Promise<any> {
  try {
    if (!res) return fallback;
    if (typeof res.text === "function") {
      const text = await res.text();
      if (!text || typeof text !== "string" || text.trim().startsWith("<")) {
        return fallback;
      }
      return JSON.parse(text);
    }
    if (typeof res.json === "function") {
      return await res.json();
    }
    if (typeof res === "string") {
      if (res.trim().startsWith("<")) return fallback;
      return JSON.parse(res);
    }
    return res || fallback;
  } catch {
    return fallback;
  }
}
