// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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
import * as os from 'os';

import type { Compiler } from 'webpack';

const REQUIRE_RIPGREP = '@vscode/ripgrep';
const REQUIRE_VSCODE_WINDOWS_CA_CERTS = '@vscode/windows-ca-certs';
const REQUIRE_BINDINGS = 'bindings';
const REQUIRE_KEYMAPPING = './build/Release/keymapping';
const REQUIRE_PARCEL_WATCHER = './build/Release/watcher.node';
const REQUIRE_NODE_PTY_CONPTY = '../build/Release/conpty.node';

export interface NativeWebpackPluginOptions {
    out: string;
    trash: boolean;
    ripgrep: boolean;
    pty: boolean;
    replacements?: Record<string, string>;
    nativeBindings?: Record<string, string>;
}

export class NativeWebpackPlugin {

    private bindings = new Map<string, string>();
    private options: NativeWebpackPluginOptions;

    constructor(options: NativeWebpackPluginOptions) {
        this.options = options;
        for (const [name, value] of Object.entries(options.nativeBindings ?? {})) {
            this.nativeBinding(name, value);
        }
    }

    nativeBinding(dependency: string, nodePath: string): void {
        this.bindings.set(dependency, nodePath);
    }

    apply(compiler: Compiler): void {
        let replacements: Record<string, (issuer: string) => Promise<string>> = {};
        let nodePtyIssuer: string | undefined;
        let trashHelperIssuer: string | undefined;
        let ripgrepIssuer: string | undefined;
        compiler.hooks.initialize.tap(NativeWebpackPlugin.name, async () => {
            const directory = path.resolve(compiler.outputPath, 'native-webpack-plugin');
            await fs.promises.mkdir(directory, { recursive: true });
            const bindingsFile = (issuer: string) => buildFile(directory, 'bindings.js', bindingsReplacement(issuer, Array.from(this.bindings.entries())));
            const ripgrepFile = () => buildFile(directory, 'ripgrep.js', ripgrepReplacement(this.options.out));
            const keymappingFile = () => Promise.resolve('./build/Release/keymapping.node');
            const windowsCaCertsFile = () => Promise.resolve('@vscode/windows-ca-certs/build/Release/crypt32.node');
            replacements = {
                ...(this.options.replacements ?? {}),
                [REQUIRE_RIPGREP]: ripgrepFile,
                [REQUIRE_BINDINGS]: bindingsFile,
                [REQUIRE_KEYMAPPING]: keymappingFile,
                [REQUIRE_VSCODE_WINDOWS_CA_CERTS]: windowsCaCertsFile,
                [REQUIRE_PARCEL_WATCHER]: issuer => Promise.resolve(findNativeWatcherFile(issuer))
            };
            if (process.platform !== 'win32') {
                // The expected conpty.node file is not available on non-windows platforms during build.
                // We need to provide a stub that will be replaced by the real file at runtime.
                replacements[REQUIRE_NODE_PTY_CONPTY] = () => buildFile(directory, 'conpty.js', conhostWindowsReplacement());
            }
        });
        compiler.hooks.normalModuleFactory.tap(
            NativeWebpackPlugin.name,
            nmf => {
                nmf.hooks.beforeResolve.tapPromise(NativeWebpackPlugin.name, async result => {
                    if (result.request === REQUIRE_RIPGREP) {
                        ripgrepIssuer = result.contextInfo.issuer;
                    } else if (result.request === 'node-pty') {
                        nodePtyIssuer = result.contextInfo.issuer;
                    } else if (result.request === 'trash') {
                        trashHelperIssuer = result.contextInfo.issuer;
                    }
                    for (const [file, replacement] of Object.entries(replacements)) {
                        if (result.request === file) {
                            result.request = await replacement(result.contextInfo.issuer);
                        }
                    }
                });
            }
        );
        compiler.hooks.afterEmit.tapPromise(NativeWebpackPlugin.name, async () => {
            if (this.options.trash && trashHelperIssuer) {
                await this.copyTrashHelper(trashHelperIssuer, compiler);
            }
            if (this.options.ripgrep && ripgrepIssuer) {
                await this.copyRipgrep(ripgrepIssuer, compiler);
            }
            if (this.options.pty && nodePtyIssuer) {
                await this.copyNodePtySpawnHelper(nodePtyIssuer, compiler);
            }
        });
    }

    protected async copyRipgrep(issuer: string, compiler: Compiler): Promise<void> {
        const suffix = process.platform === 'win32' ? '.exe' : '';
        const sourceFile = require.resolve(`@vscode/ripgrep/bin/rg${suffix}`, { paths: [issuer] });
        const targetFile = path.join(compiler.outputPath, this.options.out, `rg${suffix}`);
        await this.copyExecutable(sourceFile, targetFile);
    }

    protected async copyNodePtySpawnHelper(issuer: string, compiler: Compiler): Promise<void> {
        const targetDirectory = path.resolve(compiler.outputPath, '..', 'build', 'Release');
        if (process.platform === 'win32') {
            const agentFile = require.resolve('node-pty/build/Release/winpty-agent.exe', { paths: [issuer] });
            const targetAgentFile = path.join(targetDirectory, 'winpty-agent.exe');
            await this.copyExecutable(agentFile, targetAgentFile);
            const dllFile = require.resolve('node-pty/build/Release/winpty.dll', { paths: [issuer] });
            const targetDllFile = path.join(targetDirectory, 'winpty.dll');
            await this.copyExecutable(dllFile, targetDllFile);
        } else if (process.platform === 'darwin') {
            const sourceFile = require.resolve('node-pty/build/Release/spawn-helper', { paths: [issuer] });
            const targetFile = path.join(targetDirectory, 'spawn-helper');
            await this.copyExecutable(sourceFile, targetFile);
        }
    }

    protected async copyTrashHelper(issuer: string, compiler: Compiler): Promise<void> {
        let sourceFile: string | undefined;
        let targetFile: string | undefined;
        if (process.platform === 'win32') {
            sourceFile = require.resolve('trash/lib/windows-trash.exe', { paths: [issuer] });
            targetFile = path.join(compiler.outputPath, 'windows-trash.exe');
        } else if (process.platform === 'darwin') {
            sourceFile = require.resolve('trash/lib/macos-trash', { paths: [issuer] });
            targetFile = path.join(compiler.outputPath, 'macos-trash');
        }
        if (sourceFile && targetFile) {
            await this.copyExecutable(sourceFile, targetFile);
        }
    }

    protected async copyExecutable(source: string, target: string): Promise<void> {
        const targetDirectory = path.dirname(target);
        await fs.promises.mkdir(targetDirectory, { recursive: true });
        await fs.promises.copyFile(source, target);
        await fs.promises.chmod(target, 0o777);
    }
}

function findNativeWatcherFile(issuer: string): string {
    let name = `@parcel/watcher-${process.platform}-${process.arch}`;
    if (process.platform === 'linux') {
        const { MUSL, family } = require('detect-libc');
        if (family === MUSL) {
            name += '-musl';
        } else {
            name += '-glibc';
        }
    }
    return require.resolve(name, {
        paths: [issuer]
    });
}

async function buildFile(root: string, name: string, content: string): Promise<string> {
    const tmpFile = path.join(root, name);
    let write = true;
    try {
        const existing = await fs.promises.readFile(tmpFile, 'utf8');
        if (existing === content) {
            // prevent writing the same content again
            // this would trigger the watch mode repeatedly
            write = false;
        }
    } catch {
        // ignore
    }
    if (write) {
        await fs.promises.writeFile(tmpFile, content);
    }
    return tmpFile;
}

const ripgrepReplacement = (nativePath: string = '.'): string => `
const path = require('path');

exports.rgPath = path.join(__dirname, \`./${nativePath}/rg\${process.platform === 'win32' ? '.exe' : ''}\`);
`;

const bindingsReplacement = (issuer: string, entries: [string, string][]): string => {
    const cases: string[] = [];

    for (const [module, node] of entries) {
        const modulePath = require.resolve(node, {
            paths: [issuer]
        });
        cases.push(`${' '.repeat(8)}case '${module}': return require('${modulePath.replace(/\\/g, '/')}');`);
    }

    return `
module.exports = function (jsModule) {
    switch (jsModule) {
${cases.join(os.EOL)}
    }
    throw new Error(\`unhandled module: "\${jsModule}"\`);
}`.trim();
};

const conhostWindowsReplacement = (nativePath: string = '.'): string => `
module.exports = __non_webpack_require__('${nativePath}/native/conpty.node');
`;
