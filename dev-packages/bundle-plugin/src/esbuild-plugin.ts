// *****************************************************************************
// Copyright (C) 2026 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as path from 'path';
import * as fs from 'fs';
import resolvePackagePath = require('resolve-package-path');

import type { Plugin, PluginBuild } from 'esbuild';
import { EOL } from 'os';

function join(...parts: string[]): string {
    return path.join(...parts).replace(/\\/g, '/');
}

function resolveModulePath(module: string): string {
    const modulePath = resolvePackagePath(module, process.cwd());
    if (!modulePath) {
        throw new Error('Could not resolve path of module: ' + module);
    }
    return path.resolve(modulePath, '..');
}

/**
 * Redirects Monaco's nls module to Theia's localization-aware version.
 *
 * esbuild's `alias` option cannot be used for this because it rejects absolute paths as keys.
 * This plugin catches both package-style imports (`@theia/monaco-editor-core/esm/vs/nls`)
 * and relative imports from within Monaco's source tree (e.g. `../nls.js`), which are
 * identified by the importing file residing inside `monaco-editor-core`.
 *
 * If `@theia/monaco` is not installed the plugin is a no-op.
 */
export function monacoNlsPlugin(): Plugin {
    const monacoPackagePath = resolvePackagePath('@theia/monaco', process.cwd());
    const redirectTarget = monacoPackagePath
        ? path.join(monacoPackagePath, '..', 'lib', 'browser', 'monaco-nls.js')
        : undefined;
    return {
        name: 'monaco-nls',
        setup(build: PluginBuild): void {
            if (!redirectTarget) {
                return;
            }
            build.onResolve({ filter: /nls(\.js)?$/ }, args => {
                if (
                    args.path.startsWith('@theia/monaco-editor-core') ||
                    args.resolveDir.includes('monaco-editor-core')
                ) {
                    return { path: redirectTarget };
                }
            });
        }
    };
}

/**
 * Expose bundled modules on the `globalThis['theia']` namespace, e.g.
 * `window['theia']['@theia/core/lib/common/uri']`.
 * Such syntax can be used by external code, for instance, for testing.
 *
 * This is the esbuild equivalent of the webpack `expose-loader`.
 * It is opt-in: add it to the `plugins` array in your `esbuild.mjs` to enable it.
 */
export function exposeModulePlugin(): Plugin {
    function findPackage(resourcePath: string): { name: string, dir: string } | undefined {
        let dir = path.dirname(resourcePath);
        while (true) {
            try {
                const { name } = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
                if (name) {
                    return { name, dir };
                }
            } catch {
                // No package.json at this level — keep walking up.
            }
            const parent = path.dirname(dir);
            if (parent === dir) {
                return undefined; // Reached filesystem root.
            }
            dir = parent;
        }
    }

    return {
        name: 'expose-module',
        setup(build: PluginBuild): void {
            build.onLoad({ filter: /\.js$/ }, async args => {
                const pkg = findPackage(args.path);
                if (!pkg) {
                    return;
                }
                const source = await fs.promises.readFile(args.path, 'utf8');
                const { dir, name } = path.parse(args.path);
                let moduleName = path.join(pkg.name, dir.substring(pkg.dir.length));
                if (name !== 'index') {
                    moduleName = path.join(moduleName, name);
                }
                if (path.sep !== '/') {
                    moduleName = moduleName.split(path.sep).join('/');
                }
                const exposure = `\n;(globalThis['theia'] = globalThis['theia'] || {})['${moduleName}'] = (typeof module === 'object' && module.exports) || this;\n`;
                return { contents: source + exposure, loader: 'js' };
            });
        }
    };
}

export function problemMatcherPlugin(watch: boolean, type: string): Plugin {
    const buildType = watch ? 'watch' : 'build';
    const prefix = `[${buildType}/${type}]`;
    let time = Date.now();
    return {
        name: 'esbuild-problem-matcher',
        setup(build: PluginBuild): void {
            build.onStart(() => {
                time = Date.now();
                console.log(prefix + ' Build started');
            });
            build.onEnd(result => {
                console.log(prefix + ' Finished with ' + result.errors.length + ' errors in ' + (Date.now() - time) + 'ms.');
            });
        },
    };
};

export interface NativeDependenciesPluginOptions {
    trash: boolean;
    ripgrep: boolean;
    pty: boolean;
    nativeBindings: Record<string, string>;
}

export function nativeDependenciesPlugin(options: NativeDependenciesPluginOptions): Plugin {
    const plugin = new PluginImpl(options);
    // create wrapper object over plugin
    // esbuild validates the plugin object and expects no additional properties
    return {
        name: plugin.name,
        setup: plugin.setup.bind(plugin)
    };
}

class PluginImpl implements Plugin {

    name = '@theia/esbuild-plugin';

    private bindings: Record<string, string> = {};
    private options: NativeDependenciesPluginOptions;

    constructor(options: NativeDependenciesPluginOptions) {
        this.options = options;
        for (const [name, value] of Object.entries(options.nativeBindings)) {
            this.nativeBinding(name, value);
        }
    }

    nativeBinding(dependency: string, nodePath: string): void {
        this.bindings[dependency] = nodePath;
    }

    setup(build: PluginBuild): void {
        const outdir = build.initialOptions.outdir;
        if (!outdir) {
            throw new Error('The `outdir` option is required.');
        }
        build.onResolve({ filter: /^@vscode\/windows-ca-certs$/ }, () => {
            const windows = process.platform === 'win32';
            return {
                path: windows
                    ? join(resolveModulePath('@vscode/windows-ca-certs'), 'build', 'Release', 'crypt32.node')
                    : '',
                // Simply mark the dependency as external on non-Windows platforms
                external: !windows
            };
        });
        build.onResolve({ filter: /\.\/build\/Release\/keymapping$/ }, () => ({
            path: join(resolveModulePath('native-keymap'), 'build', 'Release', 'keymapping.node'),
            namespace: 'node-file'
        }));
        build.onResolve({ filter: /\.\/build\/Release\/watcher\.node$/ }, () => {
            let name = `@parcel/watcher-${process.platform}-${process.arch}`;
            if (process.platform === 'linux') {
                const { MUSL, family } = require('detect-libc');
                if (family === MUSL) {
                    name += '-musl';
                } else {
                    name += '-glibc';
                }
            }
            return {
                path: join(resolveModulePath(name), 'watcher.node')
            };
        });
        build.onLoad({ filter: /bindings[\\\/]bindings\.js$/ }, async () => ({
            contents: bindingsReplacement(this.bindings),
            loader: 'js'
        }));
        build.onLoad({ filter: /@vscode[\\\/]ripgrep[\\\/]lib[\\\/]index\.js$/ }, async () => ({
            contents: 'exports.rgPath = require("path").join(__dirname, `./native/rg${process.platform === "win32" ? ".exe" : ""}`);',
            loader: 'js'
        }));
        build.onLoad({ filter: /node_modules[/\\]node-pty[/\\]lib[/\\]utils\.js$/ }, async args => {
            let contents = await fs.promises.readFile(args.path, 'utf8');
            // node-pty's loadNativeModule() uses dynamic require() calls with paths computed
            // at runtime (e.g. require(dir + "/" + name + ".node")). Routing them through a
            // local alias prevents esbuild from attempting static analysis of those paths,
            // so Node.js resolves them at runtime relative to the bundle's __dirname, where
            // the prebuilt .node files are placed by copyNodePtySpawnHelper().
            contents = 'const __nativePtyRequire = require;\n' + contents.replace(/\brequire\(/g, '__nativePtyRequire(');
            return { contents, loader: 'js' };
        });
        build.onEnd(() => {
            if (this.options.trash) {
                copyTrashHelper(outdir);
            }
            if (this.options.ripgrep) {
                copyRipgrep(outdir);
            }
            if (this.options.pty) {
                copyNodePtySpawnHelper(outdir);
            }
        });
        this.setupNodeRequires(build);
    }

    private setupNodeRequires(build: PluginBuild): void {
        // By default, ESBuild does not handle `.node` files. We need to handle them ourselves.
        // When using the `file` loader directly, the files only get exposed via their paths.
        // However, we want to load them directly as native modules via `require`.
        build.onResolve({ filter: /\.node$/, namespace: 'file' }, args => {
            try {
                // Move the resolved path to the `node-file` namespace to load it as a native module.
                const resolved = require.resolve(args.path, { paths: [args.resolveDir] });
                return {
                    path: resolved,
                    namespace: 'node-file',
                };
            } catch {
                // If the module cannot be resolved, mark it as external.
                return {
                    external: true
                };
            }
        });
        build.onLoad({ filter: /.*/, namespace: 'node-file' }, args => ({
            // Replace the require statement with a direct require call to the native module.
            contents: `
              import path from ${JSON.stringify(args.path)}
              try { module.exports = require(path) }
              catch { throw new Error('Could not load native module from "${path.basename(args.path)}"') }
            `,
        }));
        build.onResolve({ filter: /\.node$/, namespace: 'node-file' }, args => ({
            // Finally, resolve the `.node` file to the local path.
            path: args.path,
            namespace: 'file',
        }));
    }
}

async function copyRipgrep(outdir: string): Promise<void> {
    const fileName = process.platform === 'win32' ? 'rg.exe' : 'rg';
    const sourceFile = join(resolveModulePath('@vscode/ripgrep'), 'bin', fileName);
    const targetFile = path.join(outdir, 'native', fileName);
    await copyExecutable(sourceFile, targetFile);
}

async function copyNodePtySpawnHelper(outdir: string): Promise<void> {
    const dist = `${process.platform}-${process.arch}`;
    const src = `node-pty/prebuilds/${dist}`;
    const targetDirectory = path.resolve(outdir, '..', 'prebuilds', dist);

    const copyFile = async (source: string): Promise<void> => {
        const file = require.resolve(`${src}/${source}`);
        const targetFile = path.join(targetDirectory, source);
        await copyExecutable(file, targetFile);
    };

    if (process.platform === 'win32') {
        await copyFile('conpty.node');
        await copyFile('conpty_console_list.node');
        await copyFile('conpty/conpty.dll');
        await copyFile('conpty/OpenConsole.exe');
    } else if (process.platform === 'darwin') {
        await copyFile('spawn-helper');
    }
    // On non-windows platforms
    if (process.platform !== 'win32') {
        await copyFile('pty.node');
    }
}

async function copyTrashHelper(outdir: string): Promise<void> {
    const fileName = process.platform === 'win32' ? 'windows-trash.exe' : 'macos-trash';
    if (process.platform === 'win32' || process.platform === 'darwin') {
        const sourceFile = join(resolveModulePath('trash'), 'lib', fileName);
        const targetFile = path.join(outdir, fileName);
        await copyExecutable(sourceFile, targetFile);
    }
}

async function copyExecutable(source: string, target: string): Promise<void> {
    const targetDirectory = path.dirname(target);
    await fs.promises.mkdir(targetDirectory, { recursive: true });
    await fs.promises.copyFile(source, target);
    await fs.promises.chmod(target, 0o777);
}

const bindingsReplacement = (bindings: Record<string, string>) => {
    const cases = [];

    for (const [module, node] of Object.entries(bindings)) {
        cases.push(`${' '.repeat(8)}case '${module}': return require('${node}');`);
    }

    return `
module.exports = function (jsModule) {
    switch (jsModule) {
${cases.join(EOL)}
    }
    throw new Error(\`unhandled module: "\${jsModule}"\`);
}`.trim();
};
