/*
  Séances de course structurées (fractionné) pour la Training Hub COROS.

  L'API n'est pas documentée. Le format est porté depuis cygnusb/coros-mcp
  (MIT, https://github.com/cygnusb/coros-mcp), où chaque encodage a été
  confirmé en construisant la séance dans l'app COROS puis en relisant les
  valeurs brutes. Ce module n'en garde que ce dont on a besoin :

  - des pas AU TEMPS uniquement (targetType 2, valeur en secondes) ;
  - AUCUNE cible d'intensité (intensityType 5). Les séances de reprise sont
    prescrites en intensité ressentie (6/10, 7/10...), qu'aucune cible de
    montre n'exprime ; l'intensité se met dans le nom du pas.

  Distance, allure et fréquence cardiaque existent côté COROS et pourront être
  ajoutées le jour où une séance les demande. Pas avant.
*/

/* L'API workout désigne la course par 1 ; l'API activités, elle, par 100. */
const SPORT_COURSE = 1;
const INTENSITE_AUCUNE = 5;
const CIBLE_TEMPS = 2;
const TYPE_ECHAUFFEMENT = 1;
const TYPE_PRINCIPAL = 2;
const TYPE_RETOUR_AU_CALME = 3;
const TYPE_STRUCTURE = 65535;
const PAS_POSITION = 16777216;
const PAS_SOUS_POSITION = 65536;

export interface TimedStep {
  name: string;
  durationSeconds: number;
}

export interface RepeatBlock {
  repeat: number;
  steps: TimedStep[];
}

export type RunningStep = TimedStep | RepeatBlock;

export interface RunningExercise {
  id: number;
  name: string;
  exerciseType: number;
  sportType: number;
  intensityType: number;
  intensityValue: number;
  intensityValueExtend: number;
  intensityMultiplier: number;
  targetType: number;
  targetValue: number;
  sets: number;
  sortNo: number;
  restType: number;
  restValue: number;
  groupId: string;
  isGroup: boolean;
  originId: string;
  hrType?: number;
  [key: string]: unknown;
}

export interface RunningWorkoutPayload {
  name: string;
  sportType: number;
  estimatedTime: number;
  duration: number;
  access: number;
  exercises: RunningExercise[];
  exerciseNum: number;
  totalSets: number;
  subType: number;
  referExercise: { gradeSystem: number; hrType: number; intensityType: number; valueType: number };
  [key: string]: unknown;
}

const estRepetition = (s: RunningStep): s is RepeatBlock => "repeat" in s;

function verifierPas(s: TimedStep): void {
  if (!s.name?.trim()) throw new Error("Chaque pas doit avoir un nom.");
  if (!Number.isInteger(s.durationSeconds) || s.durationSeconds <= 0) {
    throw new Error(`Pas « ${s.name} » : la durée doit être un entier de secondes positif.`);
  }
}

/* Les champs de métadonnées que COROS exige sur chaque pas de course. */
const METADONNEES_COURSE = {
  exerciseKind: 0,
  gradeSystem: 0,
  hrType: 0,
  intensityPercent: 0,
  intensityPercentExtend: 0,
  onsightGradeOffset: 0,
  overview: "",
  packageTime: 0,
  sourceId: "0",
  subType: 0,
  targetDisplayUnit: 0,
};

function pas(
  id: number,
  step: TimedStep,
  sortNo: number,
  groupId: string,
): RunningExercise {
  return {
    id,
    name: step.name,
    exerciseType: TYPE_PRINCIPAL,
    sportType: SPORT_COURSE,
    intensityType: INTENSITE_AUCUNE,
    intensityValue: 0,
    intensityValueExtend: 0,
    intensityMultiplier: 0,
    targetType: CIBLE_TEMPS,
    targetValue: step.durationSeconds,
    sets: 1,
    sortNo,
    restType: 3,
    restValue: 0,
    groupId,
    isGroup: false,
    originId: "0",
    ...METADONNEES_COURSE,
  };
}

/**
 * Construit le corps de `/training/program/add` pour une séance de course.
 * Fonction pure : aucun appel réseau.
 */
export function buildRunningWorkoutPayload(
  name: string,
  steps: RunningStep[],
): RunningWorkoutPayload {
  if (!name?.trim()) throw new Error("La séance doit avoir un nom.");
  if (steps.length === 0) throw new Error("La séance doit contenir au moins un pas.");

  const exercises: RunningExercise[] = [];
  let id = 0;
  let totalSecondes = 0;

  steps.forEach((step, i) => {
    const position = PAS_POSITION * (i + 1);

    if (!estRepetition(step)) {
      verifierPas(step);
      id += 1;
      exercises.push(pas(id, step, position, "0"));
      totalSecondes += step.durationSeconds;
      return;
    }

    if (!Number.isInteger(step.repeat) || step.repeat < 1) {
      throw new Error("Un bloc répété doit avoir un nombre de répétitions entier, au moins 1.");
    }
    if (step.steps.length === 0) throw new Error("Un bloc répété doit contenir au moins un pas.");
    step.steps.forEach(verifierPas);

    const iteration = step.steps.reduce((t, s) => t + s.durationSeconds, 0);
    totalSecondes += iteration * step.repeat;

    id += 1;
    const groupeId = id;
    exercises.push({
      id: groupeId,
      name: "Group",
      exerciseType: 0,
      sportType: SPORT_COURSE,
      intensityType: 0,
      intensityValue: 0,
      intensityValueExtend: 0,
      intensityMultiplier: 0,
      targetType: CIBLE_TEMPS,
      targetValue: iteration,
      sets: step.repeat,
      sortNo: position,
      restType: 3,
      restValue: 0,
      groupId: "0",
      isGroup: true,
      originId: "0",
    });

    step.steps.forEach((sous, j) => {
      id += 1;
      exercises.push(
        pas(id, sous, position + PAS_SOUS_POSITION * (j + 1), String(groupeId)),
      );
    });
  });

  // Échauffement et retour au calme : seulement sur un pas simple en tête ou
  // en queue, et seulement s'il y a plus d'un pas. Un groupe n'en est jamais.
  if (steps.length > 1) {
    if (!estRepetition(steps[0])) exercises[0].exerciseType = TYPE_ECHAUFFEMENT;
    if (!estRepetition(steps[steps.length - 1])) {
      exercises[exercises.length - 1].exerciseType = TYPE_RETOUR_AU_CALME;
    }
  }

  const pasReels = exercises.filter((e) => !e.isGroup).length;

  return {
    name,
    sportType: SPORT_COURSE,
    estimatedTime: totalSecondes,
    duration: totalSecondes,
    access: 1,
    exercises,
    exerciseNum: pasReels,
    totalSets: pasReels,
    gradeSystemVersion: 0,
    hybridTotalSets: 0,
    overview: "",
    poolLength: 0,
    poolLengthId: 0,
    poolLengthUnit: 0,
    referExercise: { gradeSystem: 0, hrType: 0, intensityType: 0, valueType: 1 },
    sourceUrl: "",
    subType: TYPE_STRUCTURE,
    trainingLoad: 0,
    type: 0,
    videoCoverUrl: "",
    videoUrl: "",
  };
}
