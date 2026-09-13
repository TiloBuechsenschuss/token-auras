// The manifest, translations and release package.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'node:test';
import { promisify } from 'node:util';
import { unzipSync } from 'fflate';
import { ROOT } from './support/foundry.mjs';

const readJson = async file => JSON.parse(await readFile(path.join(ROOT, file), 'utf8'));
const manifest = await readJson('module.json');

describe('module.json', () => {
	test('uses the module id token-auras', () => {
		assert.equal(manifest.id, 'token-auras');
	});

	test('uses the title Token Auras Revitalized', () => {
		assert.equal(manifest.title, 'Token Auras Revitalized');
	});

	test('has no fields that v14 removed', () => {
		for ( const key of ['name', 'minimumCoreVersion', 'compatibleCoreVersion', 'scripts'] ) {
			assert.equal(key in manifest, false, `${key} must not be in module.json`);
		}
	});

	test('requires Foundry v14', () => {
		assert.equal(Number.parseInt(manifest.compatibility.minimum), 14);
		assert.ok(Number.parseInt(manifest.compatibility.verified) >= 14);
	});

	test('has a semantic version', () => {
		assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	});

	test('loads main.js as an ES module', () => {
		assert.deepEqual(manifest.esmodules, ['main.js']);
	});

	test('credits the original author', () => {
		assert.equal(manifest.authors[0].name, 'Kim Mantas');
	});

	test('lists existing language files', () => {
		for ( const {path: file} of manifest.languages ) assert.ok(existsSync(path.join(ROOT, file)), file);
	});
});

const sources = [await readFile(path.join(ROOT, 'main.js'), 'utf8'), await readFile(path.join(ROOT, 'templates', 'token-config.hbs'), 'utf8')];
const usedKeys = new Set(sources.flatMap(source => [...source.matchAll(/'(AURAS\.[A-Za-z0-9]+)'/g)].map(m => m[1])));
const english = await readJson('lang/en.json');

describe('translations', () => {
	test('every AURAS key in the code exists in English', () => {
		assert.ok(usedKeys.size > 0);
		for ( const key of usedKeys ) assert.ok(key in english, `${key} is missing in lang/en.json`);
	});

	test('English has no unused AURAS keys', () => {
		for ( const key of Object.keys(english) ) assert.ok(usedKeys.has(key), `${key} is not used`);
	});

	for ( const {lang, path: file} of manifest.languages.filter(l => l.lang !== 'en') ) {
		test(`${lang} only translates English keys`, async () => {
			const translation = await readJson(file);
			for ( const key of Object.keys(translation) ) assert.ok(key in english, `${key} is not in lang/en.json`);
		});
	}
});

describe('build', () => {
	test('packages the module for a release', async () => {
		await promisify(execFile)(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs')], {cwd: ROOT});
		const files = unzipSync(await readFile(path.join(ROOT, 'dist', 'module.zip')));
		assert.deepEqual(Object.keys(files).sort(), [
			'LICENSE', 'README.md', 'lang/de.json', 'lang/en.json', 'lang/fr.json', 'lang/it.json', 'lang/pt-BR.json',
			'main.js', 'module.json', 'templates/token-config.hbs'
		]);

		const released = await readJson('dist/module.json');
		assert.deepEqual(JSON.parse(new TextDecoder().decode(files['module.json'])), released);
		assert.equal(released.version, manifest.version);
		assert.equal(released.manifest, `${manifest.url}/releases/latest/download/module.json`);
		assert.equal(released.download, `${manifest.url}/releases/download/${manifest.version}/module.zip`);
	});
});
