/********************************************************************************
 * Copyright (C) 2021 Red Hat, Inc. and others.
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// code copied and modified from https://github.com/microsoft/vscode/blob/1.55.2/src/vs/workbench/api/common/extHostSecrets.ts

import { Plugin, PLUGIN_RPC_CONTEXT, SecretsExt, SecretsMain } from '../common/plugin-api-rpc';
import { RPCProtocol } from '../common/rpc-protocol';
import { Event, Emitter } from '@theia/core/lib/common/event';
import * as theia from '@theia/plugin';

export class SecretsExtImpl implements SecretsExt {
    private proxy: SecretsMain;
    private onDidChangePasswordEmitter = new Emitter<{ extensionId: string, key: string }>();
    readonly onDidChangePassword = this.onDidChangePasswordEmitter.event;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.SECRETS_MAIN);
    }

    async $onDidChangePassword(e: { extensionId: string, key: string }): Promise<void> {
        this.onDidChangePasswordEmitter.fire(e);
    }

    get(extensionId: string, key: string): Promise<string | undefined> {
        return this.proxy.$getPassword(extensionId, key);
    }

    store(extensionId: string, key: string, value: string): Promise<void> {
        return this.proxy.$setPassword(extensionId, key, value);
    }

    delete(extensionId: string, key: string): Promise<void> {
        return this.proxy.$deletePassword(extensionId, key);
    }
}

export class SecretStorageExt implements theia.SecretStorage {

    protected readonly id: string;
    readonly secretState: SecretsExtImpl;

    private onDidChangeEmitter = new Emitter<theia.SecretStorageChangeEvent>();
    readonly onDidChange: Event<theia.SecretStorageChangeEvent> = this.onDidChangeEmitter.event;

    constructor(pluginDescription: Plugin, secretState: SecretsExtImpl) {
        this.id = pluginDescription.model.id.toLowerCase();
        this.secretState = secretState;

        this.secretState.onDidChangePassword(e => {
            if (e.extensionId === this.id) {
                this.onDidChangeEmitter.fire({ key: e.key });
            }
        });
    }

    get(key: string): Promise<string | undefined> {
        return this.secretState.get(this.id, key);
    }

    store(key: string, value: string): Promise<void> {
        return this.secretState.store(this.id, key, value);
    }

    delete(key: string): Promise<void> {
        return this.secretState.delete(this.id, key);
    }
}
