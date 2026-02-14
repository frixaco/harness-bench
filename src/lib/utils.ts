export function cn(...inputs: Array<ClassValue>) {
  return twMerge(clsx(inputs));
}

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ClassValue } from "clsx";

