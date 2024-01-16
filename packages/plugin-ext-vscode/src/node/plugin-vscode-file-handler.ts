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

import { PluginDeployerFileHandler, PluginDeployerEntry, PluginDeployerFileHandlerContext } from '@theia/plugin-ext';
import * as filenamify from 'filenamify';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as fs from '@theia/core/shared/fs-extra';
import { PluginVSCodeEnvironment } from '../common/plugin-vscode-environment';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { unpackToDeploymentDir } from './plugin-vscode-utils';

export const isVSCodePluginFile = (pluginPath?: string) => Boolean(pluginPath && (pluginPath.endsWith('.vsix') || pluginPath.endsWith('.tgz')));

@injectable()
export class PluginVsCodeFileHandler implements PluginDeployerFileHandler {
    @inject(PluginVSCodeEnvironment)
    protected readonly environment: PluginVSCodeEnvironment;

    async accept(resolvedPlugin: PluginDeployerEntry): Promise<boolean> {
        return resolvedPlugin.isFile().then(file => {
            if (!file) {
                return false;
            }
            return isVSCodePluginFile(resolvedPlugin.path());
        });
    }

    async handle(context: PluginDeployerFileHandlerContext): Promise<void> {
        const id = this.getNormalizedExtensionId(context.pluginEntry().id());
        const extensionDeploymentDir = await unpackToDeploymentDir(this.environment, context.pluginEntry().path(), id);
        context.pluginEntry().updatePath(extensionDeploymentDir);
        console.log(`root path: ${context.pluginEntry().rootPath}`);
        const originalPath = context.pluginEntry().originalPath();
        if (originalPath && originalPath !== extensionDeploymentDir) {
            const tempDirUri = await this.environment.getTempDirUri();
            if (originalPath.startsWith(FileUri.fsPath(tempDirUri))) {
                try {
                    await fs.remove(FileUri.fsPath(originalPath));
                } catch (e) {
                    console.error(`[${id}]: failed to remove temporary files: "${originalPath}"`, e);
                }
            }
        }
    }

    protected getNormalizedExtensionId(pluginId: string): string {
        return filenamify(pluginId, { replacement: '_' }).replace(/\.vsix$/, '');
    }
}
