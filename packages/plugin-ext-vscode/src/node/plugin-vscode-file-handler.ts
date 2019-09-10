/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { PluginDeployerFileHandler, PluginDeployerEntry, PluginDeployerFileHandlerContext } from '@theia/plugin-ext';
import { injectable } from 'inversify';
import * as fs from 'fs-extra';
import * as path from 'path';
import { getTempDir } from '@theia/plugin-ext/lib/main/node/temp-dir-util';

@injectable()
export class PluginVsCodeFileHandler implements PluginDeployerFileHandler {

    private unpackedFolder: string;
    constructor() {
        this.unpackedFolder = getTempDir('vscode-unpacked');
    }

    accept(resolvedPlugin: PluginDeployerEntry): boolean {
        if (!resolvedPlugin.isFile()) {
            return false;
        }
        const pluginPath = resolvedPlugin.path();
        return !!pluginPath && pluginPath.endsWith('.vsix') || pluginPath.endsWith('.tgz');
    }

    async handle(context: PluginDeployerFileHandlerContext): Promise<void> {
        const unpackedPath = path.resolve(this.unpackedFolder, path.basename(context.pluginEntry().path()));
        console.log(`unzipping the VS Code extension '${path.basename(context.pluginEntry().path())}' to directory: ${unpackedPath}`);

        await context.unzip(context.pluginEntry().path(), unpackedPath);
        if (context.pluginEntry().path().endsWith('.tgz')) {
            const extensionPath = path.join(unpackedPath, 'package');
            const vscodeNodeModulesPath = path.join(extensionPath, 'vscode_node_modules.zip');
            if (await fs.pathExists(vscodeNodeModulesPath)) {
                await context.unzip(vscodeNodeModulesPath, path.join(extensionPath, 'node_modules'));
            }
        }

        context.pluginEntry().updatePath(unpackedPath);
        return Promise.resolve();
    }
}
