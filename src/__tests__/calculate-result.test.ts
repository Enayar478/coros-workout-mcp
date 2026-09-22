import { describe, it, expect } from "vitest";
import { parseCalculateResult } from "../coros-api.js";

/*
  `/training/program/calculate` renvoie ses valeurs sous des noms prefixes
  `plan*`, et PAS sous les noms du programme d'origine. Les lire comme
  `data.duration` donnait `undefined`, puis « Duration: ~NaN min | Sets:
  undefined » dans la reponse de l'outil, et des champs undefined envoyes a
  `/program/add`. Constate en direct sur l'API le 22/09/2026.
*/
describe("parseCalculateResult", () => {
  it("lit les champs plan* renvoyes par l'API", () => {
    expect(
      parseCalculateResult({
        planDuration: 1356,
        planSets: 11,
        planTrainingLoad: 42,
        planHybridTotalSets: 0,
      }),
    ).toEqual({ duration: 1356, totalSets: 11, trainingLoad: 42 });
  });

  /* Filet si COROS revient un jour aux noms du programme. */
  it("accepte aussi les noms sans prefixe", () => {
    expect(
      parseCalculateResult({ duration: 600, totalSets: 5, trainingLoad: 7 }),
    ).toEqual({ duration: 600, totalSets: 5, trainingLoad: 7 });
  });

  it("prefere plan* quand les deux sont presents", () => {
    expect(
      parseCalculateResult({ planDuration: 1356, duration: 1 }).duration,
    ).toBe(1356);
  });

  /*
    Zero est une valeur legitime : `planTrainingLoad` vaut 0 sur une seance
    de force. Il ne doit pas etre traite comme absent.
  */
  it("garde un zero plutot que de retomber sur un repli", () => {
    expect(
      parseCalculateResult({ planTrainingLoad: 0, trainingLoad: 99 })
        .trainingLoad,
    ).toBe(0);
  });

  it("rend zero plutot que NaN quand un champ manque", () => {
    expect(parseCalculateResult({})).toEqual({
      duration: 0,
      totalSets: 0,
      trainingLoad: 0,
    });
  });

  it("ignore une reponse qui n'est pas un objet", () => {
    expect(parseCalculateResult(null)).toEqual({
      duration: 0,
      totalSets: 0,
      trainingLoad: 0,
    });
  });

  it("ignore une valeur non numerique", () => {
    expect(parseCalculateResult({ planDuration: "1356" }).duration).toBe(0);
  });
});
