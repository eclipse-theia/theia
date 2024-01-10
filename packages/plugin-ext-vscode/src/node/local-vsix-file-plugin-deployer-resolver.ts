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

import * as path from 'path';
import { inject, injectable } from '@theia/core/shared/inversify';
import { PluginDeployerResolverContext } from '@theia/plugin-ext';
import { LocalPluginDeployerResolver } from '@theia/plugin-ext/lib/main/node/resolvers/local-plugin-deployer-resolver';
import { PluginVSCodeEnvironment } from '../common/plugin-vscode-environment';
import { isVSCodePluginFile } from './plugin-vscode-file-handler';
import { existsInDeploymentDir, unpackToDeploymentDir } from './plugin-vscode-utils';

@injectable()
export class LocalVSIXFilePluginDeployerResolver extends LocalPluginDeployerResolver {
    static LOCAL_FILE = 'local-file';
    static FILE_EXTENSION = '.vsix';

    @inject(PluginVSCodeEnvironment) protected readonly environment: PluginVSCodeEnvironment;

    protected get supportedScheme(): string {
        return LocalVSIXFilePluginDeployerResolver.LOCAL_FILE;
    }

    override accept(pluginId: string): boolean {
        return super.accept(pluginId) && isVSCodePluginFile(pluginId);
    }

    async resolveFromLocalPath(pluginResolverContext: PluginDeployerResolverContext, localPath: string): Promise<void> {
        const extensionId = path.basename(localPath, LocalVSIXFilePluginDeployerResolver.FILE_EXTENSION);

        if (await existsInDeploymentDir(this.environment, extensionId)) {
            console.log(`[${pluginResolverContext.getOriginId()}]: Target dir already exists in plugin deployment dir`);
            return;
        }

        const extensionDeploymentDir = await unpackToDeploymentDir(this.environment, localPath, extensionId);
        pluginResolverContext.addPlugin(extensionId, extensionDeploymentDir);
    }
}
