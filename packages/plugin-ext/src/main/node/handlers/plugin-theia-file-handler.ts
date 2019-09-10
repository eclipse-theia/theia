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

import { PluginDeployerFileHandler, PluginDeployerEntry, PluginDeployerFileHandlerContext } from '../../../common/plugin-protocol';
import { injectable } from 'inversify';
import { getTempDir } from '../temp-dir-util';
import * as path from 'path';

@injectable()
export class PluginTheiaFileHandler implements PluginDeployerFileHandler {

    private unpackedFolder: string;
    constructor() {
        this.unpackedFolder = getTempDir('theia-unpacked');
    }

    accept(resolvedPlugin: PluginDeployerEntry): boolean {
        return resolvedPlugin.isFile() && resolvedPlugin.path() !== null && resolvedPlugin.path().endsWith('.theia');
    }

    async handle(context: PluginDeployerFileHandlerContext): Promise<void> {
        const unpackedPath = path.resolve(this.unpackedFolder, path.basename(context.pluginEntry().path()));
        console.log(`unzipping the plug-in '${path.basename(context.pluginEntry().path())}' to directory: ${unpackedPath}`);

        await context.unzip(context.pluginEntry().path(), unpackedPath);

        context.pluginEntry().updatePath(unpackedPath);
        return Promise.resolve();
    }
}
