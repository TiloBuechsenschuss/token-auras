const Auras = {
	PERMISSIONS: ['all', 'limited', 'observer', 'owner', 'gm'],
	TAB_ID: 'tokenAuras',
	TEMPLATE: 'modules/token-auras/templates/token-config.hbs',

	getAllAuras: function (doc) {
		return Auras.getManualAuras(doc).concat(doc.getFlag('token-auras', 'auras') || []);
	},

	getManualAuras: function (doc) {
		let aura1 = doc.getFlag('token-auras', 'aura1');
		let aura2 = doc.getFlag('token-auras', 'aura2');
		return [aura1 || Auras.newAura(), aura2 || Auras.newAura()];
	},

	newAura: function () {
		return {
			distance: null,
			colour: '#ffffff',
			opacity: .5,
			square: false,
			permission: 'all',
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
			square: new fields.BooleanField({label: 'SCENE.GridSquare'})
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
			const prefix = `flags.token-auras.aura${idx + 1}`;
			return {
				legend: game.i18n.format('AURAS.AuraN', {number: idx + 1}),
				uuid: {name: `${prefix}.uuid`, value: aura.uuid || Auras.uuid()},
				inputs: [
					{field: fields.permission, name: `${prefix}.permission`, value: aura.permission},
					{field: fields.colour, name: `${prefix}.colour`, value: aura.colour},
					{field: fields.opacity, name: `${prefix}.opacity`, value: aura.opacity, step: .01},
					{field: fields.distance, name: `${prefix}.distance`, value: aura.distance, units: context.gridUnits},
					{field: fields.square, name: `${prefix}.square`, value: aura.square}
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
		const aurasUpdated = Object.keys(changed.flags ?? {}).some(k => k.includes('token-auras'));
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
	}
};

globalThis.Auras = Auras;

Hooks.once('init', () => {
	game.modules.get('token-auras').api = Auras;
});

Hooks.once('ready', Auras.registerConfigTabs);
Hooks.on('preRenderTokenConfig', Auras.onPreRenderConfig);
Hooks.on('preRenderPrototypeTokenConfig', Auras.onPreRenderConfig);
Hooks.on('drawToken', Auras.drawAuras);
Hooks.on('refreshToken', Auras.onRefreshToken);
Hooks.on('updateToken', Auras.onUpdateToken);
Hooks.on('destroyToken', Auras.destroyAuras);
