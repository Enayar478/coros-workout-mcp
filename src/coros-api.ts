import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import type {
  AuthData,
  CatalogExercise,
  ExerciseOverrides,
  ExercisePayload,
  RawExercise,
  Region,
  ScheduleUpdatePayload,
  CustomStrengthExercisePayload,
  TrainingCalendarResponse,
  TrainingPlanDetail,
  TrainingPlanListItem,
  TrainingPlanPayload,
  WorkoutPayload,
} from "./types.js";
import {
  REGION_URLS,
  MuscleCode,
  PartCode,
  EquipmentCode,
} from "./types.js";
import { findByName } from "./exercise-catalog.js";

const CONFIG_DIR = resolve(homedir(), ".config", "coros-workout-mcp");
const AUTH_FILE = resolve(CONFIG_DIR, "auth.json");
const DEFAULT_SOURCE_URL =
  "https://d31oxp44ddzkyk.cloudfront.net/source/source_default/0/2fbd46e17bc54bc5873415c9fa767bdc.jpg";

// --- Auth ---

function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

export function storeAuth(auth: AuthData): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(AUTH_FILE, JSON.stringify(auth), { mode: 0o600 });
}

export function loadAuth(): AuthData | null {
  try {
    return JSON.parse(readFileSync(AUTH_FILE, "utf-8"));
  } catch {
    return null;
  }
}

export async function login(
  email: string,
  password: string,
  region: Region = "eu"
): Promise<AuthData> {
  const apiUrl = REGION_URLS[region];
  const res = await fetch(`${apiUrl}/account/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      account: email,
      accountType: 2,
      pwd: md5(password),
    }),
  });
  const data = await res.json();
  if (data.result !== "0000") {
    throw new Error(`COROS login failed: ${data.message || data.result}`);
  }

  const auth: AuthData = {
    accessToken: data.data.accessToken,
    userId: data.data.userId,
    region,
    timestamp: Date.now(),
  };
  storeAuth(auth);
  return auth;
}

/** Get valid auth from stored file or env vars */
export async function getValidAuth(): Promise<AuthData | null> {
  // Try stored auth first
  const stored = loadAuth();
  if (stored) return stored;

  // Try env vars
  const email = process.env.COROS_EMAIL;
  const password = process.env.COROS_PASSWORD;
  const region = (process.env.COROS_REGION as Region) || "eu";
  if (email && password) {
    return login(email, password, region);
  }

  return null;
}

// --- API helpers ---

function apiHeaders(auth: AuthData): Record<string, string> {
  return {
    "Content-Type": "application/json",
    accesstoken: auth.accessToken,
    yfheader: JSON.stringify({ userId: auth.userId }),
  };
}

async function apiPost(auth: AuthData, path: string, body: unknown): Promise<unknown> {
  const apiUrl = REGION_URLS[auth.region];
  const res = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: apiHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.result !== "0000") {
    throw new Error(`COROS API error (${path}): ${data.message || data.result}`);
  }
  return data;
}

async function apiGet(
  auth: AuthData,
  path: string,
  params: Record<string, string | number> = {}
): Promise<unknown> {
  const apiUrl = REGION_URLS[auth.region];
  const url = new URL(`${apiUrl}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: apiHeaders(auth),
  });
  const data = await res.json();
  if (data.result !== "0000") {
    throw new Error(`COROS API error (${path}): ${data.message || data.result}`);
  }
  return data;
}

/** Fetch the full exercise catalog from COROS API */
export async function queryExerciseCatalog(
  auth: AuthData,
  sportType: number = 4
): Promise<RawExercise[]> {
  const result = (await apiGet(auth, "/training/exercise/query", {
    userId: auth.userId,
    sportType,
  })) as { data: RawExercise[] };
  return result.data;
}

/** Fetch i18n strings from the COROS static CDN (no auth needed) */
export async function fetchI18nStrings(): Promise<Record<string, string>> {
  const url = "https://static.coros.com/locale/coros-traininghub-v2/en-US.prod.js";
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch i18n strings: ${res.status} ${res.statusText}`);
  }
  let text = await res.text();
  // Strip "window.en_US=" prefix and trailing semicolon
  text = text.replace(/^window\.en_US\s*=\s*/, "").replace(/;\s*$/, "");
  return JSON.parse(text);
}

/**
 * Transform raw exercises + i18n map into CatalogExercise[].
 * Name resolution order: i18n[codeName] → existingCatalog[codeName].name → codeName
 * The i18n file only covers ~100 of ~383 exercises, so the existing catalog
 * provides names for exercises that predate the i18n system.
 */
export function buildCatalogFromRaw(
  rawExercises: RawExercise[],
  i18n: Record<string, string>,
  existingCatalog: CatalogExercise[] = []
): { catalog: CatalogExercise[]; i18nMisses: string[] } {
  const i18nMisses: string[] = [];
  const catalog: CatalogExercise[] = [];

  // Build lookup from existing catalog by codeName for fallback
  const existingByCode = new Map<string, CatalogExercise>();
  for (const e of existingCatalog) {
    existingByCode.set(e.codeName, e);
  }

  for (const r of rawExercises) {
    // Resolve human-readable name:
    // 1. i18n (code name key, e.g. "T1300" → "Weighted Jump Squats")
    // 2. Existing catalog entry (for older exercises without i18n)
    // 3. Fall back to raw code name
    let humanName = i18n[r.name];
    if (!humanName) {
      const existing = existingByCode.get(r.name);
      if (existing) {
        humanName = existing.name;
      } else {
        humanName = r.name;
        i18nMisses.push(r.name);
      }
    }

    // Resolve description from i18n
    const desc = i18n[r.name + "_desc"] || "";

    // Build text fields from numeric codes
    const muscle = r.muscle || [];
    const muscleRelevance = r.muscleRelevance || [];
    const part = r.part || [];
    const equipment = r.equipment || [];
    const primaryMuscle = muscle[0];
    const secondaryMuscles = muscleRelevance.filter((m) => m !== primaryMuscle);
    const muscleText = primaryMuscle
      ? (MuscleCode as Record<number, string>)[primaryMuscle] || String(primaryMuscle)
      : "";
    const secondaryMuscleText = secondaryMuscles
      .map((m) => (MuscleCode as Record<number, string>)[m] || String(m))
      .join(",");
    const partText = part
      .map((p) => (PartCode as Record<number, string>)[p] || String(p))
      .join(",");
    const equipmentText = equipment
      .map((e) => (EquipmentCode as Record<number, string>)[e] || String(e))
      .join(",");

    catalog.push({
      id: r.id,
      name: humanName.trim(),
      codeName: r.name,
      overview: r.overview,
      animationId: r.animationId,
      muscle,
      muscleRelevance,
      part,
      equipment,
      exerciseType: r.exerciseType,
      targetType: r.targetType,
      targetValue: r.targetValue,
      intensityType: r.intensityType,
      intensityValue: r.intensityValue,
      restType: r.restType,
      restValue: r.restValue,
      sets: r.sets,
      sortNo: r.sortNo,
      sportType: r.sportType,
      status: r.status,
      createTimestamp: r.createTimestamp,
      thumbnailUrl: r.thumbnailUrl || "",
      sourceUrl: r.sourceUrl,
      videoUrl: r.videoUrl,
      coverUrlArrStr: r.coverUrlArrStr,
      videoUrlArrStr: r.videoUrlArrStr,
      videoInfos: r.videoInfos,
      muscleText,
      secondaryMuscleText,
      partText,
      equipmentText,
      desc,
    });
  }

  // Sort alphabetically by name
  catalog.sort((a, b) => a.name.localeCompare(b.name));

  return { catalog, i18nMisses };
}

// --- Payload construction ---

export function buildExercisePayload(
  exercise: CatalogExercise,
  sortNo: number,
  overrides: Partial<ExerciseOverrides> = {}
): ExercisePayload {
  const sets = overrides.sets ?? exercise.sets;
  let targetType = exercise.targetType;
  let targetValue = exercise.targetValue;
  if (overrides.reps !== undefined) {
    targetType = 3;
    targetValue = overrides.reps;
  } else if (overrides.duration !== undefined) {
    targetType = 2;
    targetValue = overrides.duration;
  }

  const restValue = overrides.restSeconds ?? exercise.restValue;

  let intensityType = exercise.intensityType;
  let intensityValue = exercise.intensityValue;
  if (overrides.weightGrams !== undefined) {
    intensityType = 1;
    intensityValue = overrides.weightGrams;
  } else if (overrides.weightKg !== undefined) {
    intensityType = 1;
    intensityValue = overrides.weightKg * 1000;
  }

  // Build text fields from codes
  const primaryMuscle = exercise.muscle[0];
  const secondaryMuscles = (exercise.muscleRelevance || []).filter(
    (m) => m !== primaryMuscle
  );
  const muscleText =
    exercise.muscleText ||
    (primaryMuscle
      ? (MuscleCode as Record<number, string>)[primaryMuscle] || ""
      : "");
  const secondaryMuscleText =
    exercise.secondaryMuscleText ||
    secondaryMuscles
      .map((m) => (MuscleCode as Record<number, string>)[m] || "")
      .filter(Boolean)
      .join(",");
  const partText =
    exercise.partText ||
    exercise.part
      .map((p) => (PartCode as Record<number, string>)[p] || "")
      .filter(Boolean)
      .join(",");
  const equipmentText =
    exercise.equipmentText ||
    exercise.equipment
      .map((e) => (EquipmentCode as Record<number, string>)[e] || "")
      .filter(Boolean)
      .join(",");

  return {
    access: 0,
    animationId: exercise.animationId ?? 0,
    coverUrlArrStr: exercise.coverUrlArrStr,
    createTimestamp: exercise.createTimestamp,
    defaultOrder: 0,
    equipment: exercise.equipment,
    exerciseType: exercise.exerciseType,
    id: sortNo, // sequential 1-based index used in API
    intensityCustom: 0,
    intensityType,
    intensityValue,
    isDefaultAdd: 0,
    isGroup: false,
    isIntensityPercent: false,
    muscle: exercise.muscle,
    muscleRelevance: exercise.muscleRelevance || [],
    name: exercise.codeName,
    overview: exercise.overview,
    part: exercise.part,
    restType: 1,
    restValue,
    sets,
    sortNo,
    sourceUrl: exercise.sourceUrl,
    sportType: 4,
    status: 1,
    targetType,
    targetValue,
    thumbnailUrl: exercise.thumbnailUrl,
    userId: 0,
    videoInfos: exercise.videoInfos,
    videoUrl: exercise.videoUrl,
    videoUrlArrStr: exercise.videoUrlArrStr,
    nameText: exercise.name,
    desc: exercise.desc,
    descText: exercise.desc,
    partText,
    muscleText,
    secondaryMuscleText,
    equipmentText,
    groupId: "",
    originId: exercise.id,
    targetDisplayUnit: 0,
    hrType: 0,
    intensityValueExtend: 0,
    intensityMultiplier: 0,
    intensityPercent: 0,
    intensityPercentExtend: 0,
    intensityDisplayUnit: "6",
  };
}

export function buildWorkoutPayload(
  name: string,
  overview: string,
  exercisePayloads: ExercisePayload[]
): WorkoutPayload {
  return {
    access: 1,
    authorId: "0",
    createTimestamp: 0,
    distance: 0,
    duration: 0,
    essence: 0,
    estimatedType: 0,
    estimatedValue: 0,
    exerciseNum: 0,
    exercises: exercisePayloads,
    headPic: "",
    id: "0",
    idInPlan: "0",
    name,
    nickname: "",
    originEssence: 0,
    overview,
    pbVersion: 2,
    planIdIndex: 0,
    poolLength: 2500,
    profile: "",
    referExercise: { intensityType: 1, hrType: 0, valueType: 1 },
    sex: 0,
    shareUrl: "",
    simple: false,
    sourceUrl: DEFAULT_SOURCE_URL,
    sportType: 4,
    star: 0,
    subType: 65535,
    targetType: 0,
    targetValue: 0,
    thirdPartyId: 0,
    totalSets: 0,
    trainingLoad: 0,
    type: 0,
    unit: 0,
    userId: "0",
    version: 0,
    videoCoverUrl: "",
    videoUrl: "",
    fastIntensityTypeName: "weight",
    poolLengthId: 1,
    poolLengthUnit: 2,
    sourceId: "425868133463670784",
  };
}

/** Resolve exercise overrides to catalog entries and build payloads */
export function resolveExercises(
  exercises: ExerciseOverrides[]
): ExercisePayload[] {
  return exercises.map((override, index) => {
    const catalog = findByName(override.name);
    if (!catalog) {
      throw new Error(`Exercise not found in catalog: "${override.name}"`);
    }
    return buildExercisePayload(catalog, index + 1, override);
  });
}

// --- Workout API ---

export interface CalculateResult {
  duration: number;
  totalSets: number;
  trainingLoad: number;
}

export async function calculateWorkout(
  auth: AuthData,
  name: string,
  overview: string,
  exercisePayloads: ExercisePayload[]
): Promise<CalculateResult> {
  const payload = buildWorkoutPayload(name, overview, exercisePayloads);
  const result = (await apiPost(auth, "/training/program/calculate", payload)) as {
    data: { duration: number; totalSets: number; trainingLoad: number };
  };
  return {
    duration: result.data.duration,
    totalSets: result.data.totalSets,
    trainingLoad: result.data.trainingLoad,
  };
}

export async function addWorkout(
  auth: AuthData,
  name: string,
  overview: string,
  exercisePayloads: ExercisePayload[],
  calculated: CalculateResult
): Promise<unknown> {
  const payload = buildWorkoutPayload(name, overview, exercisePayloads);
  // Apply calculated values
  payload.duration = calculated.duration;
  payload.totalSets = calculated.totalSets;
  payload.distance = "0"; // String in add (number in calculate)
  payload.sets = calculated.totalSets;
  payload.pitch = 0;
  return apiPost(auth, "/training/program/add", payload);
}

export interface QueryOptions {
  name?: string;
  sportType?: number;
  startNo?: number;
  limitSize?: number;
}

export async function queryWorkouts(
  auth: AuthData,
  options: QueryOptions = {}
): Promise<unknown> {
  const body = {
    name: options.name || "",
    supportRestExercise: 1,
    startNo: options.startNo ?? 0,
    limitSize: options.limitSize ?? 10,
    sportType: options.sportType ?? 0,
  };
  return apiPost(auth, "/training/program/query", body);
}


// --- Private Training Hub plan and calendar API ---
// Paths and methods were confirmed from the deployed Training Hub client on
// 2026-08-10. COROS does not publish this consumer API; keep changes here.
export const TRAINING_HUB_PRIVATE_ENDPOINTS = {
  trainingPlanQuery: "/training/plan/query",
  trainingPlanDetail: "/training/plan/detail",
  trainingPlanAdd: "/training/plan/add",
  programDetail: "/training/program/detail",
  scheduleQuery: "/training/schedule/query",
  scheduleUpdate: "/training/schedule/update",
  customStrengthExerciseAdd: "/training/exercise/add",
} as const;

export type PlanProgramPlacement = {
  dayNo: number;
  sortNoInSchedule: number;
  program: Record<string, unknown>;
};

export async function queryTrainingPlans(
  auth: AuthData,
  statusList: number[] = [1, 2]
): Promise<TrainingPlanListItem[]> {
  const result = (await apiPost(auth, TRAINING_HUB_PRIVATE_ENDPOINTS.trainingPlanQuery, {
    statusList,
  })) as { data?: TrainingPlanListItem[] };
  return result.data || [];
}

export async function getTrainingPlan(auth: AuthData, id: string): Promise<TrainingPlanDetail> {
  const result = (await apiGet(auth, TRAINING_HUB_PRIVATE_ENDPOINTS.trainingPlanDetail, {
    id, supportRestExercise: 1,
  })) as { data?: TrainingPlanDetail };
  if (!result.data) throw new Error("COROS returned no training-plan detail.");
  return result.data;
}

export async function getWorkoutDetail(auth: AuthData, id: string): Promise<Record<string, unknown>> {
  const result = (await apiGet(auth, TRAINING_HUB_PRIVATE_ENDPOINTS.programDetail, {
    id, supportRestExercise: 1,
  })) as { data?: Record<string, unknown> };
  if (!result.data) throw new Error(`COROS returned no workout detail for "${id}".`);
  return result.data;
}

export async function queryTrainingCalendar(
  auth: AuthData, startDate: string, endDate: string
): Promise<TrainingCalendarResponse> {
  const result = (await apiGet(auth, TRAINING_HUB_PRIVATE_ENDPOINTS.scheduleQuery, {
    startDate: startDate.replaceAll("-", ""),
    endDate: endDate.replaceAll("-", ""),
    supportRestExercise: 1,
  })) as { data?: TrainingCalendarResponse };
  return result.data || { entities: [], programs: [], maxIdInPlan: 0 };
}

export function buildTrainingPlanPayload(
  name: string, overview: string, placements: PlanProgramPlacement[], region: Region, unit = 0
): TrainingPlanPayload {
  if (placements.length === 0) throw new Error("A training plan must contain at least one workout.");
  const ordered = [...placements].sort((a, b) => a.dayNo - b.dayNo || a.sortNoInSchedule - b.sortNoInSchedule);
  const weekCounts = new Map<number, number>();
  const entities = ordered.map((placement, index) => {
    const idInPlan = index + 1;
    const week = Math.floor(placement.dayNo / 7);
    weekCounts.set(week, (weekCounts.get(week) || 0) + 1);
    return { happenDay: "", idInPlan, sortNo: 0, dayNo: placement.dayNo,
      sortNoInPlan: placement.sortNoInSchedule, sortNoInSchedule: placement.sortNoInSchedule };
  });
  const counts = [...weekCounts.values()].sort((a, b) => a - b);
  return {
    name, overview, entities,
    programs: ordered.map((placement, index) => ({ ...placement.program, idInPlan: index + 1, happenDay: "" })),
    weekStages: [], maxIdInPlan: ordered.length,
    totalDay: Math.max(...ordered.map((placement) => placement.dayNo)) + 1,
    unit, sourceId: "425868133463670784",
    sourceUrl: DEFAULT_SOURCE_URL, minWeeks: counts[0] || 0,
    maxWeeks: counts[counts.length - 1] || 0, region: region === "eu" ? 3 : 1,
    pbVersion: 2, versionObjects: ordered.map((_, index) => ({ id: index + 1, status: 1 })),
  };
}

export async function addTrainingPlan(auth: AuthData, payload: TrainingPlanPayload): Promise<unknown> {
  return apiPost(auth, TRAINING_HUB_PRIVATE_ENDPOINTS.trainingPlanAdd, payload);
}

export function buildScheduleWorkoutPayload(
  workout: Record<string, unknown>, isoDate: string, idInPlan: number, sortNoInSchedule = 0
): ScheduleUpdatePayload {
  return {
    entities: [{ happenDay: isoDate.replaceAll("-", ""), idInPlan, sortNoInSchedule }],
    programs: [{ ...workout, idInPlan }],
    versionObjects: [{ id: idInPlan, status: 1 }], pbVersion: 2,
  };
}

export function buildRemoveScheduledWorkoutPayload(entry: {
  idInPlan: number; planId?: string | number; planProgramId?: string | number; labelId?: string | number;
}): ScheduleUpdatePayload {
  return {
    versionObjects: [{ id: entry.idInPlan,
      ...(entry.planId === undefined ? {} : { planId: entry.planId }),
      ...(entry.planProgramId === undefined ? {} : { planProgramId: entry.planProgramId }),
      ...(entry.labelId === undefined ? {} : { labelId: entry.labelId }), status: 3 }],
    pbVersion: 2,
  };
}

export async function updateTrainingSchedule(auth: AuthData, payload: ScheduleUpdatePayload): Promise<unknown> {
  return apiPost(auth, TRAINING_HUB_PRIVATE_ENDPOINTS.scheduleUpdate, payload);
}

export function buildCustomStrengthExercisePayload(input: {
  name: string; overview: string; part: number; muscle?: number; equipment?: number;
}): CustomStrengthExercisePayload {
  return {
    access: 1, sportType: 4, exerciseType: 2, name: input.name, overview: input.overview,
    part: [input.part], muscle: input.muscle === undefined ? [] : [input.muscle],
    muscleRelevance: [], equipment: input.equipment === undefined ? [] : [input.equipment],
    intensityCustom: 0, intensityMultiplier: 0, intensityType: 1, intensityValue: 0,
    intensityValueExtend: 0, restType: 1, restValue: 30, targetType: 3, targetValue: 15,
  };
}

export async function addCustomStrengthExercise(
  auth: AuthData, payload: CustomStrengthExercisePayload
): Promise<unknown> {
  return apiPost(auth, TRAINING_HUB_PRIVATE_ENDPOINTS.customStrengthExerciseAdd, payload);
}
