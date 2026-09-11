# Token Auras

A [FoundryVTT](https://foundryvtt.com) module for configuring token auras. Auras are visual only, but should work in any system and can be used as a basis to build more advanced features on top of. The module adds configuration options for up to two auras to the token configuration dialog, and additional auras can be added programmatically, with no limit.

![Example token configuration](example-config.jpg)

![Example aura visuals](example-aura.jpg)

## About this fork

This is an unofficial continuation of [Token Auras](https://bitbucket.org/Fyorl/token-auras) by Kim Mantas (Fyorl). The original module supports Foundry VTT v10 and v11 and is no longer updated.

This fork is maintained by Tilo Büchsenschuß at [github.com/TiloBuechsenschuss/token-auras](https://github.com/TiloBuechsenschuss/token-auras). Its goal is to port the module to **Foundry VTT v14**.

- The port is **work in progress**. The current code still targets v10/v11 and does not work on v14 yet.
- Please report problems with this fork on the [GitHub issue tracker](https://github.com/TiloBuechsenschuss/token-auras/issues), not to the original author.
- The module id stays `token-auras`, so existing aura data on your tokens keeps working.

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
    uuid: string // A unique identifier for every aura.
}
```

A new aura can be created with:
```js
Auras.newAura();
```

### Examples
Programmatically edit the radius of an aura to be `10` grid units:
```js
token.setFlag('token-auras', 'aura1.distance', 10);
```

The UI-configurable auras are stored in `aura1` and `aura2`, but additional auras can be added by adding to the `auras` array:
```js
const auras = foundry.utils.deepClone(token.getFlag('token-auras', 'auras') ?? []);
const newAura = Auras.newAura();
newAura.distance = 15;
newAura.colour = '#ff0000';
auras.push(newAura);
token.setFlag('token-auras', 'auras', auras);
```

## Credits

- Original module: Kim Mantas ([Fyorl](https://bitbucket.org/Fyorl/token-auras)).
- Contributors to the original module: Anthony Huber (PF2E support), Matt Raykowski (token drawing fix) and Marcel Wiechmann (German translation update).
- Translations: German, French, Italian and Brazilian Portuguese, contributed to the original module.

## License

Token Auras is licensed under the [GNU General Public License v3.0](LICENSE), the same license as the original module.

Copyright (C) Kim Mantas and contributors to the original module.
Modifications since 2026 by Tilo Büchsenschuß, with the help of AI coding assistants.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the [LICENSE](LICENSE) file for details.
