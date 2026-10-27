// @ts-check
/**
 * ESM migration: mark packages as `"type": "module"` and generate their `exports` map.
 *
 * The generated map keeps every module path that was importable before the migration working,
 * including extension-less deep imports into `lib` (e.g. `@theia/core/lib/browser/widgets/widget`),
 * barrel directories (e.g. `@theia/core/lib/browser`) and the `shared` re-exports.
 *
 * Usage: node scripts/esm/package-exports.mjs [--check] [--keep-type] [--lib-assets=<ext>,...] <package-dir>...
 * With --check it only reports packages whose `exports` map is out of date. Without package directories, it checks
 * every package below `packages`, `dev-packages` and `examples` that is an ES module or already has an `exports` map.
 * With --keep-type the module type of the packages is not changed.
 * With --lib-assets the extensions of files other than modules below `lib` can be set, see `DEFAULT_LIB_ASSETS`.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const check = process.argv.includes('--check');
// Only generate the `exports` map, e.g. for CommonJS packages that are imported by ES modules.
const keepType = process.argv.includes('--keep-type');
/**
 * The extensions of files other than modules that a package has below `lib` and that must stay importable by
 * their path, e.g. `@theia/core/lib/common/i18n/nls.metadata.json`. `tsc` copies the JSON files imported with
 * `resolveJsonModule` to `lib`; a package that copies other assets, e.g. `.wasm` or `.html` files, has to list
 * their extensions with `--lib-assets=json,wasm,html`, as the catch-all `./lib/*` pattern only resolves modules.
 */
const DEFAULT_LIB_ASSETS = ['json'];
const libAssets = process.argv.find(arg => arg.startsWith('--lib-assets='))?.slice('--lib-assets='.length).split(',').filter(Boolean) ?? DEFAULT_LIB_ASSETS;
const explicitPackageDirs = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const packageDirs = explicitPackageDirs.length || !check ? explicitPackageDirs : defaultPackageDirs();

/** @returns {string[]} the directories of all packages of the repository that have a `package.json` */
function defaultPackageDirs() {
    return ['packages', 'dev-packages', 'examples'].flatMap(root => readdirSync(root)
        .map(entry => join(root, entry))
        .filter(dir => existsSync(join(dir, 'package.json'))));
}

/**
 * @param {string} dir
 * @returns {string[]} the directories below `dir` (including `dir`) that contain an index module
 */
function indexDirectories(dir) {
    /** @type {string[]} */
    const result = [];
    if (!existsSync(dir)) {
        return result;
    }
    const entries = readdirSync(dir);
    if (entries.some(entry => /^index\.tsx?$/.test(entry))) {
        result.push(dir);
    }
    for (const entry of entries) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
            result.push(...indexDirectories(path));
        }
    }
    return result;
}

/**
 * @param {string} dir
 * @param {string} name
 * @returns {string[]} the files named `name` below `dir`
 */
function findFiles(dir, name) {
    if (!existsSync(dir)) {
        return [];
    }
    return readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter(entry => entry.split(/[\\/]/).pop() === name)
        .map(entry => join(dir, entry));
}

/**
 * @param {string} packageDir
 * @param {any} pkg
 */
function computeExports(packageDir, pkg) {
    /** @type {Record<string, string | Record<string, string>>} */
    const exports = {};
    if (pkg.main) {
        let main = pkg.main.replace(/^\.\//, '');
        // ES modules cannot resolve directories or omit extensions, e.g. `"main": "lib/common"`.
        if (!main.endsWith('.js') && existsSync(join(packageDir, main.replace(/^lib\//, 'src/'))) && statSync(join(packageDir, main.replace(/^lib\//, 'src/'))).isDirectory()) {
            main = main.replace(/\/$/, '') + '/index.js';
        } else if (!main.endsWith('.js')) {
            main += '.js';
        }
        // Skip a `main` entry that refers to a module that does not exist.
        if (!main.startsWith('lib/') || existsSync(join(packageDir, main.replace(/^lib\//, 'src/').replace(/\.js$/, '.ts')))) {
            exports['.'] = './' + main;
        }
    } else if (existsSync(join(packageDir, 'index.js'))) {
        exports['.'] = './index.js';
    } else if (pkg.types || pkg.typings) {
        // A package that only provides types, e.g. `@theia/plugin`.
        exports['.'] = { types: './' + (pkg.types || pkg.typings).replace(/^\.\//, '') };
    }
    exports['./package.json'] = './package.json';
    const srcDir = join(packageDir, 'src');
    for (const dir of indexDirectories(srcDir).sort()) {
        const path = relative(srcDir, dir).split('\\').join('/');
        if (path) {
            exports[`./lib/${path}`] = `./lib/${path}/index.js`;
        }
    }
    for (const reExportDir of Object.keys(pkg.theiaReExports ?? {})) {
        // Re-exports are either CommonJS (`index.cjs`) or ES modules (`index.js`).
        // The pattern maps to the more common kind, the others are mapped explicitly.
        const commonJs = findFiles(join(packageDir, reExportDir), 'index.cjs');
        const esm = findFiles(join(packageDir, reExportDir), 'index.js');
        const [defaultIndex, exceptions] = commonJs.length >= esm.length ? ['index.cjs', esm] : ['index.js', commonJs];
        for (const file of exceptions.sort()) {
            const path = relative(packageDir, dirname(file)).split('\\').join('/');
            exports[`./${path}`] = `./${path}/${file.endsWith('.cjs') ? 'index.cjs' : 'index.js'}`;
        }
        exports[`./${reExportDir}/*`] = `./${reExportDir}/*/${defaultIndex}`;
    }
    // Patterns with an extension take precedence over the catch-all, which adds `.js` to extension-less paths.
    for (const extension of libAssets) {
        exports[`./lib/*.${extension}`] = `./lib/*.${extension}`;
    }
    exports['./lib/*.js'] = './lib/*.js';
    exports['./lib/*'] = './lib/*.js';
    exports['./*'] = './*';
    return exports;
}

let outdated = 0;
for (const packageDir of packageDirs) {
    const packageJsonPath = join(packageDir, 'package.json');
    const text = readFileSync(packageJsonPath, 'utf8');
    const pkg = JSON.parse(text);
    // Without explicit package directories, a CommonJS package is only checked if it has an `exports` map.
    if (!explicitPackageDirs.length && pkg.type !== 'module' && !pkg.exports) {
        continue;
    }
    const exports = computeExports(packageDir, pkg);
    if ((keepType || !explicitPackageDirs.length || pkg.type === 'module') && JSON.stringify(pkg.exports) === JSON.stringify(exports)) {
        continue;
    }
    outdated++;
    if (check) {
        console.log(`${packageJsonPath}: exports map is out of date`);
        continue;
    }
    // Insert `type` and `exports` right after `main`/`typings` to keep the manifests readable.
    /** @type {Record<string, unknown>} */
    const next = {};
    for (const [key, value] of Object.entries(pkg)) {
        if (key === 'type' || key === 'exports') {
            continue;
        }
        next[key] = value;
        if (key === 'description') {
            if (!keepType) {
                next.type = 'module';
            } else if (pkg.type) {
                next.type = pkg.type;
            }
        }
        if (key === (pkg.typings ? 'typings' : pkg.types ? 'types' : 'main')) {
            next.exports = exports;
        }
    }
    if (!keepType && !('type' in next)) {
        next.type = 'module';
    }
    if (!('exports' in next)) {
        next.exports = exports;
    }
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    writeFileSync(packageJsonPath, JSON.stringify(next, undefined, 2).split('\n').join(eol) + eol);
}
console.log(`${check ? 'Outdated' : 'Updated'}: ${outdated} package(s).`);
process.exitCode = check && outdated ? 1 : 0;
