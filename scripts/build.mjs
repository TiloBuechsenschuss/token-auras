// Builds the release files into dist/:
// - dist/module.json: the manifest with manifest and download URLs for the current version.
// - dist/module.zip:  the installable module package.
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

// Files and directories that are part of the installed module, next to module.json.
const CONTENTS = ['main.js', 'lang', 'templates', 'LICENSE', 'README.md'];

async function collect(relPath, files) {
	const absPath = path.join(ROOT, relPath);
	if ( (await stat(absPath)).isDirectory() ) {
		for ( const entry of await readdir(absPath) ) await collect(path.join(relPath, entry), files);
	} else {
		files[relPath.split(path.sep).join('/')] = await readFile(absPath);
	}
}

const manifest = JSON.parse(await readFile(path.join(ROOT, 'module.json'), 'utf8'));
const { version, url } = manifest;
if ( !version ) throw new Error('module.json has no version.');
if ( !url?.startsWith('https://github.com/') ) throw new Error('module.json url must point to the GitHub repository.');

// The release workflow tags releases with the bare version, for example 3.0.0.
manifest.manifest = `${url}/releases/latest/download/module.json`;
manifest.download = `${url}/releases/download/${version}/module.zip`;
const manifestJson = `${JSON.stringify(manifest, null, '\t')}\n`;

const files = {'module.json': new TextEncoder().encode(manifestJson)};
for ( const entry of CONTENTS ) await collect(entry, files);

await rm(DIST, {recursive: true, force: true});
await mkdir(DIST, {recursive: true});
await writeFile(path.join(DIST, 'module.json'), manifestJson);
await writeFile(path.join(DIST, 'module.zip'), zipSync(files, {level: 9}));

console.log(`Built ${manifest.id} ${version}: ${Object.keys(files).length} files in dist/module.zip`);
