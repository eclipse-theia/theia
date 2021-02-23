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

import { interfaces } from '@theia/core/shared/inversify';
import { StorageMain } from '../../common/plugin-api-rpc';
import { PluginServer, PluginStorageKind } from '../../common/plugin-protocol';
import { KeysToAnyValues, KeysToKeysToAnyValue } from '../../common/types';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';

export class StorageMainImpl implements StorageMain {

    private readonly pluginServer: PluginServer;
    private readonly workspaceService: WorkspaceService;

    constructor(container: interfaces.Container) {
        this.pluginServer = container.get(PluginServer);
        this.workspaceService = container.get(WorkspaceService);
    }

    $set(key: string, value: KeysToAnyValues, isGlobal: boolean): Promise<boolean> {
        return this.pluginServer.setStorageValue(key, value, this.toKind(isGlobal));
    }

    $get(key: string, isGlobal: boolean): Promise<KeysToAnyValues> {
        return this.pluginServer.getStorageValue(key, this.toKind(isGlobal));
    }

    $getAll(isGlobal: boolean): Promise<KeysToKeysToAnyValue> {
        return this.pluginServer.getAllStorageValues(this.toKind(isGlobal));
    }

    protected toKind(isGlobal: boolean): PluginStorageKind {
        if (isGlobal) {
            return undefined;
        }
        return {
            workspace: this.workspaceService.workspace?.resource.toString(),
            roots: this.workspaceService.tryGetRoots().map(root => root.resource.toString())
        };
    }

}
