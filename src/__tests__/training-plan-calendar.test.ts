import { afterEach, describe, expect, it, vi } from "vitest";
import calendarFixture from "./fixtures/training-calendar.json";
import {
  addTrainingPlan,
  buildCustomStrengthExercisePayload,
  buildRemoveScheduledWorkoutPayload,
  buildScheduleWorkoutPayload,
  buildTrainingPlanPayload,
  queryTrainingCalendar,
  TRAINING_HUB_PRIVATE_ENDPOINTS,
} from "../coros-api.js";
import type { AuthData } from "../types.js";

const auth: AuthData = {
  accessToken: "redacted-token",
  userId: "redacted-user",
  region: "eu",
  timestamp: 0,
};

function jsonResponse(data: unknown) {
  return { json: async () => data } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("training plan and calendar payloads", () => {
  it("lays out a four-workout week with zero-based COROS day numbers", () => {
    const payload = buildTrainingPlanPayload("Four day strength", "", [
      { dayNo: 0, sortNoInSchedule: 0, program: { id: "a", name: "A" } },
      { dayNo: 1, sortNoInSchedule: 0, program: { id: "b", name: "B" } },
      { dayNo: 3, sortNoInSchedule: 0, program: { id: "c", name: "C" } },
      { dayNo: 5, sortNoInSchedule: 0, program: { id: "d", name: "D" } },
    ], "eu");

    expect(payload.region).toBe(3);
    expect(payload.totalDay).toBe(6);
    expect(payload.entities.map((entry) => entry.dayNo)).toEqual([0, 1, 3, 5]);
    expect(payload.programs.map((program) => program.idInPlan)).toEqual([1, 2, 3, 4]);
  });

  it("keeps US plan payloads on the US Training Hub region code", () => {
    const payload = buildTrainingPlanPayload("US", "", [
      { dayNo: 0, sortNoInSchedule: 0, program: { id: "a" } },
    ], "us");
    expect(payload.region).toBe(1);
  });

  it("builds a schedule write using YYYYMMDD only internally", () => {
    const payload = buildScheduleWorkoutPayload({ id: "workout-1", name: "Strength" }, "2026-08-17", 43);
    expect(payload.entities).toEqual([{ happenDay: "20260817", idInPlan: 43, sortNoInSchedule: 0 }]);
    expect(payload.versionObjects).toEqual([{ id: 43, status: 1 }]);
  });

  it("builds a remove payload only after an unambiguous calendar entry is selected", () => {
    expect(buildRemoveScheduledWorkoutPayload(calendarFixture.entities[0])).toEqual({
      versionObjects: [{ id: 42, planId: "plan-1", planProgramId: "program-1", status: 3 }],
      pbVersion: 2,
    });
  });

  it("uses COROS's verified custom-strength defaults", () => {
    const payload = buildCustomStrengthExercisePayload({ name: "Custom row", overview: "", part: 3, muscle: 3, equipment: 6 });
    expect(payload).toMatchObject({ sportType: 4, part: [3], muscle: [3], equipment: [6], targetType: 3, targetValue: 15, restValue: 30 });
    expect(payload.muscleRelevance).toEqual([]);
  });

  it("reads calendar data with ISO boundary dates and never mutates", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ result: "0000", data: calendarFixture }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(queryTrainingCalendar(auth, "2026-08-17", "2026-08-17")).resolves.toEqual(calendarFixture);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`${TRAINING_HUB_PRIVATE_ENDPOINTS.scheduleQuery}?startDate=20260817&endDate=20260817&supportRestExercise=1`);
    expect(init.method).toBe("GET");
  });

  it("does not call a mutation endpoint while constructing a dry-run payload", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const payload = buildScheduleWorkoutPayload({ id: "workout-1" }, "2026-08-17", 1);
    const dryRun = { dryRun: true, endpoint: TRAINING_HUB_PRIVATE_ENDPOINTS.scheduleUpdate, payload };
    expect(dryRun.endpoint).toBe("/training/schedule/update");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts only when the explicit plan mutation helper is invoked", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ result: "0000", data: "plan-1" }));
    vi.stubGlobal("fetch", fetchMock);
    await addTrainingPlan(auth, buildTrainingPlanPayload("Plan", "", [{ dayNo: 0, sortNoInSchedule: 0, program: { id: "w" } }], "eu"));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(TRAINING_HUB_PRIVATE_ENDPOINTS.trainingPlanAdd);
    expect(init.method).toBe("POST");
  });
});

import { IsoDateSchema, PlanWorkoutSchema, WorkoutReferenceSchema } from "../training-input.js";

describe("training input schemas", () => {
  it("accepts only real ISO calendar dates", () => {
    expect(IsoDateSchema.safeParse("2026-02-28").success).toBe(true);
    expect(IsoDateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(IsoDateSchema.safeParse("08/17/2026").success).toBe(false);
  });

  it("rejects ambiguous workout references and placements", () => {
    expect(WorkoutReferenceSchema.safeParse({ workoutId: "a", workoutName: "Duplicate" }).success).toBe(false);
    expect(WorkoutReferenceSchema.safeParse({}).success).toBe(false);
    expect(PlanWorkoutSchema.safeParse({ workoutId: "a", weekday: "monday", date: "2026-08-17" }).success).toBe(false);
  });
});
