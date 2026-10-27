# coros-workout-mcp

## Objectif

Serveur MCP (transport STDIO) qui laisse Claude concevoir des séances de musculation et de course structurée, des plans et un calendrier, puis les pousser vers une montre COROS via l'API Training Hub, rétro-ingéniérée et non officielle. Fork d'`rowlando/coros-workout-mcp` (PR de `luis-prates` et `sion1171` intégrées). Sert de serveur MCP de carnet-athlete sur le Mac mini.

## Contexte cerveau

- Note du projet : `/Volumes/Data/brain/20-projets/coros-workout-mcp.md`
- Journal de décisions : `docs/decisions.md` — État actuel : `docs/status.md`
- Références du dépôt : `README.md` (outils, installation, authentification), `docs/training-plan-calendar-discovery.md` (endpoints plans et calendrier), `docs/decisions/RFC-2026-02-22-changesets.md`, `HOW-WE-BUILT-THIS.md` (historique de la v1).

## Stack et commandes

TypeScript 5.8 en ESM (`"type": "module"`, module Node16, `strict`), Node 18+ (`fetch` natif), `@modelcontextprotocol/sdk`, `zod`, tests `vitest`. Gestionnaire : npm (`package-lock.json`).

- Installer : `npm ci`
- Compiler : `npm run build` (`tsc`, sortie dans `dist/`, ignoré par git)
- Lancer : `node dist/src/index.js` (voir « À compléter » : `npm start` et le champ `bin` pointent vers `dist/index.js`, qui n'existe pas car `rootDir` est `.`)
- Tester : `npm test` (`vitest run`, tests unitaires sans appel API) ; un fichier : `npx vitest run src/__tests__/exercise-catalog.test.ts`
- Autres scripts : `npm run login` (connexion COROS, mot de passe saisi masqué), `npm run prepare-catalog`, `npm run test:watch`
- Lint : À compléter (aucun linter déclaré ; `npm run build` vérifie les types en mode strict)

## Conventions

- **Copie d'exécution** = `~/Developer/personal/coros-workout-mcp` sur le Mac mini, serveur MCP de carnet-athlete. On déploie par `git pull --ff-only && npm ci && npm run build`.
- Le dépôt de dév est `/Volumes/Data/code/personal/coros-workout-mcp`. Travailler dans un worktree.
- Dépôt public, fork : ouvrir les PR avec `gh pr create -R Enayar478/coros-workout-mcp`, jamais vers l'upstream.
- Ne jamais committer ni afficher d'identifiants COROS : `.env`, `.env.*` et `auth.json` sont ignorés ; le jeton est stocké hors dépôt dans `~/.config/coros-workout-mcp/auth.json` (mode 0600).
- Ne jamais passer un mot de passe en paramètre d'un outil MCP (`authenticate_coros` n'en accepte plus) : la connexion se fait par `npm run login`.
- Les outils d'écriture plans et calendrier sont en `dryRun: true` par défaut ; une écriture réelle demande `dryRun: false` explicite, et `remove_scheduled_workout` demande en plus `confirm: true`. Le README précise qu'aucune écriture réelle n'a été faite pendant le développement de ces outils : ne pas en lancer sans demande explicite.
- Se connecter par l'API invalide la session de l'appli web COROS, et inversement.
- L'API est non documentée et peut changer sans préavis : ne pas présenter un comportement non vérifié comme acquis (voir les niveaux de confiance de `docs/training-plan-calendar-discovery.md`).
- Le serveur tourne depuis `dist/` : après chaque `git pull`, recompiler.
- Pas de changesets (décision du 2026-02-22, `docs/decisions/RFC-2026-02-22-changesets.md`), à revoir si le projet est publié sur npm.
- Catalogue d'exercices (`data/exercises.json`) : celui d'upstream. Ne pas y committer des exercices personnels d'un compte ; `update_exercises` le reconstruit depuis le compte de l'utilisateur.

## Règles pour les agents

1. Lire ce fichier puis `docs/status.md` avant d'agir.
2. Discuter l'approche avant tout code non trivial.
3. Un worktree = une tâche, commits atomiques, messages en français.
4. En fin de session : mettre à jour `docs/status.md`, ajouter une décision à `docs/decisions.md` si besoin, puis commit.

## Skills et agents du projet

- `.agents/skills/` : skills du projet (vide pour l'instant, `.gitkeep`).
- `.agents/agents/` : agents du projet (vide pour l'instant, `.gitkeep`).
- `.claude/` : n'existe pas dans ce dépôt.

---

> Ce qui suit est l'ancien `CLAUDE.md`, conservé tel quel. Il a été écrit pour la v1 : le fork a ajouté depuis `src/running-workout.ts`, `src/training-input.ts` et des outils (plans, calendrier, activités, course), `src/index.ts` enregistre aujourd'hui 17 outils. À mettre à jour (voir `docs/status.md`).


This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

MCP server that lets Claude design strength workouts and push them to a COROS watch via the reverse-engineered COROS Training Hub API. This is an unofficial project — the API is undocumented and may change without notice.

## Build & Test

```bash
npm install && npm run build   # TypeScript → dist/
npm test                       # vitest (unit tests only, no API calls)
npm run test:watch             # vitest watch mode
```

Build output goes to `dist/` via `tsc`. The server entry point is `dist/src/index.ts` (compiled to `dist/src/index.js`).

To run a single test file: `npx vitest run src/__tests__/exercise-catalog.test.ts`

## Architecture

**4 source files, clear separation:**

- `index.ts` — MCP server setup. Registers 6 tools (`authenticate_coros`, `check_coros_auth`, `search_exercises`, `create_workout`, `update_exercises`, `list_workouts`) using `@modelcontextprotocol/sdk`. STDIO transport only.
- `coros-api.ts` — COROS API client + payload construction. Handles auth (MD5 password hashing, token storage at `~/.config/coros-workout-mcp/auth.json`), and the workout creation flow: `resolveExercises()` → `calculateWorkout()` (POST `/training/program/calculate`) → `addWorkout()` (POST `/training/program/add`). Also contains `buildCatalogFromRaw()` for the `update_exercises` tool.
- `exercise-catalog.ts` — In-memory exercise search engine. Loads `data/exercises.json` lazily, provides `findByName()` (exact, case-insensitive), `searchExercises()` (fuzzy name + muscle/bodyPart/equipment filters). The catalog is the single source of truth for exercise names used in `create_workout`.
- `types.ts` — All interfaces and enum maps. Numeric code → human-readable name mappings for muscles, body parts, equipment. Key types: `CatalogExercise` (bundled catalog), `ExercisePayload` (API payload), `ExerciseOverrides` (user input), `RawExercise` (API response).

**Data flow for workout creation:**
User provides exercise names + overrides → `findByName()` validates against catalog → `buildExercisePayload()` merges catalog defaults with overrides → `buildWorkoutPayload()` wraps exercises → POST to `/calculate` for metrics → POST to `/add` to save.

## Key Conventions

- All exercises use numeric IDs internally (muscle, part, equipment, targetType, intensityType). The enum maps in `types.ts` handle code↔name translation.
- `targetType`: 2=duration (seconds), 3=reps. `intensityType`: 0=none, 1=weight (in grams internally, kg in user-facing API).
- Exercise names in `create_workout` must match `data/exercises.json` exactly (case-insensitive). The `search_exercises` tool helps users find correct names.
- API auth requires `accesstoken` header + `yfheader` JSON with `userId`. Logging in via API invalidates the COROS web app session.
- Base URLs: `teameuapi.coros.com` (EU), `teamapi.coros.com` (US). Region defaults to `eu`.
- `sportType: 4` = Strength Training throughout the codebase.

## Exercise Catalog

`data/exercises.json` contains ~383 exercises bundled with the server. The `update_exercises` tool refreshes it from the COROS API + i18n CDN strings. Name resolution order: i18n → existing catalog fallback → raw code name (e.g. "T1004"). Only ~100 exercises have i18n coverage.

## Reference Material

The parent repo (`../`) contains research files useful for debugging API issues: captured curl commands (`create-workout-request-all.txt`), raw API responses (`strength-exercises.json`), and extracted i18n strings (`en-US.prod.js`).
