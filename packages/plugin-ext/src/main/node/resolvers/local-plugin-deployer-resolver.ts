/********************************************************************************
 * Copyright (C) 2020 Red Hat, Inc. and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { PluginDeployerResolver, PluginDeployerResolverContext } from '../../../common/plugin-protocol';
import * as fs from '@theia/core/shared/fs-extra';
import * as path from 'path';
import { FileUri } from '@theia/core/lib/node';
import URI from '@theia/core/lib/common/uri';

@injectable()
export abstract class LocalPluginDeployerResolver implements PluginDeployerResolver {
    public async resolve(pluginResolverContext: PluginDeployerResolverContext): Promise<void> {
        const localPath = await this.resolveLocalPluginPath(
            pluginResolverContext,
            this.supportedScheme);
        if (localPath) {
            await this.resolveFromLocalPath(pluginResolverContext, localPath);
        }
    }

    public accept(pluginId: string): boolean {
        return pluginId.startsWith(this.supportedScheme);
    }

    protected abstract get supportedScheme(): string;

    protected abstract resolveFromLocalPath(pluginResolverContext: PluginDeployerResolverContext, localPath: string): Promise<void>;

    private async resolveLocalPluginPath(
        pluginResolverContext: PluginDeployerResolverContext,
        expectedScheme: string): Promise<string | null> {
        const localUri = new URI(pluginResolverContext.getOriginId());
        if (localUri.scheme !== expectedScheme) {
            return null;
        }
        let fsPath = FileUri.fsPath(localUri);
        if (!path.isAbsolute(fsPath)) {
            fsPath = path.resolve(process.cwd(), fsPath);
        }
        if (!await fs.pathExists(fsPath)) {
            console.warn(`The local plugin referenced by ${pluginResolverContext.getOriginId()} does not exist.`);
            return null;
        }
        return fsPath;
    }
}
