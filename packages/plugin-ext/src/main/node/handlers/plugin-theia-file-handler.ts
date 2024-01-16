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

import { PluginDeployerFileHandler, PluginDeployerEntry, PluginDeployerFileHandlerContext, PluginType } from '../../../common/plugin-protocol';
import type { URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { getTempDirPathAsync } from '../temp-dir-util';
import * as fs from '@theia/core/shared/fs-extra';
import * as filenamify from 'filenamify';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { PluginTheiaEnvironment } from '../../common/plugin-theia-environment';

@injectable()
export class PluginTheiaFileHandler implements PluginDeployerFileHandler {

    private readonly systemPluginsDirUri: Deferred<URI>;

    @inject(PluginTheiaEnvironment)
    protected readonly environment: PluginTheiaEnvironment;

    constructor() {
        this.systemPluginsDirUri = new Deferred();
        getTempDirPathAsync('theia-unpacked')
            .then(systemPluginsDirPath => this.systemPluginsDirUri.resolve(FileUri.create(systemPluginsDirPath)));
    }

    async accept(resolvedPlugin: PluginDeployerEntry): Promise<boolean> {
        if (resolvedPlugin.path() !== null && resolvedPlugin.path().endsWith('.theia')) {
            return resolvedPlugin.isFile();
        }
        return false;
    }

    async handle(context: PluginDeployerFileHandlerContext): Promise<void> {
        const id = context.pluginEntry().id();
        const pluginDir = await this.getPluginDir(context);
        console.log(`[${id}]: trying to decompress into "${pluginDir}"...`);
        if (context.pluginEntry().type === PluginType.User && await fs.pathExists(pluginDir)) {
            console.log(`[${id}]: already found`);
            context.pluginEntry().updatePath(pluginDir);
            return;
        }
        await context.unzip(context.pluginEntry().path(), pluginDir);
        console.log(`[${id}]: decompressed`);
        context.pluginEntry().updatePath(pluginDir);
    }

    protected async getPluginDir(context: PluginDeployerFileHandlerContext): Promise<string> {
        const systemPluginsDirUri = await this.systemPluginsDirUri.promise;
        return FileUri.fsPath(systemPluginsDirUri.resolve(filenamify(context.pluginEntry().id(), { replacement: '_' })));
    }
}
