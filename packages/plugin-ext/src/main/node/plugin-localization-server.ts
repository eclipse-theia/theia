// *****************************************************************************
// Copyright (C) 2021 TypeFox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { PluginDeployer } from '../../common/plugin-protocol';
import { PluginDeployerImpl } from './plugin-deployer-impl';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { LocalizationServerImpl } from '@theia/core/lib/node/i18n/localization-server';

@injectable()
export class PluginLocalizationServer extends LocalizationServerImpl {
    @inject(PluginDeployer)
    protected readonly pluginDeployer: PluginDeployerImpl;
    protected readonly pluginsDeployed = new Deferred();

    override async initialize(): Promise<void> {
        this.pluginDeployer.onDidDeploy(() => {
            this.pluginsDeployed.resolve();
        });
        await super.initialize();
    }

    override async waitForInitialization(): Promise<void> {
        await Promise.all([
            super.waitForInitialization(),
            this.pluginsDeployed.promise,
        ]);
    }
}
