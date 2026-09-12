// Contract tests: check that the Foundry VTT client still behaves the way tests/support/foundry.mjs and main.js expect.
// They read the client code of a local Foundry installation and skip when none is configured:
//
//   FOUNDRY_PATH="C:/Program Files/Foundry Virtual Tabletop" pnpm test
//
// FOUNDRY_PATH may point to the installation, its resources/app folder or its public folder.
// When a check fails after a Foundry update, update main.js and the matching stub together.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { before, describe, test } from 'node:test';
import { ROOT } from '../support/foundry.mjs';

function findPublicDir(base) {
	if ( !base ) return null;
	const candidates = [base, path.join(base, 'public'), path.join(base, 'resources', 'app', 'public')];
	return candidates.find(dir => existsSync(path.join(dir, 'scripts', 'foundry.mjs'))) ?? null;
}

const publicDir = findPublicDir(process.env.FOUNDRY_PATH);
const skip = publicDir ? false : 'set FOUNDRY_PATH to a Foundry VTT v14 installation to run the contract tests';

let src;
let lang;

/** The source of a top-level class or function, from its header to the next top-level declaration. */
function block(header) {
	const match = typeof header === 'string' ? {index: src.indexOf(header), 0: header} : header.exec(src);
	assert.ok(match && (match.index >= 0), `Cannot find ${header} in foundry.mjs`);
	const rest = src.slice(match.index + match[0].length);
	const end = rest.search(/\n(?:class |function |let \w+\$?\d* = class )/);
	return match[0] + (end === -1 ? rest : rest.slice(0, end));
}

/** The body of a method inside a block, up to the next method at the same indentation. */
function method(code, signature) {
	const start = code.indexOf(signature);
	assert.ok(start >= 0, `Cannot find ${signature}`);
	const indent = code.slice(code.lastIndexOf('\n', start) + 1, start);
	const end = code.indexOf(`\n${indent}}`, start);
	return code.slice(start, end);
}

function includes(code, snippet, why) {
	assert.ok(code.includes(snippet), `Expected "${snippet}". ${why}`);
}

function inOrder(code, snippets, why) {
	let last = -1;
	for ( const snippet of snippets ) {
		const index = code.indexOf(snippet, last + 1);
		assert.ok(index > last, `Expected "${snippet}" after the previous step. ${why}`);
		last = index;
	}
}

const hook = name => new RegExp(`Hooks(?:\\$\\d+)?\\.callAll\\(${name}`);

describe('Foundry VTT v14 client contract', {skip}, () => {
	before(async () => {
		src = (await readFile(path.join(publicDir, 'scripts', 'foundry.mjs'), 'utf8')).replace(/\r\n/g, '\n');
		lang = JSON.parse(await readFile(path.join(publicDir, 'lang', 'en.json'), 'utf8'));
	});

	describe('placeable hooks', () => {
		test('drawToken fires after drawing, with the placeable hidden, before the full refresh', () => {
			const draw = method(block('class PlaceableObject extends'), 'async draw(options={})');
			assert.match(draw, hook('`draw\\$\\{this\\.document\\.documentName\\}`, this\\)'));
			inOrder(draw, ['this.visible = false;', 'await this._draw(options);', '`draw${', 'this.renderFlags.set({refresh: true})', 'this.visible = wasVisible;'],
				'Token#draw is mirrored by the stub Token#draw.');
		});

		test('refreshToken receives the applied render flags', () => {
			const apply = method(block('class PlaceableObject extends'), 'applyRenderFlags() {');
			assert.match(apply, hook('`refresh\\$\\{this\\.document\\.documentName\\}`, this, flags\\)'));
			inOrder(apply, ['this._applyRenderFlags(flags);', '`refresh${'], 'The hook must run after the placeable refreshed itself.');
		});

		test('destroyToken fires before the placeable is torn down', () => {
			const destroy = method(block('class PlaceableObject extends'), 'destroy(options) {');
			assert.match(destroy, hook('`destroy\\$\\{this\\.document\\.documentName\\}`, this\\)'));
			inOrder(destroy, ['`destroy${', 'this._destroy(options);'], 'Auras.destroyAuras reads token.tokenAuras in the hook.');
		});

		test('updateToken receives the changed data', () => {
			assert.match(src, hook('`update\\$\\{type\\}`, doc, change, options, userId\\)'));
		});

		test('refreshVisibility sets visible from isVisible', () => {
			includes(method(block('class PlaceableObject extends'), '_refreshVisibility() {'), 'this.visible = this.isVisible;',
				'Auras.refreshAuras copies token.visible.');
		});

		test('CanvasDocument exposes rendered and object', () => {
			const canvasDocument = block('function CanvasDocumentMixin(Base)');
			includes(canvasDocument, 'get rendered() {', 'Auras.onUpdateToken checks doc.rendered.');
			includes(canvasDocument, 'get object() {', 'Auras.onUpdateToken uses doc.object.');
		});
	});

	describe('Token placeable', () => {
		let token;
		before(() => {
			token = block(/class Token extends PlaceableObject \{/);
		});

		test('render flags propagate as the stub assumes', () => {
			includes(token, 'refresh: {propagate: ["refreshState", "refreshTransform", "refreshMesh", "refreshNameplate", "refreshElevation",',
				'ALL_FLAGS in the stub.');
			includes(token, 'refreshState: {propagate: ["refreshVisibility", "refreshTarget"]}', 'ALL_FLAGS in the stub.');
			includes(token, 'refreshTransform: {propagate: ["refreshPosition", "refreshRotation", "refreshSize"], alias: true}', 'ALL_FLAGS in the stub.');
			includes(token, 'refreshSize: {propagate: ["refreshPosition", "refreshShape",', 'SIZE_FLAGS in the stub; auras redraw on refreshSize.');
			includes(token, 'refreshShape: {propagate: ["refreshVisibility", "refreshPosition",', 'SIZE_FLAGS in the stub.');
		});

		test('refreshPosition moves the placeable to the document position', () => {
			const refresh = method(token, '_refreshPosition() {');
			includes(refresh, 'const {x, y} = this.document;', 'The stub Token#applyRenderFlags.');
			includes(refresh, 'this.position.set(x, y);', 'Auras.refreshAuras copies token.position.');
		});

		test('movement animation writes into the document and sets refresh flags', () => {
			includes(token, 'foundry.utils.mergeObject(this.document, this.#animationData, {insertKeys: false});',
				'Auras redraw from the animated document size.');
			const update = method(token, '_onAnimationUpdate(changed, context) {');
			includes(update, 'refreshPosition: positionChanged,', 'Auras follow the position during animation.');
			includes(update, 'refreshSize: sizeChanged', 'Auras follow the size during animation.');
		});

		test('hidden tokens are invisible to players and the config preview hides the original', () => {
			const isVisible = method(token, 'get isVisible() {');
			includes(isVisible, 'if ( this.isPreview ) return true;', 'The stub Token#isVisible.');
			includes(isVisible, 'if ( this._preview?._previewType === "config" ) return false;', 'Only the config preview shows auras.');
			includes(isVisible, 'if ( this.document.hidden && !gm ) return false;', 'The stub Token#isVisible.');
		});

		test('the token mesh uses the TOKENS sort layer', () => {
			includes(token, 'this.mesh.sortLayer = PrimaryCanvasGroup.SORT_LAYERS.TOKENS;', 'Auras use TOKENS - 1 to render below tokens.');
		});

		test('Canvas#grid is the BaseGrid of the viewed scene', () => {
			includes(method(block(/let [\w$]+ = class Canvas \{/), 'get grid() {'), 'return this.scene?.grid ?? null;', 'Auras.drawAuras reads canvas.grid.');
		});

		test('BaseGrid has the members Auras.drawAuras uses', () => {
			for ( const getter of ['get isSquare() {', 'get isHexagonal() {', 'get isGridless() {'] ) {
				includes(src, getter, 'makeGrid in the stub.');
			}
		});

		test('TokenDocument#getCenterPoint accepts a position', () => {
			const getCenterPoint = method(block(/class BaseToken extends/), 'getCenterPoint(data={}) {');
			includes(getCenterPoint, 'const x = data.x ?? this.x;', 'Auras.drawAuras passes {x: 0, y: 0}.');
			includes(getCenterPoint, 'const {width, height} = this.getSize(data);', 'The stub TokenDocument#getCenterPoint.');
		});
	});

	describe('primary canvas group', () => {
		test('PrimaryGraphics is a SmoothGraphics primary canvas object', () => {
			includes(src, 'class PrimaryGraphics extends PrimaryCanvasObjectMixin(PIXI.smooth.SmoothGraphics) {', 'The stub PrimaryGraphics.');
		});

		test('primary canvas objects must be direct children of canvas.primary', () => {
			const mixin = block('function PrimaryCanvasObjectMixin(DisplayObject)');
			includes(mixin, 'if ( parent === canvas.primary ) {', 'Auras add graphics to canvas.primary.');
			includes(mixin, 'PrimaryCanvasObject instances may only be direct children', 'The stub PrimaryGraphics#_onAdded.');
			includes(mixin, 'throw new Error("PrimaryCanvasObject#elevation must be a numeric value.");', 'The stub setters.');
			includes(mixin, 'throw new Error("PrimaryCanvasObject#sortLayer must be a numeric value.");', 'The stub setters.');
		});

		test('the sort layers are unchanged', () => {
			const group = block('class PrimaryCanvasGroup extends');
			includes(group, 'SCENE: 0,\n    TILES: 500,\n    DRAWINGS: 600,\n    TOKENS: 700,\n    WEATHER: 1000', 'SORT_LAYERS in the stub.');
		});

		test('Color parses hex strings and reports validity', () => {
			const color = block('class Color extends Number {');
			includes(color, 'if ( typeof color === "string" ) return this.fromString(color);', 'The stub Color.from.');
			includes(color, 'return new this(parseInt(color.startsWith("#") ? color.substring(1) : color, 16));', 'The stub Color.from.');
			includes(color, 'return Number.isInteger(v) && v >= 0 && v <= 0xFFFFFF;', 'The stub Color#valid.');
		});
	});

	describe('token configuration sheets', () => {
		let mixin;
		before(() => {
			mixin = block('function TokenApplicationMixin(Base) {');
		});

		test('both token sheets use TokenApplicationMixin', () => {
			includes(src, 'class TokenConfig extends TokenApplicationMixin(PlaceableConfig) {', 'The stub TokenConfig.');
			includes(src, 'class PrototypeTokenConfig extends TokenApplicationMixin(ApplicationV2) {', 'The stub PrototypeTokenConfig.');
			includes(src, 'prototypeSheetClass: PrototypeTokenConfig,', 'Auras.registerConfigTabs patches CONFIG.Token.prototypeSheetClass.');
		});

		test('the core PARTS end with the footer', () => {
			inOrder(mixin, [
				'static PARTS = {',
				'tabs: {template: "templates/generic/tab-navigation.hbs"},',
				'identity: {template: "templates/scene/token/identity.hbs", scrollable: [""]},',
				'resources: {template: "templates/scene/token/resources.hbs", scrollable: [""]},',
				'footer: {template: "templates/generic/form-footer.hbs"}\n    };'
			], 'TokenApplicationMixin PARTS in the stub.');
		});

		test('the tabs are in the sheet group', () => {
			inOrder(mixin, ['static TABS = {', 'sheet: {', 'tabs: [', '{id: "resources", icon: "fa-solid fa-heart"}', 'initial: "identity",', 'labelPrefix: "TOKEN.TABS"'],
				'TokenApplicationMixin TABS in the stub.');
		});

		test('a part that matches a tab gets the tab as context.tab', () => {
			const prepare = method(mixin, 'async _preparePartContext(partId, context, options) {');
			includes(prepare, 'const tab = context.tabs[partId];', 'The template reads tab.cssClass, tab.group and tab.id.');
			includes(prepare, 'context.tab = tab;', 'The template reads tab.cssClass, tab.group and tab.id.');
		});

		test('token getters return the preview first', () => {
			includes(method(block('class TokenConfig extends'), 'get token() {'), 'return this._preview ?? this.document;', 'Auras.onPreRenderConfig reads config.token.');
			includes(method(block('class PrototypeTokenConfig extends'), 'get token() {'), 'return this._preview ?? this.#prototype;', 'Auras.onPreRenderConfig reads config.token.');
		});

		test('the render context has gridUnits and rootId', () => {
			includes(block('class PlaceableConfig extends'), 'gridUnits: scene?.grid.units || _loc("MEASUREMENT.GridUnits"),', 'The distance input shows context.gridUnits.');
			const prototype = block('class PrototypeTokenConfig extends');
			includes(prototype, 'gridUnits: _loc("MEASUREMENT.GridUnits")', 'The distance input shows context.gridUnits.');
			includes(prototype, 'rootId: this.id,', 'The template passes @root.rootId to formGroup.');
			includes(block('class DocumentSheetV2 extends'), 'rootId: document.collection?.has(document.id) ? this.id : foundry.utils.randomID()', 'The template passes @root.rootId to formGroup.');
		});

		test('the config preview updates the preview document and refreshes it', () => {
			const preview = method(block('class PlaceableConfig extends'), '_previewChanges(changes) {');
			inOrder(preview, ['this._preview.updateSource(changes);', 'this._preview.object.renderFlags.set({refresh: true});'],
				'Aura changes show on the preview through refreshSize.');
		});

		test('sheet classes are registered with a cls property', () => {
			includes(src, 'if ( (override !== null) && (override in sheets) ) return sheets[override].cls;', 'Auras.registerConfigTabs reads CONFIG.Token.sheetClasses[type][id].cls.');
		});
	});

	describe('application rendering', () => {
		test('the preRender hook fires after the context is prepared and before the HTML is rendered', () => {
			const render = method(block(/class ApplicationV2 extends/), 'async #render(options) {');
			inOrder(render, [
				'this._configureRenderOptions(options);',
				'const context = await this._prepareContext(options);',
				'const handlerArgs = [context, options];',
				'hookName: "preRender"',
				'const result = await this._renderHTML(context, options);'
			], 'Auras.onPreRenderConfig adds context.tokenAuras in preRenderTokenConfig.');
		});

		test('hooks fire for every class in the inheritance chain', () => {
			const application = block(/class ApplicationV2 extends/);
			includes(method(application, '#callHooks(hookName, hookArgs, parentClassHooks) {'), 'for ( const cls of this.constructor.inheritanceChain() ) {',
				'System subclasses of TokenConfig still fire preRenderTokenConfig.');
			includes(method(application, 'static *inheritanceChain() {'), 'if ( cls === this.BASE_APPLICATION ) return;', 'The stub inheritanceChain.');
		});

		test('prepared tabs keep a custom label', () => {
			includes(method(block(/class ApplicationV2 extends/), '_prepareTabs(group) {'), 'if ( labelPrefix ) tab.label ??= `${labelPrefix}.${id}`;',
				'The Auras tab uses the label AURAS.Auras.');
		});

		test('parts render in PARTS insertion order, read at render time', () => {
			const handlebars = block('function HandlebarsApplicationMixin(BaseApplication) {');
			includes(handlebars, 'const parts = foundry.utils.deepClone(this.constructor.PARTS);', 'Auras.registerConfigTab re-adds the footer after its part.');
			includes(handlebars, 'options.parts ??= Object.keys(this.#partDescriptors);', 'Auras.registerConfigTab re-adds the footer after its part.');
		});
	});

	describe('form fields', () => {
		test('formGroup is a registered Handlebars helper that calls DataField#toFormGroup', () => {
			includes(src, 'formGroup,\n    formField: formGroup, // Alias', 'The template uses {{formGroup}}.');
			includes(block('function formGroup(field, options) {'), 'const group = field.toFormGroup(groupConfig, inputConfig);', 'The stub formGroup helper.');
		});

		test('fields render the inputs the sheet expects', () => {
			includes(method(block('class ColorField extends StringField'), '_toInput(config) {'), 'HTMLColorPickerElement.create(config)', 'Colour uses <color-picker>.');
			includes(method(block('class NumberField extends DataField'), '_toInput(config) {'), 'if ( ["min", "max", "step"].every(k => config[k] !== undefined) && (config.type !== "number") ) {',
				'Opacity becomes a range slider because it passes step.');
			includes(block('class AlphaField extends NumberField'), 'min: 0,\n      max: 1,', 'Opacity is limited to 0 to 1.');
		});

		test('form groups localize the label and show units', () => {
			const createFormGroup = block('function createFormGroup(config) {');
			includes(createFormGroup, 'lbl.innerText = localize ? _loc(label) : label;', 'The template passes localize=true.');
			includes(createFormGroup, 'if ( units ) lbl.insertAdjacentHTML("beforeend", ` <span class="units">(${_loc(units)})</span>`);', 'The distance passes units.');
		});
	});

	describe('documents and permissions', () => {
		test('ownership levels are unchanged', () => {
			const levels = block('const DOCUMENT_OWNERSHIP_LEVELS = Object.freeze({');
			for ( const [key, value] of [['NONE', 0], ['LIMITED', 1], ['OBSERVER', 2], ['OWNER', 3]] ) {
				includes(levels, `${key}: ${value}`, 'OWNERSHIP in the stub.');
			}
		});

		test('testUserPermission accepts level names', () => {
			const permission = method(src, 'testUserPermission(user, permission, {exact=false}={}) {');
			includes(permission, 'if ( user.isGM ) level = perms.OWNER;', 'The stub Actor#testUserPermission.');
			includes(permission, 'const target = (typeof permission === "string") ? (perms[permission] ?? perms.OWNER) : permission;',
				'Auras pass LIMITED, OBSERVER or OWNER.');
		});

		test('getFlag works on documents and prototype tokens', () => {
			includes(method(src, 'getFlag(scope, key) {'), 'if ( !scopes.includes(scope) ) throw new Error', 'The stub getFlag.');
			includes(block('class PrototypeToken extends DataModel'), 'return foundry.abstract.Document.prototype.getFlag.call(this, ...args);',
				'The prototype token sheet reads the flags with getFlag.');
		});
	});

	describe('namespaces', () => {
		const paths = {
			PrimaryGraphics: 'canvas.primary.PrimaryGraphics',
			PrimaryCanvasGroup: 'canvas.groups.PrimaryCanvasGroup',
			TokenConfig: 'applications.sheets.TokenConfig'
		};
		for ( const [name, namespace] of Object.entries(paths) ) {
			test(`${name} lives at foundry.${namespace}`, () => {
				includes(src, `${name}: "${namespace}",`, `main.js uses foundry.${namespace}.`);
			});
		}

		test('the data fields are in foundry.data.fields', () => {
			includes(src, 'fields: _module$', 'main.js uses foundry.data.fields.');
			for ( const field of ['StringField', 'ColorField', 'AlphaField', 'NumberField', 'BooleanField'] ) {
				includes(src, `  ${field}: ${field},`, `main.js uses foundry.data.fields.${field}.`);
			}
		});
	});

	describe('core translations', () => {
		const keys = ['OWNERSHIP.LIMITED', 'OWNERSHIP.OBSERVER', 'OWNERSHIP.OWNER', 'USER.RoleGamemaster', 'MEASUREMENT.Distance',
			'SCENE.GridSquare', 'MEASUREMENT.GridUnits'];
		for ( const key of keys ) {
			test(`${key} exists`, () => {
				const value = key.split('.').reduce((obj, k) => obj?.[k], lang) ?? lang[key];
				assert.equal(typeof value, 'string', `${key} is used by main.js`);
			});
		}
	});

	describe('bundled libraries', () => {
		test('PIXI is version 7', async () => {
			const pixi = await readFile(path.join(publicDir, 'scripts', 'pixi.min.js'), 'utf8');
			assert.match(pixi.slice(0, 200), /pixi\.js - v7\./, 'beginFill, drawEllipse and drawRect are PIXI 7 APIs.');
		});

		test('SmoothGraphics provides the drawing methods', async () => {
			const smooth = await readFile(path.join(publicDir, 'scripts', 'pixi-graphics-smooth.js'), 'utf8');
			for ( const name of ['beginFill(', 'drawEllipse(', 'drawRect(', 'endFill('] ) includes(smooth, name, 'Auras.drawAuras draws with these methods.');
		});

		test('Handlebars matches the version used by the tests', async () => {
			const handlebars = await readFile(path.join(publicDir, 'scripts', 'handlebars.min.js'), 'utf8');
			const version = handlebars.slice(0, 300).match(/handlebars v(\d+\.\d+\.\d+)/)?.[1];
			const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
			assert.equal(pkg.devDependencies.handlebars, version, 'Pin the handlebars devDependency to the Foundry version.');
		});
	});
});
