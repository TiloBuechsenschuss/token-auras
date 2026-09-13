// The one-time import of aura data from the original Token Auras module.
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import {
	Actor, LEGACY_ID, MODULE_ID, Scene, TokenDocument, createToken, loadModule, resetCanvas
} from './support/foundry.mjs';

const Auras = await loadModule();

function aura(data = {}) {
	return {distance: 10, colour: '#ff0000', opacity: .5, square: false, permission: 'all', uuid: 'u', ...data};
}

const legacy = {aura1: aura({uuid: 'legacy1'}), aura2: aura({uuid: 'legacy2', distance: null}), auras: [aura({uuid: 'legacy3'})]};
const current = {aura1: aura({uuid: 'current', colour: '#00ff00'})};

function flags({oldData = legacy, newData = null} = {}) {
	const result = {};
	if ( oldData ) result[LEGACY_ID] = structuredClone(oldData);
	if ( newData ) result[MODULE_ID] = structuredClone(newData);
	return result;
}

// A token that was loaded with the world, so no creation hooks run.
function worldToken(data) {
	return createToken({flags: flags(data)}, {existing: true});
}

beforeEach(() => resetCanvas());

describe('Auras.getLegacyImport', () => {
	test('copies aura1, aura2 and auras and marks the import', () => {
		assert.deepEqual(Auras.getLegacyImport(flags()), {imported: true, ...legacy});
	});

	test('copies only the aura keys that exist', () => {
		assert.deepEqual(Auras.getLegacyImport(flags({oldData: {auras: [aura()]}})), {imported: true, auras: [aura()]});
	});

	test('returns null without Token Auras data', () => {
		for ( const data of [undefined, {}, {world: {}}, {[LEGACY_ID]: {}}, {[LEGACY_ID]: {other: 1}}] ) {
			assert.equal(Auras.getLegacyImport(data), null);
		}
	});

	test('only marks the import when Token Auras Revitalized data exists', () => {
		assert.deepEqual(Auras.getLegacyImport(flags({newData: current})), {imported: true});
	});

	test('returns null once the data was imported', () => {
		assert.equal(Auras.getLegacyImport(flags({newData: {imported: true}})), null);
	});

	test('does not share objects with the Token Auras data', () => {
		const data = flags();
		Auras.getLegacyImport(data).auras[0].distance = 99;
		assert.equal(data[LEGACY_ID].auras[0].distance, 10);
	});
});

describe('Auras.migrateWorld', () => {
	test('imports scene tokens, keeps the original data and draws the auras', async () => {
		const token = worldToken();
		assert.equal(token.tokenAuras, null);
		await Auras.migrateWorld();
		assert.deepEqual(token.document.flags[MODULE_ID], {imported: true, ...legacy});
		assert.deepEqual(token.document.flags[LEGACY_ID], legacy);
		assert.ok(token.tokenAuras);
	});

	test('updates each scene once, with only the tokens that need an import', async () => {
		const imported = worldToken();
		const both = worldToken({newData: current});
		worldToken({oldData: null, newData: current});
		worldToken({oldData: null});
		await Auras.migrateWorld();
		assert.deepEqual(canvas.scene.updateCalls.map(updates => updates.map(u => u._id)), [[imported.document.id, both.document.id]]);
		assert.deepEqual(both.document.flags[MODULE_ID], {imported: true, ...current});
	});

	test('imports the tokens of every scene', async () => {
		const other = new Scene({id: 'other', grid: canvas.grid});
		const doc = new TokenDocument({id: 'other-token', flags: flags()}, {scene: other});
		other.tokens.set(doc.id, doc);
		game.scenes.set(other.id, other);
		await Auras.migrateWorld();
		assert.deepEqual(doc.flags[MODULE_ID], {imported: true, ...legacy});
	});

	test('imports the prototype tokens of world actors', async () => {
		const actor = new Actor({prototypeToken: {flags: flags()}});
		const untouched = new Actor({prototypeToken: {flags: flags({oldData: null, newData: current})}});
		game.actors.set(actor.id, actor).set(untouched.id, untouched);
		await Auras.migrateWorld();
		assert.deepEqual(actor.prototypeToken.flags[MODULE_ID], {imported: true, ...legacy});
		assert.deepEqual(untouched.prototypeToken.flags, flags({oldData: null, newData: current}));
		assert.deepEqual(Actor.updateCalls.map(updates => updates.map(u => u._id)), [[actor.id]]);
	});

	test('does not import again after the aura data was removed', async () => {
		const token = worldToken();
		await Auras.migrateWorld();
		token.document.flags[MODULE_ID] = {imported: true};
		canvas.scene.updateCalls.length = 0;
		await Auras.migrateWorld();
		assert.equal(canvas.scene.updateCalls.length, 0);
		assert.deepEqual(token.document.flags[MODULE_ID], {imported: true});
	});

	test('does nothing without Token Auras data', async () => {
		worldToken({oldData: null, newData: current});
		game.actors.set('a', new Actor({id: 'a'}));
		await Auras.migrateWorld();
		assert.equal(canvas.scene.updateCalls.length, 0);
		assert.equal(Actor.updateCalls.length, 0);
	});

	test('players do not import', async () => {
		resetCanvas({user: 'player'});
		const token = worldToken();
		await Auras.migrateWorld();
		assert.equal(token.document.flags[MODULE_ID], undefined);
		assert.equal(canvas.scene.updateCalls.length, 0);
	});

	test('other GMs leave the import to the active GM', async () => {
		game.users.activeGM = {id: 'other-gm', isGM: true};
		const token = worldToken();
		await Auras.migrateWorld();
		assert.equal(token.document.flags[MODULE_ID], undefined);
	});
});

describe('new tokens', () => {
	test('import Token Auras data before they are created', () => {
		const token = createToken({flags: flags()});
		assert.deepEqual(token.document.flags[MODULE_ID], {imported: true, ...legacy});
		assert.ok(token.tokenAuras);
		assert.equal(canvas.scene.updateCalls.length, 0);
	});

	test('keep the data of tokens that were already imported', () => {
		const data = flags({newData: {imported: true, ...current}});
		const token = createToken({flags: data});
		assert.deepEqual(token.document.flags, data);
	});

	test('import for players who create tokens', () => {
		resetCanvas({user: 'player'});
		const token = createToken({flags: flags()});
		assert.equal(token.document.flags[MODULE_ID].imported, true);
	});
});
