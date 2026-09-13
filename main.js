const Auras = {
	MODULE_ID: 'token-auras-revitalized',
	// The id of the original Token Auras module. Its flag data is imported once.
	LEGACY_ID: 'token-auras',
	AURA_KEYS: ['aura1', 'aura2', 'auras'],
	PERMISSIONS: ['all', 'limited', 'observer', 'owner', 'gm'],
	TAB_ID: 'tokenAuras',
	TEMPLATE: 'modules/token-auras-revitalized/templates/token-config.hbs',

	getAllAuras: function (doc) {
		return Auras.getManualAuras(doc).concat(doc.getFlag(Auras.MODULE_ID, 'auras') || []);
	},

	getManualAuras: function (doc) {
		let aura1 = doc.getFlag(Auras.MODULE_ID, 'aura1');
		let aura2 = doc.getFlag(Auras.MODULE_ID, 'aura2');
		return [aura1 || Auras.newAura(), aura2 || Auras.newAura()];
	},

	newAura: function () {
		return {
			distance: null,
			colour: '#ffffff',
			opacity: .5,
			square: false,
			permission: 'all',
			edge: false,
			edgeColour: '#000000',
			edgeWidth: 1,
			uuid: Auras.uuid()
		};
	},

	uuid: function () {
		return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11)
			.replace(/[018]/g, c =>
				(c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
	},

	/* -------------------------------------------- */
	/*  Token Configuration                         */
	/* -------------------------------------------- */

	registerConfigTabs: function () {
		for ( const sheets of Object.values(CONFIG.Token.sheetClasses) ) {
			for ( const { cls } of Object.values(sheets) ) Auras.registerConfigTab(cls);
		}
		Auras.registerConfigTab(CONFIG.Token.prototypeSheetClass);
	},

	registerConfigTab: function (cls) {
		const parts = cls?.PARTS;
		const tabs = cls?.TABS?.sheet?.tabs;
		if ( !parts || !Array.isArray(tabs) ) return;

		if ( !tabs.some(tab => tab.id === Auras.TAB_ID) ) {
			tabs.push({id: Auras.TAB_ID, icon: 'fa-regular fa-circle-dot', label: 'AURAS.Auras'});
		}

		// Parts render in insertion order, so the footer has to be re-added after the new part.
		if ( !(Auras.TAB_ID in parts) ) {
			const footer = parts.footer;
			delete parts.footer;
			parts[Auras.TAB_ID] = {template: Auras.TEMPLATE, scrollable: ['']};
			if ( footer ) parts.footer = footer;
		}
	},

	getConfigFields: function () {
		const fields = foundry.data.fields;
		return Auras._configFields ??= {
			permission: new fields.StringField({
				required: true, blank: false, initial: 'all', label: 'AURAS.ShowTo',
				choices: Auras.getPermissionChoices
			}),
			colour: new fields.ColorField({
				required: true, nullable: false, initial: '#ffffff', label: 'AURAS.AuraColour'
			}),
			opacity: new fields.AlphaField({initial: .5, label: 'AURAS.Opacity'}),
			distance: new fields.NumberField({min: 0, nullable: true, initial: null, label: 'MEASUREMENT.Distance'}),
			square: new fields.BooleanField({label: 'SCENE.GridSquare'}),
			edge: new fields.BooleanField({label: 'AURAS.DisplayEdge'}),
			edgeColour: new fields.ColorField({
				nullable: true, initial: '#000000', placeholder: '#000000', label: 'AURAS.EdgeColour'
			}),
			edgeWidth: new fields.NumberField({min: 1, nullable: true, initial: 1, placeholder: '1', label: 'AURAS.EdgeWidth'})
		};
	},

	getPermissionChoices: function () {
		return Object.fromEntries(Auras.PERMISSIONS.map(perm => {
			let i18n = `OWNERSHIP.${perm.toUpperCase()}`;
			if ( perm === 'all' ) i18n = 'AURAS.All';
			if ( perm === 'gm' ) i18n = 'USER.RoleGamemaster';
			return [perm, i18n];
		}));
	},

	onPreRenderConfig: function (config, context) {
		if ( !(Auras.TAB_ID in config.constructor.PARTS) ) return;
		const fields = Auras.getConfigFields();
		context.tokenAuras = Auras.getManualAuras(config.token).map((aura, idx) => {
			const prefix = `flags.${Auras.MODULE_ID}.aura${idx + 1}`;
			return {
				legend: game.i18n.format('AURAS.AuraN', {number: idx + 1}),
				uuid: {name: `${prefix}.uuid`, value: aura.uuid || Auras.uuid()},
				inputs: [
					{field: fields.permission, name: `${prefix}.permission`, value: aura.permission},
					{field: fields.colour, name: `${prefix}.colour`, value: aura.colour},
					{field: fields.opacity, name: `${prefix}.opacity`, value: aura.opacity, step: .01},
					{field: fields.distance, name: `${prefix}.distance`, value: aura.distance, units: context.gridUnits},
					{field: fields.square, name: `${prefix}.square`, value: aura.square},
					{field: fields.edge, name: `${prefix}.edge`, value: aura.edge},
					{field: fields.edgeColour, name: `${prefix}.edgeColour`, value: aura.edgeColour},
					{field: fields.edgeWidth, name: `${prefix}.edgeWidth`, value: aura.edgeWidth}
				]
			};
		});
	},

	/* -------------------------------------------- */
	/*  Canvas Rendering                            */
	/* -------------------------------------------- */

	getVisibleAuras: function (doc) {
		return Auras.getAllAuras(doc).filter(a => {
			if ( !a.distance || (a.permission === 'gm' && !game.user.isGM) ) return false;
			if ( !a.permission || a.permission === 'all' || (a.permission === 'gm' && game.user.isGM) ) return true;
			return !!doc.actor?.testUserPermission(game.user, a.permission.toUpperCase());
		});
	},

	onRefreshToken: function (token, flags) {
		// Token size is animated, so the aura shape has to follow it frame by frame.
		if ( flags.refreshSize || flags.refreshShape ) Auras.drawAuras(token);
		else Auras.refreshAuras(token);
	},

	onUpdateToken: function (doc, changed) {
		if ( !doc.rendered ) return;
		const aurasUpdated = Object.keys(changed.flags ?? {}).includes(Auras.MODULE_ID);
		if ( aurasUpdated || ('hidden' in changed) ) Auras.drawAuras(doc.object);
	},

	drawAuras: function (token) {
		const doc = token.document;
		const auras = (doc.hidden && !game.user.isGM) ? [] : Auras.getVisibleAuras(doc);
		if ( !auras.length ) {
			Auras.destroyAuras(token);
			return;
		}

		if ( !token.tokenAuras || token.tokenAuras.destroyed ) {
			const { PrimaryGraphics } = foundry.canvas.primary;
			const { SORT_LAYERS } = foundry.canvas.groups.PrimaryCanvasGroup;
			token.tokenAuras = canvas.primary.addChild(new PrimaryGraphics({object: token}));
			token.tokenAuras.sortLayer = SORT_LAYERS.TOKENS - 1;
		}

		const gfx = token.tokenAuras;
		const grid = canvas.grid;
		const unit = grid.size / grid.distance;
		const { x: cx, y: cy } = doc.getCenterPoint({x: 0, y: 0});
		const { width, height } = doc;
		gfx.clear();

		auras.forEach(aura => {
			let w, h;

			if ( aura.square ) {
				w = aura.distance * 2 + (width * grid.distance);
				h = aura.distance * 2 + (height * grid.distance);
			} else {
				[w, h] = [aura.distance, aura.distance];

				if ( grid.isSquare ) {
					w += width * grid.distance / 2;
					h += height * grid.distance / 2;
				} else {
					w += (width - 1) * grid.distance / 2;
					h += (height - 1) * grid.distance / 2;
				}
			}

			w *= unit;
			h *= unit;
			const colour = foundry.utils.Color.from(aura.colour);
			Auras.setEdgeStyle(gfx, aura);
			gfx.beginFill(colour.valid ? colour : 0xffffff, aura.opacity);

			if ( aura.square ) {
				const [x, y] = [cx - w / 2, cy - h / 2];
				gfx.drawRect(x, y, w, h);
			} else {
				gfx.drawEllipse(cx, cy, w, h);
			}

			gfx.endFill();
		});

		Auras.refreshAuras(token);
	},

	setEdgeStyle: function (gfx, aura) {
		if ( !aura.edge ) {
			gfx.lineStyle(0);
			return;
		}

		// Empty inputs fall back to a black edge that is 1 pixel wide.
		const colour = foundry.utils.Color.from(aura.edgeColour);
		const width = Number(aura.edgeWidth);
		gfx.lineStyle(width > 0 ? width : 1, colour.valid ? colour : 0x000000, 1);
	},

	refreshAuras: function (token) {
		const gfx = token.tokenAuras;
		if ( !gfx || gfx.destroyed ) return;
		const doc = token.document;
		gfx.position.set(token.position.x, token.position.y);
		gfx.elevation = doc.elevation;
		gfx.sort = doc.sort;
		gfx.alpha = token.alpha;
		gfx.visible = token.visible && !(doc.hidden && !game.user.isGM);
	},

	destroyAuras: function (token) {
		if ( token.tokenAuras?.destroyed === false ) token.tokenAuras.destroy();
		token.tokenAuras = null;
	},

	/* -------------------------------------------- */
	/*  Import from Token Auras                     */
	/* -------------------------------------------- */

	hasAuraData: function (data) {
		return !!data && Auras.AURA_KEYS.some(key => key in data);
	},

	/**
	 * Get the flag data that imports the Token Auras data of a document, or null if there is nothing to import.
	 * The original module is usually not active, so its flags are read directly instead of with getFlag.
	 * The `imported` flag makes sure that the data is imported only once.
	 */
	getLegacyImport: function (flags) {
		const legacy = flags?.[Auras.LEGACY_ID];
		const current = flags?.[Auras.MODULE_ID];
		if ( !Auras.hasAuraData(legacy) || current?.imported ) return null;

		const data = {imported: true};
		if ( Auras.hasAuraData(current) ) return data;
		for ( const key of Auras.AURA_KEYS ) {
			if ( key in legacy ) data[key] = structuredClone(legacy[key]);
		}
		return data;
	},

	migrateWorld: async function () {
		if ( game.users.activeGM?.id !== game.user.id ) return;
		let count = 0;

		for ( const scene of game.scenes ) {
			const updates = [];
			for ( const token of scene.tokens ) {
				const data = Auras.getLegacyImport(token.flags);
				if ( data ) updates.push({_id: token.id, flags: {[Auras.MODULE_ID]: data}});
			}
			if ( updates.length ) await scene.updateEmbeddedDocuments('Token', updates);
			count += updates.length;
		}

		const updates = [];
		for ( const actor of game.actors ) {
			const data = Auras.getLegacyImport(actor.prototypeToken.flags);
			if ( data ) updates.push({_id: actor.id, prototypeToken: {flags: {[Auras.MODULE_ID]: data}}});
		}
		if ( updates.length ) await game.actors.documentClass.updateDocuments(updates);
		count += updates.length;

		if ( count ) console.log(`Token Auras Revitalized | Imported Token Auras data into ${count} tokens and prototype tokens.`);
	},

	onPreCreateToken: function (doc) {
		const data = Auras.getLegacyImport(doc.flags);
		if ( data ) doc.updateSource({flags: {[Auras.MODULE_ID]: data}});
	}
};

globalThis.Auras = Auras;

Hooks.once('init', () => {
	game.modules.get(Auras.MODULE_ID).api = Auras;
});

Hooks.once('ready', Auras.registerConfigTabs);
Hooks.once('ready', Auras.migrateWorld);
Hooks.on('preCreateToken', Auras.onPreCreateToken);
Hooks.on('preRenderTokenConfig', Auras.onPreRenderConfig);
Hooks.on('preRenderPrototypeTokenConfig', Auras.onPreRenderConfig);
Hooks.on('drawToken', Auras.drawAuras);
Hooks.on('refreshToken', Auras.onRefreshToken);
Hooks.on('updateToken', Auras.onUpdateToken);
Hooks.on('destroyToken', Auras.destroyAuras);
