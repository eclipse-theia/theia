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
import { interfaces } from '@theia/core/shared/inversify';
import {
    MAIN_RPC_CONTEXT,
    PreferenceRegistryExt,
    PreferenceRegistryMain,
    PreferenceData,
    PreferenceChangeExt,
} from '../../common/plugin-api-rpc';
import { RPCProtocol } from '../../common/rpc-protocol';
import { ConfigurationTarget } from '../../plugin/types-impl';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';

export function getPreferences(preferenceProviderProvider: PreferenceProviderProvider, rootFolders: FileStat[]): PreferenceData {
    const folders = rootFolders.map(root => root.resource.toString());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export class PreferenceRegistryMainImpl implements PreferenceRegistryMain, Disposable {
    private readonly proxy: PreferenceRegistryExt;
    private readonly preferenceService: PreferenceService;

    protected readonly toDispose = new DisposableCollection();

    constructor(prc: RPCProtocol, container: interfaces.Container) {
        this.proxy = prc.getProxy(MAIN_RPC_CONTEXT.PREFERENCE_REGISTRY_EXT);
        this.preferenceService = container.get(PreferenceService);
        const preferenceProviderProvider = container.get<PreferenceProviderProvider>(PreferenceProviderProvider);
        const preferenceServiceImpl = container.get(PreferenceServiceImpl);
        const workspaceService = container.get(WorkspaceService);

        this.toDispose.push(preferenceServiceImpl.onPreferencesChanged(changes => {
            // it HAS to be synchronous to propagate changes before update/remove response

            const roots = workspaceService.tryGetRoots();
            const data = getPreferences(preferenceProviderProvider, roots);
            const eventData: PreferenceChangeExt[] = [];
            for (const preferenceName of Object.keys(changes)) {
                const { newValue } = changes[preferenceName];
                eventData.push({ preferenceName, newValue });
            }
            this.proxy.$acceptConfigurationChanged(data, eventData);
        }));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async $updateConfigurationOption(target: boolean | ConfigurationTarget | undefined, key: string, value: any, resource?: string): Promise<void> {
        const scope = this.parseConfigurationTarget(target);
        await this.preferenceService.set(key, value, scope, resource);
    }

    async $removeConfigurationOption(target: boolean | ConfigurationTarget | undefined, key: string, resource?: string): Promise<void> {
        const scope = this.parseConfigurationTarget(target);
        await this.preferenceService.set(key, undefined, scope, resource);
    }

    private parseConfigurationTarget(target?: boolean | ConfigurationTarget): PreferenceScope | undefined {
        if (typeof target === 'boolean') {
            return target ? PreferenceScope.User : PreferenceScope.Workspace;
        }
        switch (target) {
            case ConfigurationTarget.Global:
                return PreferenceScope.User;
            case ConfigurationTarget.Workspace:
                return PreferenceScope.Workspace;
            case ConfigurationTarget.WorkspaceFolder:
                return PreferenceScope.Folder;
            default:
                // PreferenceService knows how to deal with undefined in VS Code compatible way
                return undefined;
        }
    }

}
