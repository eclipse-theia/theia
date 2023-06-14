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
import * as temp from 'temp';

import type { Compiler } from 'webpack';

const REQUIRE_RIPGREP = '@vscode/ripgrep';
const REQUIRE_VSCODE_WINDOWS_CA_CERTS = '@vscode/windows-ca-certs';
const REQUIRE_BINDINGS = 'bindings';
const REQUIRE_KEYMAPPING = './build/Release/keymapping';

export interface NativeWebpackPluginOptions {
    out: string;
    ripgrep: boolean;
    pty: boolean;
    replacements?: Record<string, string>;
    nativeBindings?: Record<string, string>;
}

export class NativeWebpackPlugin {

    private bindings = new Map<string, string>();
    private options: NativeWebpackPluginOptions;
    private tracker: typeof temp;

    constructor(options: NativeWebpackPluginOptions) {
        this.options = options;
        this.tracker = temp.track();
        for (const [name, value] of Object.entries(options.nativeBindings ?? {})) {
            this.nativeBinding(name, value);
        }
    }

    nativeBinding(dependency: string, nodePath: string): void {
        this.bindings.set(dependency, nodePath);
    }

    apply(compiler: Compiler): void {
        let replacements: Record<string, string> = {};
        compiler.hooks.initialize.tap(NativeWebpackPlugin.name, () => {
            const directory = this.tracker.mkdirSync({
                dir: path.resolve(compiler.outputPath, 'native-webpack-plugin')
            });
            const bindingsFile = buildFile(directory, 'bindings.js', bindingsReplacement(Array.from(this.bindings.entries())));
            const ripgrepFile = buildFile(directory, 'ripgrep.js', ripgrepReplacement(this.options.out));
            const keymappingFile = './build/Release/keymapping.node';
            const windowsCaCertsFile = '@vscode/windows-ca-certs/build/Release/crypt32.node';
            replacements = {
                ...(this.options.replacements ?? {}),
                [REQUIRE_RIPGREP]: ripgrepFile,
                [REQUIRE_BINDINGS]: bindingsFile,
                [REQUIRE_KEYMAPPING]: keymappingFile,
                [REQUIRE_VSCODE_WINDOWS_CA_CERTS]: windowsCaCertsFile
            };
        });
        compiler.hooks.normalModuleFactory.tap(
            NativeWebpackPlugin.name,
            nmf => {
                nmf.hooks.beforeResolve.tap(NativeWebpackPlugin.name, result => {
                    for (const [file, replacement] of Object.entries(replacements)) {
                        if (result.request === file) {
                            result.request = replacement;
                        }
                    }
                });
                nmf.hooks.afterResolve.tap(NativeWebpackPlugin.name, result => {
                    const createData = result.createData;
                    for (const [file, replacement] of Object.entries(replacements)) {
                        if (createData.resource === file) {
                            createData.resource = replacement;
                        }
                    }
                });
            }
        );
        compiler.hooks.afterEmit.tapAsync(NativeWebpackPlugin.name, async () => {
            if (this.options.ripgrep) {
                await this.copyRipgrep(compiler);
            }
            if (this.options.pty) {
                await this.copyNodePtySpawnHelper(compiler);
            }
            this.tracker.cleanupSync();
        });
        compiler.hooks.failed.tap(NativeWebpackPlugin.name, async () => {
            this.tracker.cleanupSync();
        });
    }

    protected async copyRipgrep(compiler: Compiler): Promise<void> {
        const suffix = process.platform === 'win32' ? '.exe' : '';
        const sourceFile = require.resolve(`@vscode/ripgrep/bin/rg${suffix}`);
        const targetFile = path.join(compiler.outputPath, this.options.out, `rg${suffix}`);
        await this.copyExecutable(sourceFile, targetFile);
    }

    protected async copyNodePtySpawnHelper(compiler: Compiler): Promise<void> {
        const targetDirectory = path.resolve(compiler.outputPath, '..', 'build', 'Release');
        if (process.platform === 'win32') {
            const agentFile = require.resolve('node-pty/build/Release/winpty-agent.exe');
            const targetAgentFile = path.join(targetDirectory, 'winpty-agent.exe');
            await this.copyExecutable(agentFile, targetAgentFile);
            const dllFile = require.resolve('node-pty/build/Release/winpty.dll');
            const targetDllFile = path.join(targetDirectory, 'winpty.dll');
            await this.copyExecutable(dllFile, targetDllFile);
        } else {
            const sourceFile = require.resolve('node-pty/build/Release/spawn-helper');
            const targetFile = path.join(targetDirectory, 'spawn-helper');
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

function buildFile(root: string, name: string, content: string): string {
    const tmpFile = path.join(root, name);
    fs.writeFileSync(tmpFile, content);
    return tmpFile;
}

const ripgrepReplacement = (nativePath: string = '.'): string => `
const path = require('path');

exports.rgPath = path.join(__dirname, \`./${nativePath}/rg\${process.platform === 'win32' ? '.exe' : ''}\`);
`;

const bindingsReplacement = (entries: [string, string][]): string => {
    const cases: string[] = [];

    for (const [module, node] of entries) {
        cases.push(`${' '.repeat(8)}case '${module}': return require('${node}');`);
    }

    return `
module.exports = function (jsModule) {
    switch (jsModule) {
${cases.join(os.EOL)}
    }
    throw new Error(\`unhandled module: "\${jsModule}"\`);
}`.trim();
};
