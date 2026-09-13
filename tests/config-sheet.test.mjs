// The Auras tab of the ApplicationV2 token configuration sheets.
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import {
	Actor, MODULE_ID, PrototypeToken, PrototypeTokenConfig, TokenConfig, auraFlags, createToken, expandObject,
	formGroupCalls, loadModule, renderSheet, resetCanvas
} from './support/foundry.mjs';

// A system sheet that copies the core PARTS at class definition, like most system token sheets.
class SystemTokenConfig extends TokenConfig {
	static PARTS = {...TokenConfig.PARTS, system: {template: 'systems/test/token.hbs'}};
}

// A token sheet registered by a module after the system, still before ready.
class LateTokenConfig extends TokenConfig {
	static PARTS = {...TokenConfig.PARTS};
	static TABS = {sheet: {...TokenConfig.TABS.sheet, tabs: [...TokenConfig.TABS.sheet.tabs]}};
}

// An ApplicationV1 style sheet without PARTS or TABS.
class LegacyTokenConfig {}

const initialParts = Object.keys(TokenConfig.PARTS);
const Auras = await loadModule();
// loadModule already fired ready; register the extra sheets and fire the registration again like a late ready.
CONFIG.Token.sheetClasses.base.system = {cls: SystemTokenConfig};
CONFIG.Token.sheetClasses.base.late = {cls: LateTokenConfig};
CONFIG.Token.sheetClasses.base.legacy = {cls: LegacyTokenConfig};
Auras.registerConfigTabs();

const TAB = 'tokenAuras';
const aura1 = {
	distance: 10, colour: '#ff0000', opacity: .3, square: true, permission: 'owner', edge: true, edgeColour: '#00ff00',
	edgeWidth: 3, uuid: 'existing-uuid'
};

function openConfig(data = {flags: auraFlags({aura1})}, cls = TokenConfig) {
	const token = createToken(data);
	return new cls({document: token.document, id: `${cls.name}-${token.document.id}`});
}

function sectionOf(html) {
	return html.match(/<section[^>]*>/)[0];
}

function hiddenInputs(html) {
	return Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map(m => [m[1], m[2]]));
}

// Mirrors FormDataExtended + expandObject for the fields rendered by this module.
function submitData(html) {
	const flat = hiddenInputs(html);
	for ( const {hash} of formGroupCalls ) flat[hash.name] = hash.value;
	return expandObject(flat);
}

beforeEach(() => resetCanvas());

describe('tab registration', () => {
	for ( const cls of [TokenConfig, PrototypeTokenConfig, SystemTokenConfig, LateTokenConfig] ) {
		test(`${cls.name} gets the Auras tab and part`, () => {
			assert.deepEqual(cls.TABS.sheet.tabs.filter(t => t.id === TAB), [
				{id: TAB, icon: 'fa-regular fa-circle-dot', label: 'AURAS.Auras'}
			]);
			assert.deepEqual(cls.PARTS[TAB], {template: `modules/${MODULE_ID}/templates/token-config.hbs`, scrollable: ['']});
		});

		test(`${cls.name} keeps the footer as the last part`, () => {
			const parts = Object.keys(cls.PARTS);
			assert.deepEqual(parts.slice(-2), [TAB, 'footer']);
		});
	}

	test('keeps all core parts in their order', () => {
		assert.deepEqual(Object.keys(TokenConfig.PARTS).filter(p => p !== TAB), initialParts);
	});

	test('is idempotent', () => {
		Auras.registerConfigTabs();
		Auras.registerConfigTabs();
		for ( const cls of [TokenConfig, PrototypeTokenConfig, SystemTokenConfig, LateTokenConfig] ) {
			assert.equal(cls.TABS.sheet.tabs.filter(t => t.id === TAB).length, 1);
			assert.equal(Object.keys(cls.PARTS).filter(p => p === TAB).length, 1);
		}
	});

	test('ignores sheets without PARTS and TABS', () => {
		assert.equal(LegacyTokenConfig.PARTS, undefined);
		assert.equal(LegacyTokenConfig.TABS, undefined);
	});
});

describe('rendering the token config', () => {
	test('renders the Auras part before the footer', async () => {
		const {parts} = await renderSheet(openConfig());
		assert.deepEqual(parts.slice(-2), [TAB, 'footer']);
	});

	test('prepares the tab for the navigation', async () => {
		const {context} = await renderSheet(openConfig());
		assert.deepEqual(context.tabs[TAB], {
			group: 'sheet', id: TAB, active: false, cssClass: undefined, icon: 'fa-regular fa-circle-dot', label: 'AURAS.Auras'
		});
	});

	test('renders a tab section in the sheet tab group', async () => {
		const {html} = await renderSheet(openConfig());
		assert.equal(sectionOf(html[TAB]), '<section class="tab scrollable " data-group="sheet" data-tab="tokenAuras">');
	});

	test('marks the section active when the Auras tab is active', async () => {
		const app = openConfig();
		app.tabGroups.sheet = TAB;
		const {html} = await renderSheet(app);
		assert.match(sectionOf(html[TAB]), /class="tab scrollable active"/);
	});

	test('renders one fieldset per UI aura', async () => {
		const {html} = await renderSheet(openConfig());
		const legends = [...html[TAB].matchAll(/<legend>([^<]*)<\/legend>/g)].map(m => m[1]);
		assert.deepEqual(legends, ['AURAS.AuraN{&quot;number&quot;:1}', 'AURAS.AuraN{&quot;number&quot;:2}']);
	});

	test('renders every aura field with the core formGroup helper', async () => {
		const app = openConfig();
		await renderSheet(app);
		const fields = ['permission', 'colour', 'opacity', 'distance', 'square', 'edge', 'edgeColour', 'edgeWidth'];
		assert.deepEqual(formGroupCalls.map(c => c.hash.name), [
			...fields.map(f => `flags.${MODULE_ID}.aura1.${f}`),
			...fields.map(f => `flags.${MODULE_ID}.aura2.${f}`)
		]);
		assert.deepEqual(formGroupCalls.map(c => c.field.constructor.name).slice(0, 8), [
			'StringField', 'ColorField', 'AlphaField', 'NumberField', 'BooleanField', 'BooleanField', 'ColorField', 'NumberField'
		]);
		for ( const {hash} of formGroupCalls ) {
			assert.equal(hash.localize, true);
			assert.equal(hash.rootId, app.id);
		}
	});

	test('fills the inputs from the token flags and defaults', async () => {
		await renderSheet(openConfig());
		const values = formGroupCalls.map(c => c.hash.value);
		assert.deepEqual(values, [
			'owner', '#ff0000', .3, 10, true, true, '#00ff00', 3,
			'all', '#ffffff', .5, null, false, false, '#000000', 1
		]);
	});

	test('uses a slider step for opacity and the scene grid units for the distance', async () => {
		await renderSheet(openConfig());
		const byName = Object.fromEntries(formGroupCalls.map(c => [c.hash.name.split('.').slice(-2).join('.'), c.hash]));
		assert.equal(byName['aura1.opacity'].step, .01);
		assert.equal(byName['aura1.distance'].units, 'ft');
		assert.equal(byName['aura1.colour'].units, undefined);
	});

	test('configures the fields for the form inputs', async () => {
		await renderSheet(openConfig());
		const [permission, colour, opacity, distance, square, edge, edgeColour, edgeWidth] = formGroupCalls.map(c => c.field);
		assert.deepEqual(permission.choices(), {
			all: 'AURAS.All', limited: 'OWNERSHIP.LIMITED', observer: 'OWNERSHIP.OBSERVER', owner: 'OWNERSHIP.OWNER',
			gm: 'USER.RoleGamemaster'
		});
		assert.equal(permission.blank, false);
		assert.equal(colour.nullable, false);
		assert.deepEqual([opacity.min, opacity.max], [0, 1]);
		assert.equal(distance.min, 0);
		assert.equal(distance.nullable, true);
		// Empty edge inputs are allowed and show the fallback values as placeholders.
		assert.equal(edgeColour.nullable, true);
		assert.equal(edgeColour.placeholder, '#000000');
		assert.deepEqual([edgeWidth.min, edgeWidth.nullable, edgeWidth.placeholder], [1, true, '1']);
		assert.deepEqual([permission, colour, opacity, distance, square, edge, edgeColour, edgeWidth].map(f => f.label), [
			'AURAS.ShowTo', 'AURAS.AuraColour', 'AURAS.Opacity', 'MEASUREMENT.Distance', 'SCENE.GridSquare',
			'AURAS.DisplayEdge', 'AURAS.EdgeColour', 'AURAS.EdgeWidth'
		]);
	});

	test('keeps existing uuids and creates missing ones', async () => {
		const {html} = await renderSheet(openConfig());
		const hidden = hiddenInputs(html[TAB]);
		assert.equal(hidden[`flags.${MODULE_ID}.aura1.uuid`], 'existing-uuid');
		assert.match(hidden[`flags.${MODULE_ID}.aura2.uuid`], /^[0-9a-f-]{36}$/);
	});

	test('submits the documented aura shape', async () => {
		const {html} = await renderSheet(openConfig());
		const {flags} = submitData(html[TAB]);
		assert.deepEqual(Object.keys(flags), [MODULE_ID]);
		assert.deepEqual(Object.keys(flags[MODULE_ID]), ['aura1', 'aura2']);
		assert.deepEqual(flags[MODULE_ID].aura1, aura1);
		const keys = Object.keys(Auras.newAura()).sort();
		assert.deepEqual(Object.keys(flags[MODULE_ID].aura2).sort(), keys);
	});

	test('reads the config preview instead of the saved document', async () => {
		const app = openConfig();
		app._preview = app.document.clone();
		app._preview.flags = auraFlags({aura1: {...aura1, distance: 20}});
		await renderSheet(app);
		assert.equal(formGroupCalls[3].hash.value, 20);
	});

	test('fires for system subclasses through the class hierarchy', async () => {
		const {html} = await renderSheet(openConfig(undefined, SystemTokenConfig));
		assert.equal(formGroupCalls.length, 16);
		assert.match(html[TAB], /data-tab="tokenAuras"/);
	});

	test('re-renders only the requested parts', async () => {
		const {html} = await renderSheet(openConfig(), {parts: ['vision']});
		assert.deepEqual(Object.keys(html), ['vision']);
		assert.equal(formGroupCalls.length, 0);
	});
});

describe('rendering the prototype token config', () => {
	test('renders the Auras tab for a prototype token', async () => {
		const prototype = new PrototypeToken({flags: auraFlags({aura1})});
		prototype.actor = new Actor();
		const app = new PrototypeTokenConfig({prototype, id: 'PrototypeTokenConfig-Actor-a1'});
		const {html} = await renderSheet(app);
		assert.match(html[TAB], /data-tab="tokenAuras"/);
		assert.deepEqual(formGroupCalls.slice(0, 5).map(c => c.hash.value), ['owner', '#ff0000', .3, 10, true]);
		assert.equal(formGroupCalls[3].hash.units, 'Grid Units');
		assert.equal(formGroupCalls[0].hash.rootId, 'PrototypeTokenConfig-Actor-a1');
	});
});
