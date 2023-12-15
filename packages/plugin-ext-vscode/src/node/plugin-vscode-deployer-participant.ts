// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import * as fs from '@theia/core/shared/fs-extra';
import { FileUri } from '@theia/core/lib/node';
import { PluginVSCodeEnvironment } from '../common/plugin-vscode-environment';
import { PluginDeployerParticipant, PluginDeployerStartContext } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { LocalVSIXFilePluginDeployerResolver } from './local-vsix-file-plugin-deployer-resolver';

@injectable()
export class PluginVSCodeDeployerParticipant implements PluginDeployerParticipant {

    @inject(PluginVSCodeEnvironment)
    protected readonly environments: PluginVSCodeEnvironment;

    async onWillStart(context: PluginDeployerStartContext): Promise<void> {
        const extensionDeploymentDirUri = await this.environments.getDeploymentDirUri();
        context.userEntries.push(extensionDeploymentDirUri.withScheme('local-dir').toString());

        const userExtensionDirUri = await this.environments.getUserExtensionsDirUri();
        const userExtensionDirPath = FileUri.fsPath(userExtensionDirUri);

        if (await fs.pathExists(userExtensionDirPath)) {
            const files = await fs.readdir(userExtensionDirPath);
            for (const file of files) {
                if (file.endsWith(LocalVSIXFilePluginDeployerResolver.FILE_EXTENSION)) {
                    const extensionUri = userExtensionDirUri.resolve(file).withScheme('local-file').toString();
                    console.log(`found drop-in extension "${extensionUri}"`);
                    context.userEntries.push(extensionUri);
                }
            }
        }
    }
}
