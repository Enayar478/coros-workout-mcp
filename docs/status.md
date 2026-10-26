# État actuel — coros-workout-mcp

Dernière mise à jour : 2026-10-26 (mise en place de la structure standard).

## Dernier commit

`aee3538` (2026-09-22) — fix: lit les champs plan* de /program/calculate.

## Branches ouvertes

- `origin/main` : branche par défaut.
- `chore/structure-agents` : structure standard (AGENTS.md, docs, orca.yaml), PR en attente de revue.
- `origin/fix/calculate-plan-fields` : un commit du 2026-09-23 (« Read the plan-prefixed fields returned by /program/calculate »), même sujet que `aee3538`, non fusionné dans `main`. Statut à clarifier.

## Ce qui marche (d'après le README et l'historique git)

- Serveur MCP STDIO : authentification (`authenticate_coros`, `check_coros_auth`, connexion par `npm run login`), recherche dans le catalogue d'exercices, création et liste de séances de musculation, mise à jour du catalogue.
- Ajouts du fork : séances de course structurées (`create_running_workout`), activités (`list_activities`, `get_activity_detail`), plans d'entraînement, calendrier et exercices personnalisés (écritures en `dryRun: true` par défaut).
- Tests unitaires `vitest` : 5 fichiers dans `src/__tests__/`. Non relancés lors de cette mise en place (`npm ci` non exécuté).

## Prochaines étapes

À compléter : le dépôt ne contient pas de feuille de route. Seul point écrit : revoir la décision « pas de changesets » si le projet est publié sur npm.

## Points d'attention

- `package.json` : `main`, `bin` et `scripts.start` pointent vers `dist/index.js`, alors que `tsconfig.json` (`rootDir: "."`) produit `dist/src/index.js` (chemin utilisé par le README). `npm start` ne peut donc pas fonctionner tel quel.
- La partie « ancien CLAUDE.md » de `AGENTS.md` date de la v1 : elle annonce 6 outils et 4 fichiers source, alors que `src/index.ts` enregistre 17 outils et que `src/` compte aussi `running-workout.ts` et `training-input.ts`. Elle mentionne aussi un « parent repo » (`../`) pour la recherche, alors que `research/` est maintenant dans le dépôt.
- `.DS_Store` n'est pas dans le `.gitignore` (présent, non suivi, dans la copie de dév).

## À compléter

- Mettre à jour la partie v1 de `AGENTS.md`.
- Corriger ou confirmer les chemins `dist/` de `package.json`.
- Sort de la branche `fix/calculate-plan-fields`.
- Commit actuellement déployé dans la copie d'exécution `~/Developer/personal/coros-workout-mcp` (non vérifié : copie non touchée).
- Linter à adopter, si souhaité.
