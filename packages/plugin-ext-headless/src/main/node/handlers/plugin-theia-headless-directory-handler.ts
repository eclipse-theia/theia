// *****************************************************************************
// Copyright (C) 2024 EclipseSource and others.
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

import { injectable } from '@theia/core/shared/inversify';

import { PluginDeployerDirectoryHandlerContext, PluginDeployerEntryType, PluginPackage } from '@theia/plugin-ext';
import { AbstractPluginDirectoryHandler } from '@theia/plugin-ext/lib/main/node/handlers/plugin-theia-directory-handler';

@injectable()
export class PluginTheiaHeadlessDirectoryHandler extends AbstractPluginDirectoryHandler {

    protected acceptManifest(plugin: PluginPackage): boolean {
        return plugin?.engines?.theiaPlugin === undefined && 'theiaHeadlessPlugin' in plugin.engines;
    }

    async handle(context: PluginDeployerDirectoryHandlerContext): Promise<void> {
        await this.copyDirectory(context);
        const types: PluginDeployerEntryType[] = [PluginDeployerEntryType.HEADLESS];
        context.pluginEntry().accept(...types);
    }

}
