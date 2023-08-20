// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import { PluginDeployerFileHandler, PluginDeployerEntry, PluginDeployerFileHandlerContext, PluginType } from '@theia/plugin-ext';
import * as fs from '@theia/core/shared/fs-extra';
import * as path from 'path';
import * as filenamify from 'filenamify';
import type { URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { getTempDirPathAsync } from '@theia/plugin-ext/lib/main/node/temp-dir-util';
import { PluginVSCodeEnvironment } from '../common/plugin-vscode-environment';
import { FileUri } from '@theia/core/lib/node/file-uri';

export const isVSCodePluginFile = (pluginPath?: string) => Boolean(pluginPath && (pluginPath.endsWith('.vsix') || pluginPath.endsWith('.tgz')));

@injectable()
export class PluginVsCodeFileHandler implements PluginDeployerFileHandler {

    @inject(PluginVSCodeEnvironment)
    protected readonly environment: PluginVSCodeEnvironment;

    private readonly systemExtensionsDirUri: Deferred<URI>;

    constructor() {
        this.systemExtensionsDirUri = new Deferred();
        getTempDirPathAsync('vscode-unpacked')
            .then(systemExtensionsDirPath => this.systemExtensionsDirUri.resolve(FileUri.create(systemExtensionsDirPath)));
    }

    async accept(resolvedPlugin: PluginDeployerEntry): Promise<boolean> {
        return resolvedPlugin.isFile().then(file => {
            if (!file) {
                return false;
            }
            return isVSCodePluginFile(resolvedPlugin.path());
        });
    }

    async handle(context: PluginDeployerFileHandlerContext): Promise<void> {
        const id = context.pluginEntry().id();
        const extensionDir = await this.getExtensionDir(context);
        console.log(`[${id}]: trying to decompress into "${extensionDir}"...`);
        if (context.pluginEntry().type === PluginType.User && await fs.pathExists(extensionDir)) {
            console.log(`[${id}]: already found`);
            context.pluginEntry().updatePath(extensionDir);
            return;
        }
        await this.decompress(extensionDir, context);
        console.log(`[${id}]: decompressed`);
        context.pluginEntry().updatePath(extensionDir);
    }

    protected async getExtensionDir(context: PluginDeployerFileHandlerContext): Promise<string> {
        const systemExtensionsDirUri = await this.systemExtensionsDirUri.promise;
        return FileUri.fsPath(systemExtensionsDirUri.resolve(filenamify(context.pluginEntry().id(), { replacement: '_' })));
    }

    protected async decompress(extensionDir: string, context: PluginDeployerFileHandlerContext): Promise<void> {
        await context.unzip(context.pluginEntry().path(), extensionDir);
        if (context.pluginEntry().path().endsWith('.tgz')) {
            const extensionPath = path.join(extensionDir, 'package');
            const vscodeNodeModulesPath = path.join(extensionPath, 'vscode_node_modules.zip');
            if (await fs.pathExists(vscodeNodeModulesPath)) {
                await context.unzip(vscodeNodeModulesPath, path.join(extensionPath, 'node_modules'));
            }
        }
    }

}
