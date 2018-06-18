/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
