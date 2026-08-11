import { z } from "zod";

export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use ISO YYYY-MM-DD dates.").refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}, "Use a real calendar date in YYYY-MM-DD form.");

export const WeekdaySchema = z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
export const WorkoutReferenceFields = {
  workoutId: z.string().min(1).optional().describe("Stable COROS workout-library ID (preferred)"),
  workoutName: z.string().min(1).optional().describe("Exact workout name; fails if ambiguous"),
};
export const WorkoutReferenceSchema = z.object(WorkoutReferenceFields).strict().superRefine((value, context) => {
  if ((value.workoutId ? 1 : 0) + (value.workoutName ? 1 : 0) !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Provide exactly one of workoutId or workoutName." });
  }
});
export const PlanWorkoutSchema = z.object({
  ...WorkoutReferenceFields,
  weekday: WeekdaySchema.optional(),
  date: IsoDateSchema.optional(),
}).strict().superRefine((value, context) => {
  if ((value.workoutId ? 1 : 0) + (value.workoutName ? 1 : 0) !== 1) context.addIssue({ code: z.ZodIssueCode.custom, message: "Provide exactly one of workoutId or workoutName." });
  if ((value.weekday ? 1 : 0) + (value.date ? 1 : 0) !== 1) context.addIssue({ code: z.ZodIssueCode.custom, message: "Provide exactly one of weekday or date." });
});
export const TrainingPlanWeekSchema = z.object({ workouts: z.array(PlanWorkoutSchema).min(1).max(20) }).strict();
