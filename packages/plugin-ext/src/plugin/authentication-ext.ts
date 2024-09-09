// *****************************************************************************
// Copyright (C) 2020 Red Hat, Inc. and others.
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// code copied and modified from https://github.com/microsoft/vscode/blob/1.47.3/src/vs/workbench/api/common/extHostAuthentication.ts

import { Disposable } from './types-impl';
import {
    AuthenticationExt,
    AuthenticationMain, Plugin as InternalPlugin,
    PLUGIN_RPC_CONTEXT
} from '../common/plugin-api-rpc';
import { RPCProtocol } from '../common/rpc-protocol';
import { Emitter, Event } from '@theia/core/lib/common/event';
import * as theia from '@theia/plugin';

export class AuthenticationExtImpl implements AuthenticationExt {
    private proxy: AuthenticationMain;
    private authenticationProviders: Map<string, theia.AuthenticationProvider> = new Map<string, theia.AuthenticationProvider>();

    private onDidChangeSessionsEmitter = new Emitter<theia.AuthenticationSessionsChangeEvent>();
    readonly onDidChangeSessions: Event<theia.AuthenticationSessionsChangeEvent> = this.onDidChangeSessionsEmitter.event;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.AUTHENTICATION_MAIN);
    }

    async getSession(requestingExtension: InternalPlugin, providerId: string, scopes: readonly string[],
        options: theia.AuthenticationGetSessionOptions & ({ createIfNone: true } | { forceNewSession: true } | { forceNewSession: theia.AuthenticationForceNewSessionOptions })):
        Promise<theia.AuthenticationSession>;
    async getSession(requestingExtension: InternalPlugin, providerId: string, scopes: readonly string[],
        options: theia.AuthenticationGetSessionOptions & { forceNewSession: true }): Promise<theia.AuthenticationSession>;
    async getSession(requestingExtension: InternalPlugin, providerId: string, scopes: readonly string[],
        options: theia.AuthenticationGetSessionOptions & { forceNewSession: theia.AuthenticationForceNewSessionOptions }): Promise<theia.AuthenticationSession>;
    async getSession(requestingExtension: InternalPlugin, providerId: string, scopes: readonly string[],
        options: theia.AuthenticationGetSessionOptions): Promise<theia.AuthenticationSession | undefined>;
    async getSession(requestingExtension: InternalPlugin, providerId: string, scopes: readonly string[],
        options: theia.AuthenticationGetSessionOptions = {}): Promise<theia.AuthenticationSession | undefined> {
        const extensionName = requestingExtension.model.displayName || requestingExtension.model.name;
        const extensionId = requestingExtension.model.id.toLowerCase();
        return this.proxy.$getSession(providerId, scopes, extensionId, extensionName, options);
    }

    getAccounts(providerId: string): Thenable<readonly theia.AuthenticationSessionAccountInformation[]> {
        return this.proxy.$getAccounts(providerId);
    }

    registerAuthenticationProvider(id: string, label: string, provider: theia.AuthenticationProvider, options?: theia.AuthenticationProviderOptions): theia.Disposable {
        if (this.authenticationProviders.get(id)) {
            throw new Error(`An authentication provider with id '${id}' is already registered.`);
        }

        this.authenticationProviders.set(id, provider);

        provider.getSessions(undefined, {}).then(sessions => { // sessions might have been restored from secret storage
            if (sessions.length > 0) {
                this.proxy.$onDidChangeSessions(id, {
                    added: sessions,
                    removed: [],
                    changed: []
                });
            }
        });

        const listener = provider.onDidChangeSessions(e => {
            this.proxy.$onDidChangeSessions(id, e);
        });

        this.proxy.$registerAuthenticationProvider(id, label, !!options?.supportsMultipleAccounts);

        return new Disposable(() => {
            listener.dispose();
            this.authenticationProviders.delete(id);
            this.proxy.$unregisterAuthenticationProvider(id);
        });
    }

    $createSession(providerId: string, scopes: string[], options: theia.AuthenticationProviderSessionOptions): Promise<theia.AuthenticationSession> {
        const authProvider = this.authenticationProviders.get(providerId);
        if (authProvider) {
            return Promise.resolve(authProvider.createSession(scopes, options));
        }

        throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
    }

    $removeSession(providerId: string, sessionId: string): Promise<void> {
        const authProvider = this.authenticationProviders.get(providerId);
        if (authProvider) {
            return Promise.resolve(authProvider.removeSession(sessionId));
        }

        throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
    }

    async $getSessions(providerId: string, scopes: string[] | undefined, options: theia.AuthenticationProviderSessionOptions): Promise<ReadonlyArray<theia.AuthenticationSession>> {
        const authProvider = this.authenticationProviders.get(providerId);
        if (authProvider) {
            const sessions = await authProvider.getSessions(scopes, options);

            /* Wrap the session object received from the plugin to prevent serialization mismatches
            e.g. if the plugin object is constructed with the help of getters they won't be serialized:
            class SessionImpl implements AuthenticationSession {
                private _id;
                get id() {
                    return _id;
                }
            ...
            } will translate to JSON as { _id: '<sessionid>' } not { id: '<sessionid>' } */
            return sessions.map(session => ({
                id: session.id,
                accessToken: session.accessToken,
                account: { id: session.account.id, label: session.account.label },
                scopes: session.scopes
            }));
        }

        throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
    }

    async $onDidChangeAuthenticationSessions(provider: theia.AuthenticationProviderInformation): Promise<void> {
        this.onDidChangeSessionsEmitter.fire({ provider });
    }
}
