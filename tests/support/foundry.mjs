// A small stand-in for the parts of the Foundry VTT v14 client API that Token Auras uses.
// Each stub mirrors the behaviour of the real v14 code. tests/contract/foundry-v14.test.mjs checks
// these assumptions against a real Foundry installation, so keep both files in sync.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MODULE_ID = 'token-auras';

/* -------------------------------------------- */
/*  Constants and utilities                     */
/* -------------------------------------------- */

// CONST.DOCUMENT_OWNERSHIP_LEVELS
export const OWNERSHIP = Object.freeze({NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3});

// foundry.canvas.groups.PrimaryCanvasGroup.SORT_LAYERS
export const SORT_LAYERS = Object.freeze({SCENE: 0, TILES: 500, DRAWINGS: 600, TOKENS: 700, WEATHER: 1000});

// foundry.utils.getProperty
export function getProperty(object, key) {
	return key.split('.').reduce((obj, k) => obj?.[k], object);
}

// foundry.utils.expandObject
export function expandObject(flat) {
	const expanded = {};
	for ( const [key, value] of Object.entries(flat) ) {
		const parts = key.split('.');
		let target = expanded;
		for ( const part of parts.slice(0, -1) ) target = target[part] ??= {};
		target[parts.at(-1)] = value;
	}
	return expanded;
}

// foundry.utils.Color: a Number subclass. Color.from() parses hex strings with or without #.
export class Color extends Number {
	static from(color) {
		if ( (color === null) || (color === undefined) ) return new this(NaN);
		if ( typeof color === 'string' ) return new this(parseInt(color.startsWith('#') ? color.substring(1) : color, 16));
		if ( color instanceof Color ) return color;
		return new this(color);
	}

	get valid() {
		const v = this.valueOf();
		return Number.isInteger(v) && (v >= 0) && (v <= 0xFFFFFF);
	}
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

// foundry.helpers.Hooks. Unlike the real class, errors in hooked functions are not swallowed,
// so a failing module hook fails the test.
export class Hooks {
	static events = {};

	static on(hook, fn, {once = false} = {}) {
		(Hooks.events[hook] ??= []).push({fn, once});
	}

	static once(hook, fn) {
		Hooks.on(hook, fn, {once: true});
	}

	static callAll(hook, ...args) {
		for ( const entry of [...(Hooks.events[hook] ?? [])] ) {
			if ( entry.once ) Hooks.events[hook].splice(Hooks.events[hook].indexOf(entry), 1);
			entry.fn(...args);
		}
		return true;
	}

	static registered() {
		return Object.keys(Hooks.events).filter(hook => Hooks.events[hook].length);
	}
}

/* -------------------------------------------- */
/*  Data fields and form helpers                */
/* -------------------------------------------- */

class DataField {
	static _defaults = {required: false, nullable: false, initial: undefined};

	constructor(options = {}) {
		Object.assign(this, this.constructor._defaults, options);
	}
}

class StringField extends DataField {
	static _defaults = {...DataField._defaults, blank: true, choices: undefined};
}

class ColorField extends StringField {
	static _defaults = {...StringField._defaults, nullable: true, initial: null, blank: false};
}

class NumberField extends DataField {
	static _defaults = {...DataField._defaults, nullable: true, initial: null, min: undefined, max: undefined, step: undefined};
}

class AlphaField extends NumberField {
	static _defaults = {...NumberField._defaults, required: true, nullable: false, initial: 1, min: 0, max: 1};
}

class BooleanField extends DataField {
	static _defaults = {...DataField._defaults, required: true, initial: false};
}

/**
 * Records every {{formGroup}} call. The real helper calls DataField#toFormGroup(groupConfig, inputConfig).
 * @type {{field: DataField, hash: object}[]}
 */
export const formGroupCalls = [];

Handlebars.registerHelper('formGroup', (field, options) => {
	if ( !(field instanceof DataField) ) throw new Error('{{formGroup}} needs a DataField');
	formGroupCalls.push({field, hash: {...options.hash}});
	const name = Handlebars.escapeExpression(options.hash.name);
	return new Handlebars.SafeString(`<div class="form-group" data-name="${name}"></div>`);
});

/* -------------------------------------------- */
/*  Applications                                */
/* -------------------------------------------- */

class ApplicationV2 {
	static BASE_APPLICATION = ApplicationV2;
	static PARTS = {};
	static TABS = {};

	// ApplicationV2.inheritanceChain: hooks fire for every class up to BASE_APPLICATION.
	static *inheritanceChain() {
		let cls = this;
		while ( cls ) {
			yield cls;
			if ( cls === this.BASE_APPLICATION ) return;
			cls = Object.getPrototypeOf(cls);
		}
	}

	constructor(options = {}) {
		this.options = options;
		this.id = options.id ?? `${this.constructor.name}-app`;
		this.tabGroups = {};
	}

	// ApplicationV2#_prepareTabs
	_prepareTabs(group) {
		const {tabs, labelPrefix, initial = null} = this.constructor.TABS[group] ?? {tabs: []};
		this.tabGroups[group] ??= initial;
		return tabs.reduce((prepared, {id, cssClass, ...tabConfig}) => {
			const active = this.tabGroups[group] === id;
			if ( active ) cssClass = [cssClass, 'active'].filter(Boolean).join(' ');
			const tab = {group, id, active, cssClass, ...tabConfig};
			if ( labelPrefix ) tab.label ??= `${labelPrefix}.${id}`;
			prepared[id] = tab;
			return prepared;
		}, {});
	}

	// ApplicationV2#_prepareContext: a single tab group is prepared automatically.
	async _prepareContext() {
		const groups = Object.keys(this.constructor.TABS);
		return groups.length === 1 ? {tabs: this._prepareTabs(groups[0])} : {};
	}
}

class DocumentSheetV2 extends ApplicationV2 {
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		return Object.assign(context, {document: this.document, source: this.document, rootId: this.id});
	}
}

function HandlebarsApplicationMixin(Base) {
	return class HandlebarsApplication extends Base {
		static PARTS = {};
	};
}

// The PARTS and TABS of foundry.applications.sheets.TokenApplicationMixin in v14.
function TokenApplicationMixin(Base) {
	return class TokenApplication extends HandlebarsApplicationMixin(Base) {
		static PARTS = {
			tabs: {template: 'templates/generic/tab-navigation.hbs'},
			identity: {template: 'templates/scene/token/identity.hbs', scrollable: ['']},
			appearance: {template: 'templates/scene/token/appearance.hbs', scrollable: ['']},
			vision: {template: 'templates/scene/token/vision.hbs', scrollable: ['']},
			light: {template: 'templates/scene/token/light.hbs', scrollable: ['']},
			resources: {template: 'templates/scene/token/resources.hbs', scrollable: ['']},
			footer: {template: 'templates/generic/form-footer.hbs'}
		};

		static TABS = {
			sheet: {
				tabs: [
					{id: 'identity', icon: 'fa-solid fa-memo-pad'},
					{id: 'appearance', icon: 'fa-solid fa-square-user'},
					{id: 'vision', icon: 'fa-solid fa-eye'},
					{id: 'light', icon: 'fa-solid fa-lightbulb'},
					{id: 'resources', icon: 'fa-solid fa-heart'}
				],
				initial: 'identity',
				labelPrefix: 'TOKEN.TABS'
			}
		};

		_preview = null;
	};
}

class PlaceableConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		return Object.assign(context, {gridUnits: this.document.parent?.grid.units || 'Grid Units'});
	}
}

export class TokenConfig extends TokenApplicationMixin(PlaceableConfig) {
	get document() {
		return this.options.document;
	}

	get token() {
		return this._preview ?? this.document;
	}
}

export class PrototypeTokenConfig extends TokenApplicationMixin(ApplicationV2) {
	get token() {
		return this._preview ?? this.options.prototype;
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		return Object.assign(context, {document: this.token, rootId: this.id, gridUnits: 'Grid Units'});
	}
}

const templateCache = new Map();

async function getTemplate(templatePath) {
	const prefix = `modules/${MODULE_ID}/`;
	if ( !templatePath.startsWith(prefix) ) return null;
	if ( !templateCache.has(templatePath) ) {
		const source = await readFile(path.join(ROOT, templatePath.slice(prefix.length)), 'utf8');
		templateCache.set(templatePath, Handlebars.compile(source));
	}
	return templateCache.get(templatePath);
}

/**
 * Render a token config sheet the way ApplicationV2#render, HandlebarsApplicationMixin and TokenApplicationMixin do.
 * Only module templates are rendered; core parts are placeholders.
 * @returns {Promise<{parts: string[], context: object, html: Record<string, string>}>}
 */
export async function renderSheet(app, options = {}) {
	const cls = app.constructor;

	// HandlebarsApplicationMixin#_configureRenderOptions: parts render in PARTS insertion order.
	const descriptors = structuredClone(cls.PARTS);
	options.parts ??= Object.keys(descriptors);

	const context = await app._prepareContext(options);
	for ( const c of cls.inheritanceChain() ) Hooks.callAll(`preRender${c.name}`, app, context, options);

	const html = {};
	for ( const partId of options.parts ) {
		// HandlebarsApplicationMixin#_preparePartContext and TokenApplicationMixin#_preparePartContext
		context.partId = `${app.id}-${partId}`;
		if ( (partId !== 'footer') && context.tabs[partId] ) context.tab = context.tabs[partId];
		const template = await getTemplate(descriptors[partId].template);
		html[partId] = template ? template(context) : `<div data-application-part="${partId}"></div>`;
	}
	return {parts: options.parts, context, html};
}

/* -------------------------------------------- */
/*  Documents                                   */
/* -------------------------------------------- */

export class Actor {
	constructor({ownership = {default: OWNERSHIP.NONE}} = {}) {
		this.ownership = ownership;
	}

	// Document#testUserPermission
	testUserPermission(user, permission, {exact = false} = {}) {
		const level = user.isGM ? OWNERSHIP.OWNER : (this.ownership[user.id] ?? this.ownership.default);
		const target = (typeof permission === 'string') ? (OWNERSHIP[permission] ?? OWNERSHIP.OWNER) : permission;
		return exact ? level === target : level >= target;
	}
}

// Document#getFlag: throws for scopes of inactive packages.
function getFlag(scope, key) {
	if ( !['core', 'world', MODULE_ID].includes(scope) ) throw new Error(`Flag scope "${scope}" is not valid or not currently active`);
	if ( !this.flags || !(scope in this.flags) ) return undefined;
	return getProperty(this.flags[scope], key);
}

export class PrototypeToken {
	constructor({flags = {}} = {}) {
		this.flags = flags;
	}

	getFlag(scope, key) {
		return getFlag.call(this, scope, key);
	}
}

export class TokenDocument {
	constructor(data = {}, {scene} = {}) {
		Object.assign(this, {
			x: 0, y: 0, width: 1, height: 1, elevation: 0, sort: 0, hidden: false, shape: 0,
			flags: {}, actor: null
		}, data);
		this.parent = scene;
		this._object = null;
	}

	getFlag(scope, key) {
		return getFlag.call(this, scope, key);
	}

	get documentName() {
		return 'Token';
	}

	get object() {
		return this._object;
	}

	get rendered() {
		return this._object?.destroyed === false;
	}

	// BaseToken#getSize for square and gridless grids
	getSize({width = this.width, height = this.height} = {}) {
		const grid = this.parent.grid;
		return {width: width * grid.sizeX, height: height * grid.sizeY};
	}

	// BaseToken#getCenterPoint for rectangular shapes. Hexagonal token shapes use the shape centre in v14.
	getCenterPoint(data = {}) {
		const x = data.x ?? this.x;
		const y = data.y ?? this.y;
		const {width, height} = this.getSize(data);
		return {x: x + (width / 2), y: y + (height / 2), elevation: data.elevation ?? this.elevation};
	}

	clone() {
		const {parent, actor, _object, ...data} = this;
		const clone = new TokenDocument(structuredClone(data), {scene: parent});
		clone.actor = actor;
		return clone;
	}

	/**
	 * Apply an update like ClientDocument#_onUpdate: the updateToken hook fires, then the Token applies the render
	 * flags which Token#_onUpdate set.
	 */
	update(changed, {userId = globalThis.game.user.id} = {}) {
		for ( const [key, value] of Object.entries(changed) ) {
			if ( key === 'flags' ) this.flags = {...this.flags, ...structuredClone(value)};
			else this[key] = value;
		}
		Hooks.callAll('updateToken', this, changed, {}, userId);
		if ( !this.rendered ) return;
		const flags = {};
		if ( ('x' in changed) || ('y' in changed) ) flags.refreshPosition = true;
		if ( ('width' in changed) || ('height' in changed) ) Object.assign(flags, SIZE_FLAGS);
		if ( 'elevation' in changed ) flags.refreshElevation = true;
		if ( 'hidden' in changed ) Object.assign(flags, {refreshState: true, refreshVisibility: true});
		if ( Object.keys(flags).length ) this._object.applyRenderFlags(flags);
	}
}

/* -------------------------------------------- */
/*  Canvas                                      */
/* -------------------------------------------- */

// Flags set by Token RENDER_FLAGS propagation.
export const SIZE_FLAGS = Object.freeze({
	refreshSize: true, refreshPosition: true, refreshShape: true, refreshVisibility: true, refreshBorder: true,
	refreshBars: true, refreshEffects: true, refreshNameplate: true, refreshTarget: true, refreshTooltip: true
});

export const ALL_FLAGS = Object.freeze({
	...SIZE_FLAGS, refreshState: true, refreshRotation: true, refreshElevation: true, refreshMesh: true,
	refreshShader: true, refreshRingVisuals: true, refreshRuler: true, refreshTurnMarker: true
});

function assertNumber(name, value) {
	if ( (typeof value !== 'number') || Number.isNaN(value) ) throw new Error(`PrimaryCanvasObject#${name} must be a numeric value.`);
}

// foundry.canvas.primary.PrimaryGraphics: a PIXI.smooth.SmoothGraphics with PrimaryCanvasObjectMixin.
export class PrimaryGraphics {
	constructor(options = {}) {
		this.name = options.name ?? null;
		this.object = options.object ?? null;
		this.parent = null;
		this.destroyed = false;
		this.visible = true;
		this.alpha = 1;
		this.commands = [];
		this.clearCount = 0;
		this.position = {x: 0, y: 0, set: (x, y) => Object.assign(this.position, {x, y})};
	}

	#elevation = 0;
	#sort = 0;
	#sortLayer = 0;

	get elevation() { return this.#elevation; }
	set elevation(value) { assertNumber('elevation', value); this.#elevation = value; }

	get sort() { return this.#sort; }
	set sort(value) { assertNumber('sort', value); this.#sort = value; }

	get sortLayer() { return this.#sortLayer; }
	set sortLayer(value) { assertNumber('sortLayer', value); this.#sortLayer = value; }

	// PrimaryCanvasObject#_onAdded: only canvas.primary or a PrimaryCanvasContainer may be the parent.
	_onAdded(parent) {
		if ( parent !== globalThis.canvas.primary ) {
			throw new Error('PrimaryCanvasObject instances may only be direct children of the PrimaryCanvasGroup or a PrimaryCanvasContainer');
		}
	}

	clear() {
		this.commands = [];
		this.clearCount++;
		return this;
	}

	beginFill(color = 0, alpha = 1) {
		this.commands.push({type: 'beginFill', color: Number(color), alpha});
		return this;
	}

	drawEllipse(x, y, halfWidth, halfHeight) {
		this.commands.push({type: 'ellipse', x, y, halfWidth, halfHeight});
		return this;
	}

	drawRect(x, y, width, height) {
		this.commands.push({type: 'rect', x, y, width, height});
		return this;
	}

	endFill() {
		this.commands.push({type: 'endFill'});
		return this;
	}

	// PIXI.DisplayObject#destroy fails on a second call, so a double destroy is an error here.
	destroy() {
		if ( this.destroyed ) throw new Error('PrimaryGraphics destroyed twice');
		this.parent?.removeChild(this);
		this.destroyed = true;
	}
}

class PrimaryCanvasGroup {
	children = [];

	addChild(child) {
		child._onAdded?.(this);
		child.parent = this;
		this.children.push(child);
		return child;
	}

	removeChild(child) {
		this.children.splice(this.children.indexOf(child), 1);
		child.parent = null;
		return child;
	}
}

/**
 * foundry.canvas.placeables.Token, reduced to the draw, refresh and destroy workflow of PlaceableObject.
 * Set `seen` to simulate whether the user's vision reveals the token.
 */
export class Token {
	constructor(document, {previewType = null} = {}) {
		this.document = document;
		this._previewType = previewType;
		this.destroyed = false;
		this.visible = false;
		this.alpha = 1;
		this.seen = true;
		this.position = {x: 0, y: 0, set: (x, y) => Object.assign(this.position, {x, y})};
		if ( !previewType ) document._object = this;
	}

	get isPreview() {
		return this._previewType !== null;
	}

	get objectId() {
		return `Token.${this.document.id}${this.isPreview ? '.preview' : ''}`;
	}

	// Token#isVisible without detection modes
	get isVisible() {
		if ( this.isPreview ) return true;
		if ( this.document.hidden && !globalThis.game.user.isGM ) return false;
		return this.seen;
	}

	// PlaceableObject#draw: visible is false while drawing, the draw hook fires, then all refresh flags apply.
	draw() {
		const wasVisible = this.visible;
		this.visible = false;
		Hooks.callAll('drawToken', this);
		this.visible = wasVisible;
		this.applyRenderFlags(ALL_FLAGS);
		return this;
	}

	// PlaceableObject#applyRenderFlags: the refresh hook receives the applied flags.
	applyRenderFlags(flags) {
		if ( flags.refreshVisibility ) this.visible = this.isVisible;
		if ( flags.refreshPosition ) this.position.set(this.document.x, this.document.y);
		Hooks.callAll('refreshToken', this, flags);
	}

	// PlaceableObject#destroy: the destroy hook fires before the object is torn down.
	destroy() {
		Hooks.callAll('destroyToken', this);
		if ( this.document._object === this ) this.document._object = null;
		this.destroyed = true;
	}

	clone() {
		return new Token(this.document.clone(), {previewType: 'dragging'});
	}
}

export function makeGrid(type = 'square', {size = 100, distance = 5, units = 'ft'} = {}) {
	const hex = type === 'hex';
	return {
		type, size, distance, units,
		sizeX: hex ? size * Math.sqrt(3) / 2 : size,
		sizeY: size,
		isSquare: type === 'square',
		isHexagonal: hex,
		isGridless: type === 'gridless'
	};
}

/* -------------------------------------------- */
/*  Environment                                 */
/* -------------------------------------------- */

export const users = {
	gm: {id: 'gm', isGM: true},
	player: {id: 'player', isGM: false}
};

/**
 * Install the Foundry globals, import main.js once, and run the init and ready hooks.
 * @returns {Promise<object>} The module's Auras object
 */
export async function loadModule() {
	const moduleData = {id: MODULE_ID, active: true};
	Object.assign(globalThis, {
		Hooks,
		CONST: {DOCUMENT_OWNERSHIP_LEVELS: OWNERSHIP},
		CONFIG: {Token: {sheetClasses: {base: {core: {cls: TokenConfig}}}, prototypeSheetClass: PrototypeTokenConfig}},
		foundry: {
			utils: {Color, getProperty, expandObject},
			data: {fields: {StringField, ColorField, NumberField, AlphaField, BooleanField}},
			applications: {sheets: {TokenConfig, PrototypeTokenConfig}},
			canvas: {primary: {PrimaryGraphics}, groups: {PrimaryCanvasGroup: {SORT_LAYERS}}}
		},
		game: {
			user: users.gm,
			modules: new Map([[MODULE_ID, moduleData]]),
			i18n: {
				localize: key => key,
				format: (key, data) => `${key}${JSON.stringify(data)}`
			}
		}
	});
	resetCanvas();
	await import(new URL('../../main.js', import.meta.url));
	Hooks.callAll('init');
	Hooks.callAll('ready');
	return globalThis.Auras;
}

export function resetCanvas({grid = 'square', user = 'gm'} = {}) {
	const scene = {grid: typeof grid === 'string' ? makeGrid(grid) : grid};
	globalThis.game.user = users[user];
	globalThis.canvas = {scene, grid: scene.grid, primary: new PrimaryCanvasGroup()};
	formGroupCalls.length = 0;
	return globalThis.canvas;
}

let nextId = 1;

/** Create a TokenDocument in the viewed scene and draw its Token, like TokenLayer#createObject. */
export function createToken(data = {}, {draw = true} = {}) {
	const doc = new TokenDocument({id: `token${nextId++}`, ...data}, {scene: globalThis.canvas.scene});
	const token = new Token(doc);
	if ( draw ) token.draw();
	return token;
}

export function auraFlags(auras) {
	return {[MODULE_ID]: auras};
}
