# Journal de décisions

<!-- Une entrée par décision. Ne jamais supprimer, seulement marquer « remplacée par ». -->

Décision antérieure à ce journal, conservée à son emplacement d'origine : `docs/decisions/RFC-2026-02-22-changesets.md` (pas de changesets, acceptée le 2026-02-22).

## 2026-10-26 — Structure standard (AGENTS.md, docs/, orca.yaml)

- **Contexte** : le dépôt avait un `CLAUDE.md` écrit pour la v1 (propre à Claude Code), pas de `AGENTS.md`, pas de journal de décisions à la racine de `docs/` ni d'état courant. Même gabarit appliqué à `mpp-oracle`, `coros-workout-mcp` et `pulsar-datastack`.
- **Décision** : `CLAUDE.md` est renommé en `AGENTS.md` (contenu conservé, sections du gabarit ajoutées en tête) et `CLAUDE.md` devient un lien symbolique vers lui. On ajoute `docs/decisions.md` (ce journal), `docs/status.md`, `.agents/skills/` et `.agents/agents/` (vides) et `orca.yaml` (installation du worktree par `npm ci`, démarrage de l'agent après le setup). Pas de `.worktreeinclude` : aucun fichier ignoré à copier n'existe dans la copie de dév. La note du projet vit dans le vault : `/Volumes/Data/brain/20-projets/coros-workout-mcp.md`.
- **Alternatives écartées** :
  - `worktree.sharedDirectories` pour `node_modules` : ce serait un lien partagé et mutable entre worktrees ; un `npm ci` dans l'un effacerait et réécrirait le dossier de tous les autres. On réinstalle par le script de setup.
  - Réécrire l'ancien `CLAUDE.md` à neuf : on garde son contenu tel quel pour ne rien perdre ; sa mise à jour est un travail à part (voir `docs/status.md`).
  - Fusionner `docs/decisions/` (dossier de RFC) dans `docs/decisions.md` : le RFC existant garde son chemin.
- **Conséquences** :
  - Chaque worktree lance `npm ci` avant que l'agent démarre (`setupAgentStartupPolicy: wait-for-setup`) : plus lent, mais chaque worktree a son propre `node_modules`.
  - `docs/decisions/` (dossier) et `docs/decisions.md` (fichier) coexistent.
  - Aucun changement de code ; la copie d'exécution n'est pas touchée.
