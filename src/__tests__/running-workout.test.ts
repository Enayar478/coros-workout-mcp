import { describe, it, expect } from "vitest";
import { buildRunningWorkoutPayload, type RunningStep } from "../running-workout.js";

/*
  Format porté depuis cygnusb/coros-mcp (MIT), dont chaque encodage a été
  confirmé en construisant la séance dans l'app COROS puis en relisant les
  valeurs brutes. Ces tests verrouillent le format, pas le serveur.
*/

// La séance de reprise du kiné : 15 min + 6 x (1 min / 1 min).
const reprise: RunningStep[] = [
  { name: "Echauffement", durationSeconds: 900 },
  {
    repeat: 6,
    steps: [
      { name: "Effort 6/10", durationSeconds: 60 },
      { name: "Recuperation", durationSeconds: 60 },
    ],
  },
];

describe("buildRunningWorkoutPayload", () => {
  it("utilise l'identifiant course de l'API workout (1), pas celui des activités", () => {
    const p = buildRunningWorkoutPayload("C1", reprise);
    expect(p.sportType).toBe(1);
    for (const e of p.exercises) expect(e.sportType).toBe(1);
  });

  it("compte la durée totale, répétitions déroulées", () => {
    const p = buildRunningWorkoutPayload("C1", reprise);
    // 900 + 6 x 120
    expect(p.estimatedTime).toBe(1620);
    expect(p.duration).toBe(1620);
  });

  it("encode un pas au temps : targetType 2, valeur en secondes", () => {
    const [echauffement] = buildRunningWorkoutPayload("C1", reprise).exercises;
    expect(echauffement.targetType).toBe(2);
    expect(echauffement.targetValue).toBe(900);
  });

  it("n'impose aucune cible d'intensité : l'intensité prescrite est ressentie", () => {
    const p = buildRunningWorkoutPayload("C1", reprise);
    for (const e of p.exercises.filter((x) => !x.isGroup)) {
      expect(e.intensityType).toBe(5);
      expect(e.hrType).toBe(0);
    }
    expect(p.referExercise.hrType).toBe(0);
  });

  it("marque le premier pas simple comme échauffement", () => {
    const [echauffement] = buildRunningWorkoutPayload("C1", reprise).exercises;
    expect(echauffement.exerciseType).toBe(1);
  });

  it("marque le dernier pas simple comme retour au calme", () => {
    const p = buildRunningWorkoutPayload("C1", [
      ...reprise,
      { name: "Retour au calme", durationSeconds: 300 },
    ]);
    expect(p.exercises[p.exercises.length - 1].exerciseType).toBe(3);
  });

  it("construit un groupe de répétition relié à ses sous-pas", () => {
    const ex = buildRunningWorkoutPayload("C1", reprise).exercises;
    const groupe = ex.find((e) => e.isGroup)!;
    expect(groupe.sets).toBe(6);
    expect(groupe.targetValue).toBe(120); // une itération
    const sous = ex.filter((e) => e.groupId === String(groupe.id));
    expect(sous.map((e) => e.name)).toEqual(["Effort 6/10", "Recuperation"]);
    for (const s of sous) expect(s.exerciseType).toBe(2);
  });

  it("ordonne les pas : un bloc de 16777216 par position, 65536 par sous-pas", () => {
    const ex = buildRunningWorkoutPayload("C1", reprise).exercises;
    expect(ex.map((e) => e.sortNo)).toEqual([
      16777216,
      2 * 16777216,
      2 * 16777216 + 65536,
      2 * 16777216 + 2 * 65536,
    ]);
  });

  it("ne compte pas le conteneur de groupe comme un pas réel", () => {
    const p = buildRunningWorkoutPayload("C1", reprise);
    expect(p.exerciseNum).toBe(3);
    expect(p.totalSets).toBe(3);
  });

  it("marque la séance comme structurée", () => {
    expect(buildRunningWorkoutPayload("C1", reprise).subType).toBe(65535);
  });

  it("refuse une séance vide", () => {
    expect(() => buildRunningWorkoutPayload("vide", [])).toThrow(/au moins un pas/);
  });

  it("refuse une durée nulle ou négative", () => {
    expect(() =>
      buildRunningWorkoutPayload("x", [{ name: "a", durationSeconds: 0 }]),
    ).toThrow(/durée/);
  });

  it("refuse un nombre de répétitions invalide", () => {
    expect(() =>
      buildRunningWorkoutPayload("x", [
        { repeat: 0, steps: [{ name: "a", durationSeconds: 30 }] },
      ]),
    ).toThrow(/répétitions/);
  });
});
