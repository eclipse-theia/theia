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
    PreferenceScope,
    PreferenceProviderProvider
} from '@theia/core/lib/browser/preferences';
import { interfaces } from 'inversify';
import {
    MAIN_RPC_CONTEXT,
    PreferenceRegistryExt,
    PreferenceRegistryMain,
    PreferenceData,
} from '../../api/plugin-api';
import { RPCProtocol } from '../../api/rpc-protocol';
import { ConfigurationTarget } from '../../plugin/types-impl';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileStat } from '@theia/filesystem/lib/common/filesystem';

export function getPreferences(preferenceProviderProvider: PreferenceProviderProvider, rootFolders: FileStat[]): PreferenceData {
    const folders = rootFolders.map(root => root.uri.toString());
    /* tslint:disable-next-line:no-any */
    return PreferenceScope.getScopes().reduce((result: { [key: number]: any }, scope: PreferenceScope) => {
        result[scope] = {};
        const provider = preferenceProviderProvider(scope);
        if (scope === PreferenceScope.Folder) {
            for (const f of folders) {
                const folderPrefs = provider.getPreferences(f);
                result[scope][f] = folderPrefs;
            }
        } else {
            result[scope] = provider.getPreferences();
        }
        return result;
    }, {} as PreferenceData);
}

export class PreferenceRegistryMainImpl implements PreferenceRegistryMain {
    private proxy: PreferenceRegistryExt;
    private preferenceService: PreferenceService;
    private readonly preferenceProviderProvider: PreferenceProviderProvider;

    constructor(prc: RPCProtocol, container: interfaces.Container) {
        this.proxy = prc.getProxy(MAIN_RPC_CONTEXT.PREFERENCE_REGISTRY_EXT);
        this.preferenceService = container.get(PreferenceService);
        this.preferenceProviderProvider = container.get(PreferenceProviderProvider);
        const preferenceServiceImpl = container.get(PreferenceServiceImpl);
        const workspaceService = container.get(WorkspaceService);

        preferenceServiceImpl.onPreferenceChanged(async e => {
            const roots = await workspaceService.roots;
            const data = getPreferences(this.preferenceProviderProvider, roots);
            this.proxy.$acceptConfigurationChanged(data, {
                preferenceName: e.preferenceName,
                newValue: e.newValue
            });
        });
    }

    // tslint:disable-next-line:no-any
    $updateConfigurationOption(target: boolean | ConfigurationTarget | undefined, key: string, value: any, resource?: string): PromiseLike<void> {
        const scope = this.parseConfigurationTarget(target);
        return this.preferenceService.set(key, value, scope, resource);
    }

    $removeConfigurationOption(target: boolean | ConfigurationTarget | undefined, key: string, resource?: string): PromiseLike<void> {
        const scope = this.parseConfigurationTarget(target);
        return this.preferenceService.set(key, undefined, scope, resource);
    }

    private parseConfigurationTarget(arg?: boolean | ConfigurationTarget): PreferenceScope {
        if (arg === void 0 || arg === null) {
            return PreferenceScope.Workspace;
        }
        if (typeof arg === 'boolean') {
            return arg ? PreferenceScope.User : PreferenceScope.Workspace;
        }

        switch (arg) {
            case ConfigurationTarget.Global:
                return PreferenceScope.User;
            case ConfigurationTarget.Workspace:
                return PreferenceScope.Workspace;
            default:
                return PreferenceScope.Workspace;
        }
    }

}
