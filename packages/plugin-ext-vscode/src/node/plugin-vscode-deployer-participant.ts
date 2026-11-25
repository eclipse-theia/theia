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

import { injectable, inject, named } from '@theia/core/shared/inversify';
import * as fs from '@theia/core/shared/fs-extra';
import { FileUri } from '@theia/core/lib/node';
import { PluginVSCodeEnvironment } from '../common/plugin-vscode-environment.js';
import { PluginDeployerParticipant, PluginDeployerStartContext, PluginIdentifiers } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { ArchiveExtractor } from '@theia/filesystem/lib/node/archive/archive-extractor';
import { LocalVSIXFilePluginDeployerResolver } from './local-vsix-file-plugin-deployer-resolver.js';
import { existsInDeploymentDir, extractExtensionIdentityFromVsix } from './plugin-vscode-utils.js';
import { ILogger } from '@theia/core';

@injectable()
export class PluginVSCodeDeployerParticipant implements PluginDeployerParticipant {

    @inject(PluginVSCodeEnvironment)
    protected readonly environments: PluginVSCodeEnvironment;

    @inject(ILogger) @named('plugin-ext-vscode:PluginVSCodeDeployerParticipant')
    protected readonly logger: ILogger;

    @inject(ArchiveExtractor)
    protected readonly archiveExtractor: ArchiveExtractor;

    async onWillStart(context: PluginDeployerStartContext): Promise<void> {
        const extensionDeploymentDirUri = await this.environments.getDeploymentDirUri();
        context.userEntries.push(extensionDeploymentDirUri.withScheme('local-dir').toString());

        const userExtensionDirUri = await this.environments.getUserExtensionsDirUri();
        const userExtensionDirPath = FileUri.fsPath(userExtensionDirUri);

        if (await fs.pathExists(userExtensionDirPath)) {
            const files = await fs.readdir(userExtensionDirPath);
            for (const file of files) {
                if (file.endsWith(LocalVSIXFilePluginDeployerResolver.FILE_EXTENSION)) {
                    const fileUri = userExtensionDirUri.resolve(file);
                    if (await this.isDeployedDropIn(FileUri.fsPath(fileUri))) {
                        this.logger.info(`skipping drop-in extension "${fileUri}": it is already deployed`);
                        continue;
                    }
                    const extensionUri = fileUri.withScheme('local-file').toString();
                    this.logger.info(`found drop-in extension "${extensionUri}"`);
                    context.userEntries.push(extensionUri);
                }
            }
        }
    }

    /**
     * The resolver of `local-file` entries replaces an extension that is already deployed.
     * A drop-in is passed at every start, so a deployed drop-in is left out: the `local-dir` entry of the deployment directory loads it.
     */
    protected async isDeployedDropIn(vsixPath: string): Promise<boolean> {
        const components = await extractExtensionIdentityFromVsix(vsixPath, this.archiveExtractor);
        return !!components && existsInDeploymentDir(this.environments, PluginIdentifiers.componentsToVersionedId(components));
    }
}
