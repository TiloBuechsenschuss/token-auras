# AGENTS.md

Guidance for AI coding agents working in this repository.

This file is the single source of project instructions for all agents. [CLAUDE.md](CLAUDE.md) only imports this file for Claude Code and must stay free of content. Add new instructions here, never in CLAUDE.md.

## Project

Token Auras is a [Foundry VTT](https://foundryvtt.com) module. It draws coloured circular or square auras around tokens and adds an "Auras" tab to the token configuration dialog.

This repository is a fork of the legacy module by Kim Mantas (Fyorl), originally hosted at `https://bitbucket.org/Fyorl/token-auras` (git remote `fyorl`). The fork is maintained by Tilo Büchsenschuß at `https://github.com/TiloBuechsenschuss/token-auras` (git remote `origin`). The fork targets **Foundry v14** only. Version 2.7 and older of the original module target v10/v11.

## License and attribution

- The module is licensed under GPL-3.0 (see `LICENSE`). Keep it GPL-3.0 and do not remove the license file or existing notices.
- Keep the credit to Kim Mantas and the original contributors in `README.md` and the `authors` list in `module.json`. Add the fork maintainer; do not replace the original author.
- The README contains an AI disclosure. Keep it.

## Layout

| Path | Purpose |
| --- | --- |
| `module.json` | Module manifest (id `token-auras`, loads `main.js` via `esmodules`). |
| `main.js` | All module logic: the `Auras` object and its hook registrations. |
| `templates/token-config.hbs` | Handlebars template for the Auras tab of the token configuration sheets. |
| `package.json`, `pnpm-lock.yaml` | pnpm project for the build. The only dependency is `fflate`. |
| `scripts/build.mjs` | Builds `dist/module.json` and `dist/module.zip`. |
| `.github/workflows/release.yml` | Publishes a GitHub release on every push to the `release` branch. |
| `lang/*.json` | Translations (`en`, `de`, `fr`, `it`, `pt-BR`). Keys use the `AURAS.` prefix. |
| `README.md` | User and API documentation. |
| `example-*.jpg` | Screenshots referenced by the README. |

Foundry loads the source files as they are. There is no bundler, transpiler, linter or test suite.

## Build and release

- `pnpm install`, then `pnpm build`. The build copies `module.json`, `main.js`, `lang/`, `templates/`, `LICENSE` and `README.md` into `dist/module.zip`. It writes `dist/module.json` with the `manifest` and `download` URLs for the current version.
- `module.json` `version` is the only version number. The release tag is the bare version, for example `3.0.0`.
- A push to the `release` branch runs `.github/workflows/release.yml`. It builds the module, fails if the tag already exists, and creates the tag and a GitHub release with `module.json` and `module.zip`.
- To add a file or folder to the package, add it to `CONTENTS` in `scripts/build.mjs`.

## How the module works

- **Data model.** Auras are stored as token document flags under the `token-auras` scope:
  - `aura1` and `aura2`: the two auras editable in the UI.
  - `auras`: an array of extra auras added through the API, with no limit.
  - Each aura has `distance`, `colour`, `opacity`, `square`, `permission` and `uuid`. `Auras.newAura()` returns the defaults.
- **Permissions.** `permission` is one of `all`, `limited`, `observer`, `owner` or `gm`. `limited`, `observer` and `owner` are checked with `actor.testUserPermission(game.user, LEVEL)`.
- **Config UI.** `TokenConfig` and `PrototypeTokenConfig` are ApplicationV2 sheets (`HandlebarsApplicationMixin`).
  - On `ready`, `Auras.registerConfigTabs` adds the `tokenAuras` tab to `TABS.sheet` and the `tokenAuras` part to `PARTS` (before `footer`) of every registered token sheet class and of `CONFIG.Token.prototypeSheetClass`.
  - The `preRenderTokenConfig` and `preRenderPrototypeTokenConfig` hooks add `context.tokenAuras`. The template renders the inputs with the core `{{formGroup}}` helper and the DataFields from `Auras.getConfigFields()`.
  - Inputs are named `flags.token-auras.auraN.<field>`, so the core form submission saves them. `TokenConfig` also shows live changes on its canvas preview token.
- **Rendering.** Each token gets one `foundry.canvas.primary.PrimaryGraphics` (`token.tokenAuras`) in `canvas.primary`. It uses the token elevation and the sort layer just below `PrimaryCanvasGroup.SORT_LAYERS.TOKENS`, so auras render under tokens and respect elevation.
  - `drawToken` and `updateToken` (aura flags or `hidden` changed) redraw the auras.
  - `refreshToken` redraws on `refreshSize`/`refreshShape` (size is animated) and otherwise copies the position, elevation, alpha and visibility of the placeable.
  - `destroyToken` destroys the graphics.
- **Visibility.** Hidden tokens show no auras to non-GM users. Commits `dcd04ba` and `c7c0aa5` fixed leaks in this logic. Keep this behaviour. Auras also follow `token.visible`, so they hide when the token is not visible (vision, other levels, config preview).

## Public API

Other modules and macros use this API. Keep it working after the port:

- The global `Auras` object, in particular `Auras.newAura()`.
- The flag layout `flags.token-auras.aura1`, `aura2` and `auras`, and the aura object shape.

`main.js` is an ES module, so it exposes the object explicitly as `globalThis.Auras` and `game.modules.get('token-auras').api`. Existing flag data must keep rendering without a migration.

## Foundry API documentation

Consult the official API documentation before you write or change any code that calls Foundry APIs. Do not rely on memory: the API changed a lot between v11 and v14.

- Current (v14) docs: https://foundryvtt.com/api/index.html
- Class pages follow the full namespace, for example https://foundryvtt.com/api/classes/foundry.applications.sheets.TokenConfig.html. Other page types use `modules/`, `functions/` and `variables/` (for example `variables/CONST.GRID_TYPES.html`).
- Older versions live under a version prefix, for example https://foundryvtt.com/api/v11/index.html. Use them to understand what the legacy code expects.
- Use only the public API where possible. The docs mark private API, which can change without notice.

If you cannot reach the docs, say so. Do not guess an API signature.

## Foundry v14 notes

The port to v14 replaced these legacy APIs. Do not reintroduce them:

- **Manifest.** No `name`, `minimumCoreVersion`, `compatibleCoreVersion` or `scripts`. Use `esmodules` and `compatibility`.
- **Token config sheet.** No jQuery, `setPosition`, `_onChangeInput` or `data-edit` inputs. Add UI through `PARTS`, `TABS`, templates and the ApplicationV2 render hooks, which pass an `HTMLElement`.
- **Grid.** `canvas.grid` is the scene's `BaseGrid`. `GridLayer#borders` does not exist. Use `canvas.grid.isSquare`, `canvas.grid.size` and `canvas.grid.distance`.
- **Globals.** Use `foundry.utils.Color` and the other namespaced classes, not the old globals.
- **PIXI.** v14 bundles PIXI 7.4, so `beginFill`/`drawEllipse`/`drawRect`/`endFill` still work. Recheck this when Foundry moves to PIXI 8.
- **Localization keys.** v14 removed the core keys `SCENES.GridDistance`, `SCENES.GridSquare` and `GridUnits`. The module uses `MEASUREMENT.Distance`, `SCENE.GridSquare` and the scene's grid units.
- **Token movement.** Since v12 token animation updates the document position and size every frame. Auras use the placeable position and redraw on size refreshes.
- **Scene Levels.** v14 only creates Token placeables for tokens in the viewed level. Aura graphics follow the placeable lifecycle, so they need no level logic.

## Conventions

- Follow `.editorconfig`: tabs, LF line endings, final newline, no trailing whitespace.
- Match the existing style: single quotes, spaces inside the parentheses of `if ( ... )`, short methods on the `Auras` object.
- Put new user-facing strings in `lang/en.json` with the `AURAS.` prefix. Add the same key to the other language files only when a translation is available; do not machine-translate.
- Keep the module system-agnostic. Do not depend on a specific game system.
- Keep changes small and focused. The build only packages files. Do not add bundling, transpiling or other build tools unless the user asks for them.

## Testing

There are no automated tests. Verify changes manually in a Foundry v14 world:

1. Enable the module and open a token's configuration. Check that the Auras tab renders and saves all fields.
2. Check circular and square auras on square, hex and gridless scenes, with tokens of size 1 and larger.
3. Log in as a player. Check each permission level, and check that hidden tokens show no auras.
4. Move, resize, hide and delete tokens. Check that auras follow the token and leave no orphaned graphics.
5. Run `Auras.newAura()` and the README examples in the console.

State clearly which checks you ran and which you could not run.
