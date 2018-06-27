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

import {
    PreferenceService,
    PreferenceServiceImpl,
    PreferenceScope
} from '@theia/core/lib/browser/preferences';
import { interfaces } from 'inversify';
import {
    MAIN_RPC_CONTEXT,
    PreferenceRegistryExt,
    PreferenceRegistryMain,
} from '../../api/plugin-api';
import { RPCProtocol } from '../../api/rpc-protocol';
import { ConfigurationTarget } from '../../plugin/types-impl';

export class PreferenceRegistryMainImpl implements PreferenceRegistryMain {
    private proxy: PreferenceRegistryExt;
    private preferenceService: PreferenceService;

    constructor(prc: RPCProtocol, container: interfaces.Container) {
        this.proxy = prc.getProxy(MAIN_RPC_CONTEXT.PREFERENCE_REGISTRY_EXT);
        this.preferenceService = container.get(PreferenceService);
        const preferenceServiceImpl = container.get(PreferenceServiceImpl);

        preferenceServiceImpl.onPreferenceChanged(e => {
            this.proxy.$acceptConfigurationChanged(preferenceServiceImpl.getPreferences(), e);
        });
    }

    $updateConfigurationOption(target: boolean | ConfigurationTarget | undefined, key: string, value: any): PromiseLike<void> {
        const scope = this.parseConfigurationTarget(target);
        return this.preferenceService.set(key, value, scope);
    }

    $removeConfigurationOption(target: boolean | ConfigurationTarget | undefined, key: string): PromiseLike<void> {
        const scope = this.parseConfigurationTarget(target);
        return this.preferenceService.set(key, undefined, scope);
    }

    private parseConfigurationTarget(arg?: boolean | ConfigurationTarget): PreferenceScope {
        if (arg === void 0 || arg === null) {
            return PreferenceScope.Workspace;
        }
        if (typeof arg === 'boolean') {
            return arg ? PreferenceScope.User : PreferenceScope.Workspace;
        }

        if (arg === ConfigurationTarget.User) {
            return PreferenceScope.User;
        } else {
            return PreferenceScope.Workspace;
        }
    }

}
