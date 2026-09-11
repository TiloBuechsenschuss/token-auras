# AGENTS.md

Guidance for AI coding agents working in this repository.

This file is the single source of project instructions for all agents. [CLAUDE.md](CLAUDE.md) only imports this file for Claude Code and must stay free of content. Add new instructions here, never in CLAUDE.md.

## Project

Token Auras is a [Foundry VTT](https://foundryvtt.com) module. It draws coloured circular or square auras around tokens and adds an "Auras" tab to the token configuration dialog.

This repository is a fork of the legacy module by Kim Mantas (Fyorl), originally hosted at `https://bitbucket.org/Fyorl/token-auras` (git remote `fyorl`). The fork is maintained by Tilo Büchsenschuß at `https://github.com/TiloBuechsenschuss/token-auras` (git remote `origin`). The code currently targets Foundry v10/v11. **The goal is to port it to Foundry v14.**

## License and attribution

- The module is licensed under GPL-3.0 (see `LICENSE`). Keep it GPL-3.0 and do not remove the license file or existing notices.
- Keep the credit to Kim Mantas and the original contributors in `README.md` and the `authors` list in `module.json`. Add the fork maintainer; do not replace the original author.
- The README contains an AI disclosure. Keep it.

## Layout

| Path | Purpose |
| --- | --- |
| `module.json` | Module manifest (id `token-auras`, loads `main.js` via `scripts`). |
| `main.js` | All module logic: the `Auras` object and its hook registrations. |
| `lang/*.json` | Translations (`en`, `de`, `fr`, `it`, `pt-BR`). Keys use the `AURAS.` prefix. |
| `README.md` | User and API documentation. |
| `example-*.jpg` | Screenshots referenced by the README. |

There is no build step, bundler, package manager, linter or test suite. Foundry loads the files as they are.

## How the module works

- **Data model.** Auras are stored as token document flags under the `token-auras` scope:
  - `aura1` and `aura2`: the two auras editable in the UI.
  - `auras`: an array of extra auras added through the API, with no limit.
  - Each aura has `distance`, `colour`, `opacity`, `square`, `permission` and `uuid`. `Auras.newAura()` returns the defaults.
- **Permissions.** `permission` is one of `all`, `limited`, `observer`, `owner` or `gm`. `limited`, `observer` and `owner` are checked with `actor.testUserPermission(game.user, LEVEL)`.
- **Config UI.** `Auras.onConfigRender` (`renderTokenConfig` hook) injects a nav item and a tab with plain HTML strings and jQuery. Inputs are named `flags.token-auras.auraN.<field>`, so the core form submission saves them.
- **Rendering.** A `PIXI.Container` is added to the grid layer (`drawGridLayer` hook), below `layer.borders`. Each token gets its own child container (`token.tokenAuras`) holding one `PIXI.Graphics`.
  - `drawToken` and `updateToken` redraw the auras.
  - `refreshToken` moves the container to the token position.
  - `destroyToken` destroys the container.
- **Visibility.** Hidden tokens show no auras to non-GM users. Commits `dcd04ba` and `c7c0aa5` fixed leaks in this logic. Keep this behaviour when porting.

## Public API

Other modules and macros use this API. Keep it working after the port:

- The global `Auras` object, in particular `Auras.newAura()`.
- The flag layout `flags.token-auras.aura1`, `aura2` and `auras`, and the aura object shape.

`Auras` is a top-level `const` in a classic script today. If `main.js` moves to `esmodules`, expose the object explicitly (for example `globalThis.Auras` and/or `game.modules.get('token-auras').api`). Existing flag data must keep rendering without a migration.

## Foundry API documentation

Consult the official API documentation before you write or change any code that calls Foundry APIs. Do not rely on memory: the API changed a lot between v11 and v14.

- Current (v14) docs: https://foundryvtt.com/api/index.html
- Class pages follow the full namespace, for example https://foundryvtt.com/api/classes/foundry.applications.sheets.TokenConfig.html. Other page types use `modules/`, `functions/` and `variables/` (for example `variables/CONST.GRID_TYPES.html`).
- Older versions live under a version prefix, for example https://foundryvtt.com/api/v11/index.html. Use them to understand what the legacy code expects.
- Use only the public API where possible. The docs mark private API, which can change without notice.

If you cannot reach the docs, say so. Do not guess an API signature.

## Porting to v14

Check every item below against the v14 API documentation and the release notes for v12, v13 and v14.

Known areas in `main.js` and `module.json` that are likely to break or are deprecated:

- **Manifest.** Remove `name`, `minimumCoreVersion` and `compatibleCoreVersion`. Update `compatibility`, `version`, `url`, `manifest` and `download`. Consider `esmodules` instead of `scripts`.
- **Token config sheet.** Since v13 `TokenConfig` is an ApplicationV2 sheet. Render hooks pass an `HTMLElement`, not jQuery. Tabs, `setPosition`, `_onChangeInput` and `data-edit` colour inputs come from ApplicationV1 and need replacing. The prototype token sheet (`PrototypeTokenConfig`) may also need the tab.
- **Grid.** Since v12 `canvas.grid` is the scene's grid object, and the grid layer moved. Revisit the `drawGridLayer` hook, `layer.borders`, `canvas.grid.tokenAuras`, and the `canvas.scene.grid.type === 1` check (use `CONST.GRID_TYPES`).
- **Namespaced globals.** Replace deprecated globals such as `Color` and `duplicate` (in the README) with their `foundry.utils` equivalents.
- **PIXI.** Check the PIXI version bundled with v14. Replace `beginFill`/`drawEllipse`/`drawRect`/`endFill` if the API changed.
- **Localization keys.** Check that the core keys still exist: `OWNERSHIP.*`, `USER.RoleGamemaster`, `SCENES.GridDistance`, `SCENES.GridSquare` and `GridUnits`.
- **Token movement.** `onRefreshToken` uses the document position, so auras jump to the destination during token animation. Consider using the placeable's position instead.

## Conventions

- Follow `.editorconfig`: tabs, LF line endings, final newline, no trailing whitespace.
- Match the existing style: single quotes, spaces inside the parentheses of `if ( ... )`, short methods on the `Auras` object.
- Put new user-facing strings in `lang/en.json` with the `AURAS.` prefix. Add the same key to the other language files only when a translation is available; do not machine-translate.
- Keep the module system-agnostic. Do not depend on a specific game system.
- Keep changes small and focused. Do not add a build toolchain unless the user asks for one.

## Testing

There are no automated tests. Verify changes manually in a Foundry v14 world:

1. Enable the module and open a token's configuration. Check that the Auras tab renders and saves all fields.
2. Check circular and square auras on square, hex and gridless scenes, with tokens of size 1 and larger.
3. Log in as a player. Check each permission level, and check that hidden tokens show no auras.
4. Move, resize, hide and delete tokens. Check that auras follow the token and leave no orphaned graphics.
5. Run `Auras.newAura()` and the README examples in the console.

State clearly which checks you ran and which you could not run.
