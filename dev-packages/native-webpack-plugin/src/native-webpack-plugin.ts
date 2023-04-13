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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as path from 'path';
import * as fs from 'fs';
import { EOL } from 'os';

import type { Compiler } from 'webpack';

const REQUIRE_RIPGREP = '@vscode/ripgrep';
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

    constructor(options: NativeWebpackPluginOptions) {
        this.options = options;
        cleanTmp();
        for (const [name, value] of Object.entries(options.nativeBindings ?? {})) {
            this.nativeBinding(name, value);
        }
    }

    nativeBinding(dependency: string, nodePath: string): void {
        this.bindings.set(dependency, nodePath);
    }

    apply(compiler: Compiler): void {
        if (this.options.ripgrep) {
            compiler.hooks.afterEmit.tapAsync(NativeWebpackPlugin.name, () => this.copyRipgrep(compiler));
        }
        if (this.options.pty) {
            compiler.hooks.afterEmit.tapAsync(NativeWebpackPlugin.name, () => this.copyNodePtySpawnHelper(compiler));
        }
        const bindingsFile = buildFile('bindings.js', bindingsReplacement(Array.from(this.bindings.entries())));
        const ripgrepFile = buildFile('ripgrep.js', ripgrepReplacement(this.options.out));
        const keymappingFile = './build/Release/keymapping.node';
        const replacements = {
            ...(this.options.replacements ?? {}),
            [REQUIRE_RIPGREP]: ripgrepFile,
            [REQUIRE_BINDINGS]: bindingsFile,
            [REQUIRE_KEYMAPPING]: keymappingFile
        };
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
    }

    protected async copyRipgrep(compiler: Compiler): Promise<void> {
        const suffix = process.platform === 'win32' ? '.exe' : '';
        const sourceFile = require.resolve(`@vscode/ripgrep/bin/rg${suffix}`);
        const targetFile = path.join(compiler.outputPath, this.options.out, `rg${suffix}`);
        await this.copyExecutable(sourceFile, targetFile);
    }

    protected async copyNodePtySpawnHelper(compiler: Compiler): Promise<void> {
        if (process.platform !== 'win32') {
            const sourceFile = require.resolve('node-pty/build/Release/spawn-helper');
            const targetFile = path.resolve(compiler.outputPath, '..', 'build', 'Release', 'spawn-helper');
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

function cleanTmp(): void {
    const tmp = tmpDir();
    if (fs.existsSync(tmp)) {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

function buildFile(name: string, content: string): string {
    const tmpFile = tmpDir(name);
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
${cases.join(EOL)}
    }
    throw new Error(\`unhandled module: "\${jsModule}"\`);
}`.trim();
};

function tmpDir(...segments: string[]): string {
    const dir = path.resolve(__dirname, '..', 'tmp');
    const file = path.resolve(dir, ...segments);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
    return file;
}
