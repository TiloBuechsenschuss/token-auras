// Aura rendering on the canvas: PrimaryGraphics in canvas.primary, driven by the Token draw, refresh and destroy hooks.
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import {
	Actor, OWNERSHIP, PrimaryGraphics, SORT_LAYERS, auraFlags, createToken, loadModule, makeGrid, resetCanvas, users
} from './support/foundry.mjs';

await loadModule();

function aura(data = {}) {
	return {distance: 10, colour: '#ff0000', opacity: .5, square: false, permission: 'all', uuid: 'u', ...data};
}

function tokenWith(auras, data = {}) {
	return createToken({flags: auraFlags(auras), ...data});
}

function command(token, type) {
	return token.tokenAuras.commands.find(c => c.type === type);
}

function shapes(token) {
	return token.tokenAuras.commands.filter(c => (c.type === 'ellipse') || (c.type === 'rect'));
}

beforeEach(() => resetCanvas());

describe('aura graphics', () => {
	test('adds one PrimaryGraphics per token to canvas.primary', () => {
		const token = tokenWith({aura1: aura(), aura2: aura({colour: '#00ff00'})});
		assert.ok(token.tokenAuras instanceof PrimaryGraphics);
		assert.deepEqual(canvas.primary.children, [token.tokenAuras]);
		assert.equal(token.tokenAuras.object, token);
	});

	test('renders just below tokens at the token elevation and sort', () => {
		const token = tokenWith({aura1: aura()}, {elevation: 30, sort: 4});
		assert.equal(token.tokenAuras.sortLayer, SORT_LAYERS.TOKENS - 1);
		assert.equal(token.tokenAuras.elevation, 30);
		assert.equal(token.tokenAuras.sort, 4);
	});

	test('follows the placeable position', () => {
		const token = tokenWith({aura1: aura()}, {x: 300, y: 500});
		assert.deepEqual([token.tokenAuras.position.x, token.tokenAuras.position.y], [300, 500]);
	});

	test('draws no graphics for tokens without auras', () => {
		const token = createToken();
		assert.equal(token.tokenAuras, null);
		assert.equal(canvas.primary.children.length, 0);
	});

	test('skips auras without a distance', () => {
		const token = tokenWith({aura1: aura({distance: null}), aura2: aura({distance: 0})});
		assert.equal(token.tokenAuras, null);
	});

	test('draws aura1, aura2 and the auras array', () => {
		const token = tokenWith({aura1: aura(), aura2: aura(), auras: [aura(), aura({distance: 0}), aura()]});
		assert.equal(shapes(token).length, 4);
	});

	test('fills with the aura colour and opacity', () => {
		const token = tokenWith({aura1: aura({colour: '#12ab34', opacity: .25})});
		assert.deepEqual(command(token, 'beginFill'), {type: 'beginFill', color: 0x12ab34, alpha: .25});
		assert.equal(token.tokenAuras.commands.at(-1).type, 'endFill');
	});

	test('falls back to white for an invalid colour', () => {
		const token = tokenWith({aura1: aura({colour: 'not a colour'})});
		assert.equal(command(token, 'beginFill').color, 0xffffff);
	});
});

describe('aura edges', () => {
	test('draws no edge by default', () => {
		const token = tokenWith({aura1: aura()});
		assert.equal(command(token, 'lineStyle').width, 0);
	});

	test('draws no edge for auras saved before edges existed', () => {
		const {edge, edgeColour, edgeWidth, ...legacy} = aura({edge: true, edgeColour: '#00ff00', edgeWidth: 3});
		const token = tokenWith({aura1: legacy});
		assert.equal(command(token, 'lineStyle').width, 0);
	});

	test('draws the edge with its colour and width', () => {
		const token = tokenWith({aura1: aura({edge: true, edgeColour: '#00ff00', edgeWidth: 3})});
		assert.deepEqual(command(token, 'lineStyle'), {type: 'lineStyle', width: 3, color: 0x00ff00, alpha: 1});
	});

	for ( const [name, edgeColour, edgeWidth] of [['empty', '', null], ['missing', undefined, undefined], ['invalid', 'nope', 0]] ) {
		test(`an ${name} edge colour and width fall back to black and 1 pixel`, () => {
			const token = tokenWith({aura1: aura({edge: true, edgeColour, edgeWidth})});
			assert.deepEqual(command(token, 'lineStyle'), {type: 'lineStyle', width: 1, color: 0x000000, alpha: 1});
		});
	}

	test('sets the line style of every aura before its shape', () => {
		resetCanvas();
		const token = tokenWith({aura1: aura({edge: true, edgeWidth: 2}), aura2: aura(), auras: [aura({square: true, edge: true})]});
		const types = token.tokenAuras.commands.map(c => c.type);
		assert.deepEqual(types, [
			'lineStyle', 'beginFill', 'ellipse', 'endFill',
			'lineStyle', 'beginFill', 'ellipse', 'endFill',
			'lineStyle', 'beginFill', 'rect', 'endFill'
		]);
		assert.deepEqual(token.tokenAuras.commands.filter(c => c.type === 'lineStyle').map(c => c.width), [2, 0, 1]);
	});
});

describe('aura geometry', () => {
	// Grid size 100 px per 5 units, so 1 unit = 20 px.
	const cases = [
		['square grid, circle, size 1', 'square', 1, false, {type: 'ellipse', x: 50, y: 50, halfWidth: 250, halfHeight: 250}],
		['square grid, circle, size 2', 'square', 2, false, {type: 'ellipse', x: 100, y: 100, halfWidth: 300, halfHeight: 300}],
		['square grid, square, size 1', 'square', 1, true, {type: 'rect', x: -200, y: -200, width: 500, height: 500}],
		['square grid, square, size 2', 'square', 2, true, {type: 'rect', x: -200, y: -200, width: 600, height: 600}],
		['gridless, circle, size 1', 'gridless', 1, false, {type: 'ellipse', x: 50, y: 50, halfWidth: 200, halfHeight: 200}],
		['gridless, circle, size 3', 'gridless', 3, false, {type: 'ellipse', x: 150, y: 150, halfWidth: 300, halfHeight: 300}]
	];

	for ( const [name, grid, size, square, expected] of cases ) {
		test(name, () => {
			resetCanvas({grid});
			const token = tokenWith({aura1: aura({square})}, {width: size, height: size});
			assert.deepEqual(shapes(token), [expected]);
		});
	}

	test('hex grid, circle, size 2 is measured from the centre hex', () => {
		resetCanvas({grid: 'hex'});
		const token = tokenWith({aura1: aura()}, {width: 2, height: 2});
		const [ellipse] = shapes(token);
		assert.deepEqual([ellipse.halfWidth, ellipse.halfHeight], [250, 250]);
		const center = token.document.getCenterPoint({x: 0, y: 0});
		assert.deepEqual([ellipse.x, ellipse.y], [center.x, center.y]);
	});

	test('uses the grid size and distance of the scene', () => {
		resetCanvas({grid: makeGrid('square', {size: 140, distance: 2})});
		const token = tokenWith({aura1: aura({distance: 3})});
		// 3 units + half a 2 unit square = 4 units at 70 px per unit
		assert.equal(shapes(token)[0].halfWidth, 280);
	});

	test('rectangular tokens get elliptical auras', () => {
		const token = tokenWith({aura1: aura({distance: 5})}, {width: 2, height: 1});
		const [ellipse] = shapes(token);
		assert.deepEqual([ellipse.halfWidth, ellipse.halfHeight], [200, 150]);
	});
});

describe('permissions', () => {
	const levels = {
		all: [true, true, true, true, true],
		limited: [false, true, true, true, true],
		observer: [false, false, true, true, true],
		owner: [false, false, false, true, true],
		gm: [false, false, false, false, true]
	};
	const viewers = [
		['player without permission', 'player', OWNERSHIP.NONE],
		['limited player', 'player', OWNERSHIP.LIMITED],
		['observer player', 'player', OWNERSHIP.OBSERVER],
		['owner player', 'player', OWNERSHIP.OWNER],
		['GM', 'gm', OWNERSHIP.NONE]
	];

	for ( const [permission, visible] of Object.entries(levels) ) {
		viewers.forEach(([viewer, user, level], i) => {
			test(`${permission} aura ${visible[i] ? 'is' : 'is not'} drawn for a ${viewer}`, () => {
				resetCanvas({user});
				const actor = new Actor({ownership: {default: OWNERSHIP.NONE, [users.player.id]: level}});
				const token = tokenWith({aura1: aura({permission})}, {actor});
				assert.equal(!!token.tokenAuras, visible[i]);
			});
		});
	}

	test('a missing permission means all', () => {
		resetCanvas({user: 'player'});
		const token = tokenWith({aura1: aura({permission: undefined})});
		assert.ok(token.tokenAuras);
	});

	test('permission auras on tokens without an actor are not drawn for players', () => {
		resetCanvas({user: 'player'});
		const token = tokenWith({aura1: aura({permission: 'limited'})});
		assert.equal(token.tokenAuras, null);
	});
});

describe('visibility', () => {
	test('hidden tokens draw no auras for players', () => {
		resetCanvas({user: 'player'});
		const token = tokenWith({aura1: aura()}, {hidden: true});
		assert.equal(token.tokenAuras, null);
		assert.equal(canvas.primary.children.length, 0);
	});

	test('hidden tokens show auras to the GM', () => {
		const token = tokenWith({aura1: aura()}, {hidden: true});
		assert.equal(token.tokenAuras.visible, true);
	});

	test('hiding a token removes the aura for players', () => {
		resetCanvas({user: 'player'});
		const token = tokenWith({aura1: aura()});
		const gfx = token.tokenAuras;
		token.document.update({hidden: true});
		assert.equal(gfx.destroyed, true);
		assert.equal(token.tokenAuras, null);
	});

	test('revealing a token draws the aura for players', () => {
		resetCanvas({user: 'player'});
		const token = tokenWith({aura1: aura()}, {hidden: true});
		token.document.update({hidden: false});
		assert.equal(token.tokenAuras.visible, true);
	});

	test('the aura hides while the token is not visible', () => {
		resetCanvas({user: 'player'});
		const token = tokenWith({aura1: aura()});
		token.seen = false;
		token.applyRenderFlags({refreshVisibility: true});
		assert.equal(token.tokenAuras.visible, false);
		token.seen = true;
		token.applyRenderFlags({refreshVisibility: true});
		assert.equal(token.tokenAuras.visible, true);
	});

	test('the aura is hidden while the token is being drawn', () => {
		let visibleDuringDraw;
		const token = tokenWith({aura1: aura()});
		Hooks.on('drawToken', t => { if ( t === token ) visibleDuringDraw = token.tokenAuras.visible; });
		token.draw();
		assert.equal(visibleDuringDraw, false);
		assert.equal(token.tokenAuras.visible, true);
	});

	test('the aura alpha follows the token alpha', () => {
		const token = tokenWith({aura1: aura()});
		token.alpha = .4;
		token.applyRenderFlags({refreshState: true});
		assert.equal(token.tokenAuras.alpha, .4);
	});
});

describe('updates', () => {
	test('follows the token during movement animation', () => {
		const token = tokenWith({aura1: aura()});
		// Token#animate writes the animated position into the document and sets refreshPosition.
		token.document.x = 42;
		token.document.y = 84;
		token.applyRenderFlags({refreshPosition: true});
		assert.deepEqual([token.tokenAuras.position.x, token.tokenAuras.position.y], [42, 84]);
	});

	test('does not redraw the shape on a position refresh', () => {
		const token = tokenWith({aura1: aura()});
		const count = token.tokenAuras.clearCount;
		token.applyRenderFlags({refreshPosition: true});
		assert.equal(token.tokenAuras.clearCount, count);
	});

	test('redraws the shape when the size changes', () => {
		const token = tokenWith({aura1: aura()});
		token.document.update({width: 2, height: 2});
		assert.equal(shapes(token)[0].halfWidth, 300);
	});

	test('updates the elevation', () => {
		const token = tokenWith({aura1: aura()});
		token.document.update({elevation: 15});
		assert.equal(token.tokenAuras.elevation, 15);
	});

	test('redraws when the aura flags change', () => {
		const token = tokenWith({aura1: aura()});
		token.document.update({flags: auraFlags({aura1: aura({distance: 20})})});
		assert.equal(shapes(token)[0].halfWidth, 450);
	});

	test('creates the graphics when the first aura is added', () => {
		const token = createToken();
		token.document.update({flags: auraFlags({auras: [aura()]})});
		assert.ok(token.tokenAuras);
		assert.equal(canvas.primary.children.length, 1);
	});

	test('removes the graphics when the last aura is removed', () => {
		const token = tokenWith({aura1: aura()});
		const gfx = token.tokenAuras;
		token.document.update({flags: auraFlags({aura1: aura({distance: null})})});
		assert.equal(gfx.destroyed, true);
		assert.equal(canvas.primary.children.length, 0);
	});

	test('ignores updates of other flags', () => {
		const token = tokenWith({aura1: aura()});
		const count = token.tokenAuras.clearCount;
		token.document.update({flags: {world: {note: 1}}});
		assert.equal(token.tokenAuras.clearCount, count);
	});

	test('ignores updates of tokens that are not rendered', () => {
		const token = tokenWith({aura1: aura()});
		token.destroy();
		assert.doesNotThrow(() => token.document.update({flags: auraFlags({aura1: aura({distance: 5})})}));
		assert.equal(canvas.primary.children.length, 0);
	});
});

describe('previews and destruction', () => {
	test('destroying the token destroys its graphics', () => {
		const token = tokenWith({aura1: aura()});
		const gfx = token.tokenAuras;
		token.destroy();
		assert.equal(gfx.destroyed, true);
		assert.equal(token.tokenAuras, null);
		assert.equal(canvas.primary.children.length, 0);
	});

	test('destroying graphics that were already torn down does not fail', () => {
		const token = tokenWith({aura1: aura()});
		token.tokenAuras.destroy();
		assert.doesNotThrow(() => token.destroy());
	});

	test('redrawing a token reuses its graphics', () => {
		const token = tokenWith({aura1: aura()});
		const gfx = token.tokenAuras;
		token.draw();
		assert.equal(token.tokenAuras, gfx);
		assert.equal(canvas.primary.children.length, 1);
	});

	test('a drag preview gets its own aura, which is removed with the preview', () => {
		const token = tokenWith({aura1: aura()});
		const preview = token.clone().draw();
		assert.equal(canvas.primary.children.length, 2);
		assert.notEqual(preview.tokenAuras, token.tokenAuras);
		preview.destroy();
		assert.deepEqual(canvas.primary.children, [token.tokenAuras]);
	});

	test('a config preview shows unsaved aura changes after a refresh', () => {
		const token = tokenWith({aura1: aura()});
		const preview = token.clone().draw();
		// TokenConfig#_previewChanges: updateSource() on the preview, then renderFlags.set({refresh: true}).
		preview.document.flags = auraFlags({aura1: aura({distance: 20})});
		preview.applyRenderFlags({refreshSize: true, refreshPosition: true, refreshVisibility: true});
		assert.equal(shapes(preview)[0].halfWidth, 450);
		assert.equal(shapes(token)[0].halfWidth, 250);
	});
});
