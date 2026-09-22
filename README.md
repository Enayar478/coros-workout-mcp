# coros-workout-mcp

> ⚠️ **Unofficial, community-led project — not affiliated with COROS.**
> COROS now offers an official MCP server at
> [coroslab/COROS-MCP](https://github.com/coroslab/COROS-MCP). If you want a
> supported, first-party option, use that. This project remains an independent,
> community-built tool.

MCP server for creating COROS strength workouts via the Training Hub API. Lets Claude design workouts and push them directly to your COROS watch.

See the MCP in action: [YouTube walkthrough](https://www.youtube.com/watch?v=I2I2p7hNZjM)

## Ce fork (Enayar478)

Ajouts par rapport à `rowlando/coros-workout-mcp` :

- **PR #5 intégrée** (luis-prates) : plans d'entraînement, calendrier (`schedule_workout`), exercices perso de muscu. Écritures en `dryRun: true` par défaut.
- **PR #3 intégrée** (sion1171) : `list_activities`, `get_activity_detail`.
- **`create_running_workout`** : séances de course structurées (échauffement, fractionné répété, retour au calme), pas au temps, sans cible d'intensité. Format porté depuis [cygnusb/coros-mcp](https://github.com/cygnusb/coros-mcp) (MIT). `dryRun: true` par défaut. **Pas encore vérifié en écriture réelle** : après la première création, contrôler avec `list_workouts` et sur la montre.
- **Connexion par `npm run login`** : le mot de passe est saisi masqué dans un terminal et n'est jamais écrit. `authenticate_coros` n'accepte plus de mot de passe en paramètre, pour qu'il ne finisse pas dans une conversation.
- Catalogue d'exercices : celui d'upstream. La PR #5 y avait aspiré des exercices personnels du compte de son auteur, inutilisables ailleurs. `update_exercises` le reconstruit depuis ton propre compte.

Enchaînement type pour plusieurs semaines : `create_running_workout` / `create_workout` pour chaque séance, puis `schedule_workout` pour chaque date.

## Disclaimer

This is an **unofficial**, community-driven project. It is **not affiliated with, endorsed by, or connected to COROS** in any way. For an official, COROS-supported MCP server, see [coroslab/COROS-MCP](https://github.com/coroslab/COROS-MCP).

This server communicates with the COROS Training Hub using a **reverse-engineered, undocumented API** that may change or break without notice. Use it at your own risk.

COROS is a trademark of COROS Wearables, Inc. This project is provided as-is with no warranty — see [LICENSE](LICENSE) for details.

## Setup

```bash
cd coros-workout-mcp
npm install
npm run build
```

## Usage with Claude Code

```bash
claude mcp add coros-workout -- node /path/to/coros-workout-mcp/dist/src/index.js
```

To use env var auth (avoids typing credentials in conversation):

```bash
claude mcp add coros-workout -e COROS_EMAIL=you@example.com -e COROS_PASSWORD=yourpass -e COROS_REGION=eu -- node /path/to/coros-workout-mcp/dist/src/index.js
```

## Usage with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "coros-workout": {
      "command": "/path/to/node",
      "args": ["/path/to/coros-workout-mcp/dist/src/index.js"],
      "env": {
        "COROS_EMAIL": "you@example.com",
        "COROS_PASSWORD": "yourpass",
        "COROS_REGION": "eu"
      }
    }
  }
}
```

> **Node.js 18+ required** — this server uses native `fetch()` which was added in Node 18.

> **Troubleshooting `fetch is not defined`:** Claude Desktop is a GUI app that doesn't inherit your shell PATH, so node binaries installed via version managers (mise, nvm, fnm, volta) won't be found. Use the full absolute path to your node binary in `"command"`:
>
> ```bash
> which node        # e.g. /Users/you/.mise/shims/node
> node --version    # confirm it's 18+
> ```
>
> Common locations:
> - **mise**: `~/.local/share/mise/installs/node/<version>/bin/node`
> - **nvm**: `~/.nvm/versions/node/<version>/bin/node`
> - **fnm**: `~/.local/share/fnm/node-versions/<version>/installation/bin/node`
> - **Homebrew**: `/opt/homebrew/bin/node`

## Tools

| Tool | Description |
|------|-------------|
| `authenticate_coros` | Log in with email/password (or auto-login from env vars) |
| `check_coros_auth` | Verify current auth status |
| `search_exercises` | Search ~383 exercises by name, muscle, body part, equipment |
| `create_workout` | Build and push a strength workout to COROS |
| `update_exercises` | Fetch the latest exercise catalog from COROS and rebuild locally |
| `list_workouts` | List existing workouts |

## Example conversation

> "Search for chest exercises with bodyweight"
>
> "Create a workout called 'Quick Push' with 4x15 Push-ups, 3x10 Diamond Push-ups, and 3x20 Decline Push-ups with 45s rest"

## Updating the exercise catalog

The bundled exercise catalog (`data/exercises.json`) is a static snapshot. If COROS adds new exercises, use the `update_exercises` tool to refresh it. This fetches the latest exercises from the COROS API and i18n strings from the CDN, rebuilds the catalog, and reloads the in-memory cache — all in a single tool call. Requires authentication.

## Auth notes

- **Region**: `eu` (Europe) or `us` (US). Defaults to `eu`.
- **Session conflict**: Logging in via this API invalidates your COROS web app session, and vice versa.
- Auth tokens are stored at `~/.config/coros-workout-mcp/auth.json` (mode 0600).

## Development

```bash
npm test           # Run unit tests
npm run test:watch # Watch mode
npm run build      # Compile TypeScript
```

## Training plans and calendar scheduling

The tools below use COROS Training Hub’s consumer endpoints. They are not public
or supported APIs and may change without notice. They work with the existing
Training Hub `accesstoken` authentication and preserve the selected EU/US
region. They do **not** use the official partner API credentials.

All new write tools default to `dryRun: true`. A dry run may read your workout
library or calendar to resolve IDs and construct a request, but it never sends a
write. Set `dryRun: false` deliberately to make a write. No live write was made
while developing this release.

| Tool | Arguments | Notes |
|---|---|---|
| `list_training_plans` | `status`: `active`, `completed`, or `all` | Read-only plan library. |
| `get_training_plan` | `planId` | Read-only detail and workout placement data. |
| `create_training_plan` | `name`, `description`, `weeks`, optional `startDate`, `dryRun` | References existing workouts by `workoutId` (preferred) or exact `workoutName`. Every placement has exactly one `weekday` or `date`. Exact dates require `startDate` and must fall in their declared week. |
| `list_training_calendar` | `startDate`, `endDate` | Inclusive ISO `YYYY-MM-DD` range. |
| `schedule_workout` | exactly one of `workoutId` / `workoutName`, `date`, `timezone`, `allowExistingEntries`, `dryRun` | Validates an IANA timezone. It refuses to add to a non-empty day unless `allowExistingEntries: true`; it never replaces existing entries. Exact name matches that are ambiguous fail. |
| `remove_scheduled_workout` | `date`, `scheduledWorkoutId`, `confirm`, `dryRun` | Optional private-API support. A live removal requires both `dryRun: false` and `confirm: true`. |
| `list_custom_exercises` | none | Lists Strength records marked user-accessible (`access=1`) by COROS. |
| `create_custom_exercise` | `name`, `description`, `bodyPart`, optional `primaryMuscle`, `equipment`, `dryRun` | Standard Strength only; see limitations below. |

`list_workouts` now includes the stable workout ID where COROS returns one. Use
that ID for plan and calendar writes rather than a name.

### Examples

Create a four-workout weekly strength plan (dry run):

```json
{
  "name": "Four-day strength",
  "description": "Upper/lower split",
  "weeks": [
    { "workouts": [
      { "workoutId": "123", "weekday": "monday" },
      { "workoutId": "124", "weekday": "tuesday" },
      { "workoutId": "125", "weekday": "thursday" },
      { "workoutId": "126", "weekday": "saturday" }
    ] }
  ]
}
```

Schedule a library workout on an exact date (dry run):

```json
{
  "workoutId": "123",
  "date": "2026-08-17",
  "timezone": "Europe/London"
}
```

List upcoming calendar entries:

```json
{
  "startDate": "2026-08-17",
  "endDate": "2026-08-31"
}
```

Create a custom Standard Strength exercise (dry run):

```json
{
  "name": "Half-kneeling cable press",
  "description": "Control the return.",
  "bodyPart": "Shoulders",
  "primaryMuscle": "Deltoids",
  "equipment": "Gym Equipment"
}
```

### Custom exercise limitations

The deployed Training Hub Strength editor confirms `POST /training/exercise/add`
for Standard Strength exercises. Its verified form supports one body part, one
optional primary muscle, and one optional equipment value. It always supplies
COROS defaults of 3 × 15 reps, 30 seconds rest, and weight intensity. Secondary
muscles, custom target defaults, custom repetitions/duration, and custom rest
are not exposed by that verified form, so this MCP does not pretend to support
them.

COROS’s [workout help](https://support.coros.com/hc/en-us/articles/47285577958932-Create-Custom-Workouts-in-Your-COROS-App)
says that Hybrid Fitness Functional Training can choose a custom exercise.
However, the Training Hub consumer request/payload for that compatibility was
not verified. `create_custom_exercise` therefore supports Standard Strength
only, and Hybrid Fitness / Functional Training is documented as unsupported
rather than simulated.

### Authentication and partner API distinction

COROS’s documented partner Training Plan API has a schedule-push endpoint:
`POST https://open.coros.com/coros/tp/list/push`. It requires a partner-linked
`token` and `openId`, not the Training Hub `accesstoken` and Training Hub user
ID stored by this MCP. Partner credentials are therefore required; existing
MCP authentication cannot safely call it. The partner endpoint is not used by
these tools.

See [docs/training-plan-calendar-discovery.md](docs/training-plan-calendar-discovery.md)
for endpoint sources and confidence levels.
