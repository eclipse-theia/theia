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

import { dynamicRequire } from '@theia/core/lib/node/dynamic-require';
import { ContainerModule, injectable, inject } from '@theia/core/shared/inversify';
import { EnvExtImpl } from '@theia/plugin-ext/lib/plugin/env';
import { LocalizationExt } from '@theia/plugin-ext';
import { LocalizationExtImpl } from '@theia/plugin-ext/lib/plugin/localization-ext';
import { HEADLESSMAIN_RPC_CONTEXT } from '../../common/headless-plugin-rpc';
import { HeadlessPluginManagerExtImpl } from '../../plugin/headless-plugin-manager';
import { AbstractPluginHostRPC, ExtInterfaces } from '@theia/plugin-ext/lib/hosted/node/plugin-host-rpc';
import { PluginModel } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { ExtPluginApi, ExtPluginApiHeadlessInitializationFn } from '../../common/plugin-ext-headless-api-contribution';

type HeadlessExtInterfaces = Pick<ExtInterfaces, 'envExt'|'localizationExt'>;

/**
 * The RPC handler for headless plugins.
 */
@injectable()
export class HeadlessPluginHostRPC extends AbstractPluginHostRPC<HeadlessPluginManagerExtImpl, null, HeadlessExtInterfaces> {
    @inject(EnvExtImpl)
    protected readonly envExt: EnvExtImpl;

    @inject(LocalizationExt)
    protected readonly localizationExt: LocalizationExtImpl;

    constructor() {
        super('HEADLESS_PLUGIN_HOST', undefined,
            {
                $pluginManager: HEADLESSMAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT,
            }
        );
    }

    protected createExtInterfaces(): HeadlessExtInterfaces {
        return {
            envExt: this.envExt,
            localizationExt: this.localizationExt
        };
    }

    protected createAPIFactory(_extInterfaces: HeadlessExtInterfaces): null {
        // As yet there is no default API namespace for backend plugins to access the Theia framework
        return null;
    }

    protected override getBackendPluginPath(pluginModel: PluginModel): string | undefined {
        return pluginModel.entryPoint.headless;
    }

    protected initExtApi(extApi: ExtPluginApi): void {
        interface PluginExports {
            containerModule?: ContainerModule;
            provideApi?: ExtPluginApiHeadlessInitializationFn;
        }
        if (extApi.headlessInitPath) {
            const { containerModule, provideApi } = dynamicRequire<PluginExports>(extApi.headlessInitPath);
            if (containerModule) {
                this.loadContainerModule(containerModule);
            }
            if (provideApi) {
                provideApi(this.rpc, this.pluginManager);
            }
        }
    }
}
