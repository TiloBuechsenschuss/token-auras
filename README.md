# Token Auras Revitalized

A [FoundryVTT](https://foundryvtt.com) module for configuring token auras. Auras are visual only, but should work in any system and can be used as a basis to build more advanced features on top of. The module adds configuration options for up to two auras to the token configuration dialog, and additional auras can be added programmatically, with no limit.

![Example token configuration](example-config.jpg)

![Example aura visuals](example-aura.jpg)

## About this fork

Token Auras Revitalized is an unofficial continuation of [Token Auras](https://bitbucket.org/Fyorl/token-auras) by Kim Mantas (Fyorl). The original module supports Foundry VTT v10 and v11 and is no longer updated.

Token Auras Revitalized is maintained by Tilo Büchsenschuß at [github.com/TiloBuechsenschuss/token-auras](https://github.com/TiloBuechsenschuss/token-auras). It ports the module to **Foundry VTT v14**.

- Version 3.0.0 and later require Foundry VTT v14. For v10 and v11, use version 2.7 of the original module.
- Please report problems with this fork on the [GitHub issue tracker](https://github.com/TiloBuechsenschuss/token-auras/issues), not to the original author.
- The module id is `token-auras-revitalized`. Aura data of the original module is imported once, see [Upgrading from Token Auras](#upgrading-from-token-auras).

### Changes in the v14 port

- The Auras tab is available in the token configuration and in the prototype token configuration of actors.
- While the token configuration is open, the canvas preview shows aura changes before you save.
- Auras render below tokens and use the token elevation.
- Auras can display an edge with its own colour and width.

### Upgrading from Token Auras

Token Auras Revitalized has its own module id, `token-auras-revitalized`, so Foundry treats it as a separate module. Install it with the manifest URL below. The original module does not need to be active or installed for the import.

When a Gamemaster loads a world, the module imports the aura data of the original module once:

- It copies `aura1`, `aura2` and `auras` from `flags.token-auras` to `flags.token-auras-revitalized`. This covers the tokens in all scenes of the world and the prototype tokens of all world actors.
- Tokens that are created later, for example from a compendium actor, are imported when they are created. Compendium content itself is not changed.
- A token that already has Token Auras Revitalized aura data keeps it.
- After the import, the token gets the flag `flags.token-auras-revitalized.imported`. The module never imports the data of that token again, even if you remove its auras.
- The data of the original module stays on the tokens.

After the import, disable the original module, otherwise both modules draw the same auras. Macros and modules that use the `token-auras` flag scope or `game.modules.get('token-auras')` must change to `token-auras-revitalized`.
- An aura is only visible while its token is visible to you. Hidden tokens still show no auras to players.

## AI disclosure

> [!WARNING]
> Parts of this fork, including code and documentation, are written with the help of AI coding assistants. AI-generated code can contain errors that are not obvious at first. Test the module in a separate world and back up your data before you use it in a live game.

## API

Aura objects have the following properties:
```js
{
    distance: number|null, // The radius (in grid units) of the aura.
    colour: string, // An HTML hexadecimal colour.
    opacity: number, // The opacity of the aura between 0 and 1.
    square: boolean, // The aura is square if true, otherwise it is circular.
    permission: string, // The permission level required to see this aura.
    edge: boolean, // Draw an edge around the aura if true.
    edgeColour: string|null, // An HTML hexadecimal colour for the edge. Empty means black.
    edgeWidth: number|null, // The width of the edge in pixels. Empty means 1.
    uuid: string // A unique identifier for every aura.
}
```

The edge properties are optional. Auras without them are drawn without an edge.

The flag `imported` in the `token-auras-revitalized` scope records the import from Token Auras. Do not use it for other data.

A new aura can be created with:
```js
Auras.newAura();
```

The `Auras` object is also available as `game.modules.get('token-auras-revitalized').api`.

### Examples
The examples use `token`, a Token placeable such as the selected token in a macro. The flags live on its TokenDocument, `token.document`.

Programmatically edit the radius of an aura to be `10` grid units:
```js
token.document.setFlag('token-auras-revitalized', 'aura1.distance', 10);
```

The UI-configurable auras are stored in `aura1` and `aura2`, but additional auras can be added by adding to the `auras` array:
```js
const auras = foundry.utils.deepClone(token.document.getFlag('token-auras-revitalized', 'auras') ?? []);
const newAura = Auras.newAura();
newAura.distance = 15;
newAura.colour = '#ff0000';
auras.push(newAura);
token.document.setFlag('token-auras-revitalized', 'auras', auras);
```

## Building and releasing

The build needs [pnpm](https://pnpm.io) and Node.js.

```sh
pnpm install
pnpm build
```

The build writes `dist/module.zip` (the installable module) and `dist/module.json` (the manifest for the release).

Run the automated tests with `pnpm test` (Node.js 22 or later). To also check the module against the client code of your Foundry installation, set `FOUNDRY_PATH`:

```sh
FOUNDRY_PATH="/path/to/Foundry Virtual Tabletop" pnpm test
```

To publish a release, bump `version` in `module.json` and push to the `release` branch. The GitHub Actions workflow runs the tests, builds the module, creates the tag (for example `3.0.0`) and a GitHub release with both files. It fails if the tag for that version already exists.

The manifest URL for Foundry is `https://github.com/TiloBuechsenschuss/token-auras/releases/latest/download/module.json`.

## Credits

- Original module: Kim Mantas ([Fyorl](https://bitbucket.org/Fyorl/token-auras)).
- Contributors to the original module: Anthony Huber (PF2E support), Matt Raykowski (token drawing fix) and Marcel Wiechmann (German translation update).
- Translations: German, French, Italian and Brazilian Portuguese, contributed to the original module.

## License

Token Auras Revitalized is licensed under the [GNU General Public License v3.0](LICENSE), the same license as the original module.

Copyright (C) Kim Mantas and contributors to the original module.
Modifications since 2026 by Tilo Büchsenschuß, with the help of AI coding assistants.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the [LICENSE](LICENSE) file for details.
