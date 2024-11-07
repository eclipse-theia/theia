// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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
    // create wrapper over plugin
    // esbuild validates the plugin object and expects no additional properties
    return {
        name: plugin.name,
        setup: plugin.setup.bind(plugin)
    };
}

class PluginImpl implements Plugin {

    name = '@theia/native-esbuild-plugin';

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
    const targetDirectory = path.resolve(outdir, '..', 'build', 'Release');
    if (process.platform === 'win32') {
        const agentFile = join(resolveModulePath('node-pty'), 'build', 'Release', 'winpty-agent.exe');
        const targetAgentFile = path.join(targetDirectory, 'winpty-agent.exe');
        await copyExecutable(agentFile, targetAgentFile);
        const dllFile = join(resolveModulePath('node-pty'), 'build', 'Release', 'winpty.dll');
        const targetDllFile = path.join(targetDirectory, 'winpty.dll');
        await copyExecutable(dllFile, targetDllFile);
    } else if (process.platform === 'darwin') {
        const sourceFile = join(resolveModulePath('node-pty'), 'build', 'Release', 'spawn-helper');
        const targetFile = path.join(targetDirectory, 'spawn-helper');
        await copyExecutable(sourceFile, targetFile);
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
${cases.join('/')}
    }
    throw new Error(\`unhandled module: "\${jsModule}"\`);
}`.trim();
};
