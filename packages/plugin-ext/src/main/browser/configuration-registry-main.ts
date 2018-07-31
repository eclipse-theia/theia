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

import { interfaces } from 'inversify';
import {
    MAIN_RPC_CONTEXT,
    ConfigurationManagerExt,
    ConfigurationManagerMain,
} from '../../api/plugin-api';
import { RPCProtocol } from '../../api/rpc-protocol';
import { ConfigurationTarget } from '../../plugin/types-impl';
import { ConfigurationService } from '../../hosted/browser/configuration/configuration-service';

export class ConfigurationManagerMainImpl implements ConfigurationManagerMain {
    private proxy: ConfigurationManagerExt;
    private confService: ConfigurationService;

    constructor(prc: RPCProtocol, container: interfaces.Container) {
        this.proxy = prc.getProxy(MAIN_RPC_CONTEXT.PREFERENCE_REGISTRY_EXT);

        this.confService = container.get(ConfigurationService);

        this.confService.onConfigurationChanged(confChanges => {
            this.proxy.$acceptConfigurationChanged(this.confService.getConfiguration(), confChanges);
        });
    }

    $updateConfigurationOption(target: boolean | ConfigurationTarget | undefined, key: string, value: any): PromiseLike<void> {
        return this.confService.updateConfigurationOption(target, key, value);
    }

    $removeConfigurationOption(target: boolean | ConfigurationTarget | undefined, key: string): PromiseLike<void> {
        return this.confService.removeConfigurationOption(target, key);
    }
}
