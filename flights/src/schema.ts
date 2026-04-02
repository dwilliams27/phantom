import { z } from "zod";

// --- Date Specs ---

const rollingOffsetSchema = z.object({
  offset: z.number().positive(),
  unit: z.enum(["days", "weeks", "months"]),
});

const rollingDateSpecSchema = z.object({
  type: z.literal("rolling"),
  earliest: rollingOffsetSchema,
  latest: rollingOffsetSchema,
});

const fixedDateSpecSchema = z.object({
  type: z.literal("fixed"),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const dateSpecSchema = z.discriminatedUnion("type", [rollingDateSpecSchema, fixedDateSpecSchema]);

export type RollingDateSpec = z.infer<typeof rollingDateSpecSchema>;
export type FixedDateSpec = z.infer<typeof fixedDateSpecSchema>;
export type DateSpec = z.infer<typeof dateSpecSchema>;

// --- Search Target ---

export const searchTargetInputSchema = z.object({
  name: z.string().optional(),
  origin: z.string().length(3).toUpperCase(),
  destination: z.string().length(3).toUpperCase(),
  passengers: z.number().int().min(1).default(1),
  class: z.enum(["economy", "business", "first"]).default("economy"),
  tripType: z.enum(["oneway", "roundtrip"]).default("roundtrip"),
  stops: z.enum(["any", "nonstop", "max1stop"]).default("any"),
  searchMode: z.enum(["points", "dollars"]).default("points"),
  duration: z.object({
    min: z.number().int().positive(),
    max: z.number().int().positive(),
    unit: z.literal("days"),
  }).optional(),
  dateSpec: dateSpecSchema,
});

export type SearchTargetInput = z.infer<typeof searchTargetInputSchema>;

export interface SearchTarget extends SearchTargetInput {
  id: string;
  name: string;
  airlines: string[];
  active: boolean;
  createdAt: string;
}

// --- Date Resolution ---

function addOffset(date: Date, offset: number, unit: "days" | "weeks" | "months"): Date {
  const result = new Date(date);
  switch (unit) {
    case "days":
      result.setDate(result.getDate() + offset);
      break;
    case "weeks":
      result.setDate(result.getDate() + offset * 7);
      break;
    case "months":
      result.setMonth(result.getMonth() + offset);
      break;
  }
  return result;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function resolveDateSpec(spec: DateSpec): { start: string; end: string } {
  if (spec.type === "fixed") {
    return { start: spec.start, end: spec.end };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    start: formatDate(addOffset(today, spec.earliest.offset, spec.earliest.unit)),
    end: formatDate(addOffset(today, spec.latest.offset, spec.latest.unit)),
  };
}
