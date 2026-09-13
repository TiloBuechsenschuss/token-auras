// The public API that other modules and macros rely on.
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { Hooks, MODULE_ID, PrototypeToken, TokenDocument, auraFlags, loadModule, resetCanvas } from './support/foundry.mjs';

const Auras = await loadModule();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => resetCanvas());

describe('module exports', () => {
	test('Auras is a global', () => {
		assert.equal(typeof globalThis.Auras, 'object');
		assert.equal(typeof Auras.newAura, 'function');
	});

	test('Auras is the module api', () => {
		assert.equal(game.modules.get(MODULE_ID).api, Auras);
	});

	test('registers only these Foundry hooks', () => {
		// init and ready are once-hooks and have already fired.
		assert.deepEqual(Hooks.registered().sort(), [
			'destroyToken', 'drawToken', 'preRenderPrototypeTokenConfig', 'preRenderTokenConfig', 'refreshToken',
			'updateToken'
		]);
	});
});

describe('Auras.newAura', () => {
	test('returns the documented aura shape with defaults', () => {
		const aura = Auras.newAura();
		assert.deepEqual(Object.keys(aura).sort(), [
			'colour', 'distance', 'edge', 'edgeColour', 'edgeWidth', 'opacity', 'permission', 'square', 'uuid'
		]);
		assert.deepEqual({...aura, uuid: undefined}, {
			distance: null, colour: '#ffffff', opacity: .5, square: false, permission: 'all', edge: false,
			edgeColour: '#000000', edgeWidth: 1, uuid: undefined
		});
	});

	test('creates a unique version 4 uuid', () => {
		const uuids = new Set(Array.from({length: 50}, () => Auras.newAura().uuid));
		assert.equal(uuids.size, 50);
		for ( const uuid of uuids ) assert.match(uuid, UUID);
	});

	test('returns a new object on every call', () => {
		assert.notEqual(Auras.newAura(), Auras.newAura());
	});
});

describe('reading auras from flags', () => {
	const aura1 = {distance: 10, colour: '#ff0000', opacity: .3, square: true, permission: 'owner', uuid: 'a'};
	const extra = {distance: 15, colour: '#00ff00', opacity: 1, square: false, permission: 'all', uuid: 'b'};

	test('getManualAuras returns aura1 and aura2, with defaults for missing flags', () => {
		const doc = new TokenDocument({flags: auraFlags({aura1})});
		const [first, second] = Auras.getManualAuras(doc);
		assert.deepEqual(first, aura1);
		assert.equal(second.distance, null);
		assert.match(second.uuid, UUID);
	});

	test('getAllAuras appends the auras array', () => {
		const doc = new TokenDocument({flags: auraFlags({aura1, auras: [extra]})});
		const all = Auras.getAllAuras(doc);
		assert.equal(all.length, 3);
		assert.deepEqual(all[0], aura1);
		assert.deepEqual(all[2], extra);
	});

	test('works for tokens without flags', () => {
		assert.equal(Auras.getAllAuras(new TokenDocument()).length, 2);
	});

	test('works for prototype tokens', () => {
		const prototype = new PrototypeToken({flags: auraFlags({aura1, auras: [extra]})});
		assert.deepEqual(Auras.getAllAuras(prototype).map(a => a.uuid).filter(u => u.length === 1), ['a', 'b']);
	});
});
