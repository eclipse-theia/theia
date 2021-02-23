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

import { PluginDeployerResolverContext } from '../../../common/plugin-protocol';
import { injectable } from '@theia/core/shared/inversify';
import * as fs from '@theia/core/shared/fs-extra';
import * as path from 'path';
import { LocalPluginDeployerResolver } from './local-plugin-deployer-resolver';

@injectable()
export class LocalDirectoryPluginDeployerResolver extends LocalPluginDeployerResolver {
    static LOCAL_DIR = 'local-dir';

    protected get supportedScheme(): string {
        return LocalDirectoryPluginDeployerResolver.LOCAL_DIR;
    }

    protected async resolveFromLocalPath(pluginResolverContext: PluginDeployerResolverContext, localPath: string): Promise<void> {
        const files = await fs.readdir(localPath);
        files.forEach(file =>
            pluginResolverContext.addPlugin(file, path.resolve(localPath, file))
        );
    }
}
