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
// code copied and modified from https://github.com/microsoft/vscode/blob/1.47.3/src/vs/workbench/api/browser/mainThreadAuthentication.ts

import { interfaces } from '@theia/core/shared/inversify';
import { AuthenticationExt, AuthenticationMain, MAIN_RPC_CONTEXT } from '../../common/plugin-api-rpc';
import { RPCProtocol } from '../../common/rpc-protocol';
import { MessageService } from '@theia/core/lib/common/message-service';
import { ConfirmDialog, Dialog, StorageService } from '@theia/core/lib/browser';
import {
    AuthenticationProvider,
    AuthenticationProviderSessionOptions,
    AuthenticationService,
    AuthenticationSession,
    AuthenticationSessionAccountInformation,
    readAllowedExtensions
} from '@theia/core/lib/browser/authentication-service';
import { QuickPickService } from '@theia/core/lib/common/quick-pick-service';
import * as theia from '@theia/plugin';
import { QuickPickValue } from '@theia/core/lib/browser/quick-input/quick-input-service';
import { nls } from '@theia/core/lib/common/nls';
import { isObject } from '@theia/core';

export function getAuthenticationProviderActivationEvent(id: string): string { return `onAuthenticationRequest:${id}`; }

export class AuthenticationMainImpl implements AuthenticationMain {
    private readonly proxy: AuthenticationExt;
    private readonly messageService: MessageService;
    private readonly storageService: StorageService;
    private readonly authenticationService: AuthenticationService;
    private readonly quickPickService: QuickPickService;
    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.AUTHENTICATION_EXT);
        this.messageService = container.get(MessageService);
        this.storageService = container.get(StorageService);
        this.authenticationService = container.get(AuthenticationService);
        this.quickPickService = container.get(QuickPickService);

        this.authenticationService.onDidChangeSessions(e => {
            this.proxy.$onDidChangeAuthenticationSessions({ id: e.providerId, label: e.label });
        });
    }

    async $registerAuthenticationProvider(id: string, label: string, supportsMultipleAccounts: boolean): Promise<void> {
        const provider = new AuthenticationProviderImpl(this.proxy, id, label, supportsMultipleAccounts, this.storageService, this.messageService);
        this.authenticationService.registerAuthenticationProvider(id, provider);
    }

    async $unregisterAuthenticationProvider(id: string): Promise<void> {
        this.authenticationService.unregisterAuthenticationProvider(id);
    }

    async $updateSessions(id: string, event: theia.AuthenticationProviderAuthenticationSessionsChangeEvent): Promise<void> {
        this.authenticationService.updateSessions(id, event);
    }

    $logout(providerId: string, sessionId: string): Promise<void> {
        return this.authenticationService.logout(providerId, sessionId);
    }

    protected async requestNewSession(providerId: string, scopes: string[], extensionId: string, extensionName: string): Promise<void> {
        return this.authenticationService.requestNewSession(providerId, scopes, extensionId, extensionName);
    }

    $getAccounts(providerId: string): Thenable<readonly theia.AuthenticationSessionAccountInformation[]> {
        return this.authenticationService.getSessions(providerId).then(sessions => sessions.map(session => session.account));
    }

    async $getSession(providerId: string, scopes: string[], extensionId: string, extensionName: string,
        options: theia.AuthenticationGetSessionOptions): Promise<theia.AuthenticationSession | undefined> {
        const sessions = await this.authenticationService.getSessions(providerId, scopes, options?.account);

        // Error cases
        if (options.forceNewSession && !sessions.length) {
            throw new Error('No existing sessions found.');
        }
        if (options.forceNewSession && options.createIfNone) {
            throw new Error('Invalid combination of options. Please remove one of the following: forceNewSession, createIfNone');
        }
        if (options.forceNewSession && options.silent) {
            throw new Error('Invalid combination of options. Please remove one of the following: forceNewSession, silent');
        }
        if (options.createIfNone && options.silent) {
            throw new Error('Invalid combination of options. Please remove one of the following: createIfNone, silent');
        }

        const supportsMultipleAccounts = this.authenticationService.supportsMultipleAccounts(providerId);
        // Check if the sessions we have are valid
        if (!options.forceNewSession && sessions.length) {
            if (supportsMultipleAccounts) {
                if (options.clearSessionPreference) {
                    await this.storageService.setData(`authentication-session-${extensionName}-${providerId}`, undefined);
                } else {
                    const existingSessionPreference = await this.storageService.getData(`authentication-session-${extensionName}-${providerId}`);
                    if (existingSessionPreference) {
                        const matchingSession = sessions.find(session => session.id === existingSessionPreference);
                        if (matchingSession && await this.isAccessAllowed(providerId, matchingSession.account.label, extensionId)) {
                            return matchingSession;
                        }
                    }
                }
            } else if (await this.isAccessAllowed(providerId, sessions[0].account.label, extensionId)) {
                return sessions[0];
            }
        }

        // We may need to prompt because we don't have a valid session modal flows
        if (options.createIfNone || options.forceNewSession) {
            const providerName = this.authenticationService.getLabel(providerId);
            const detail = isAuthenticationForceNewSessionOptions(options.forceNewSession) ? options.forceNewSession!.detail : undefined;
            const isAllowed = await this.loginPrompt(providerName, extensionName, !!options.forceNewSession, detail);
            if (!isAllowed) {
                throw new Error('User did not consent to login.');
            }

            const session = sessions?.length && !options.forceNewSession && supportsMultipleAccounts
                ? await this.selectSession(providerId, providerName, extensionId, extensionName, sessions, scopes, !!options.clearSessionPreference)
                : await this.authenticationService.login(providerId, scopes);
            await this.setTrustedExtensionAndAccountPreference(providerId, session.account.label, extensionId, extensionName, session.id);
            return session;
        }

        // passive flows (silent or default)
        const validSession = sessions.find(s => this.isAccessAllowed(providerId, s.account.label, extensionId));
        if (!options.silent && !validSession) {
            this.authenticationService.requestNewSession(providerId, scopes, extensionId, extensionName);
        }
        return validSession;
    }

    protected async selectSession(providerId: string, providerName: string, extensionId: string, extensionName: string,
        potentialSessions: Readonly<AuthenticationSession[]>, scopes: string[], clearSessionPreference: boolean): Promise<theia.AuthenticationSession> {

        if (!potentialSessions.length) {
            throw new Error('No potential sessions found');
        }

        return new Promise(async (resolve, reject) => {
            const items: QuickPickValue<{ session?: AuthenticationSession, account?: AuthenticationSessionAccountInformation }>[] = potentialSessions.map(session => ({
                label: session.account.label,
                value: { session }
            }));
            items.push({
                label: nls.localizeByDefault('Sign in to another account'),
                value: {}
            });

            // VS Code has code here that pushes accounts that have no active sessions. However, since we do not store
            // any accounts that don't have sessions, we dont' do this.
            const selected = await this.quickPickService.show(items,
                {
                    title: nls.localizeByDefault("The extension '{0}' wants to access a {1} account", extensionName, providerName),
                    ignoreFocusOut: true
                });
            if (selected) {

                // if we ever have accounts without sessions, pass the account to the login call
                const session = selected.value?.session ?? await this.authenticationService.login(providerId, scopes);
                const accountName = session.account.label;

                const allowList = await readAllowedExtensions(this.storageService, providerId, accountName);
                if (!allowList.find(allowed => allowed.id === extensionId)) {
                    allowList.push({ id: extensionId, name: extensionName });
                    this.storageService.setData(`authentication-trusted-extensions-${providerId}-${accountName}`, JSON.stringify(allowList));
                }

                this.storageService.setData(`authentication-session-${extensionName}-${providerId}`, session.id);

                resolve(session);

            } else {
                reject('User did not consent to account access');
            }
        });
    }

    protected async getSessionsPrompt(providerId: string, accountName: string, providerName: string, extensionId: string, extensionName: string): Promise<boolean> {
        const allowList = await readAllowedExtensions(this.storageService, providerId, accountName);
        const extensionData = allowList.find(extension => extension.id === extensionId);
        if (extensionData) {
            addAccountUsage(this.storageService, providerId, accountName, extensionId, extensionName);
            return true;
        }
        const choice = await this.messageService.info(`The extension '${extensionName}' wants to access the ${providerName} account '${accountName}'.`, 'Allow', 'Cancel');

        const allow = choice === 'Allow';
        if (allow) {
            await addAccountUsage(this.storageService, providerId, accountName, extensionId, extensionName);
            allowList.push({ id: extensionId, name: extensionName });
            this.storageService.setData(`authentication-trusted-extensions-${providerId}-${accountName}`, JSON.stringify(allowList));
        }

        return allow;
    }

    protected async loginPrompt(providerName: string, extensionName: string, recreatingSession: boolean, detail?: string): Promise<boolean> {
        const msg = document.createElement('span');
        msg.textContent = recreatingSession
            ? nls.localizeByDefault("The extension '{0}' wants you to sign in again using {1}.", extensionName, providerName)
            : nls.localizeByDefault("The extension '{0}' wants to sign in using {1}.", extensionName, providerName);

        if (detail) {
            const detailElement = document.createElement('p');
            detailElement.textContent = detail;
            msg.appendChild(detailElement);
        }

        return !!await new ConfirmDialog({
            title: nls.localize('theia/plugin-ext/authentication-main/loginTitle', 'Login'),
            msg,
            ok: nls.localizeByDefault('Allow'),
            cancel: Dialog.CANCEL
        }).open();
    }

    protected async isAccessAllowed(providerId: string, accountName: string, extensionId: string): Promise<boolean> {
        const allowList = await readAllowedExtensions(this.storageService, providerId, accountName);
        return !!allowList.find(allowed => allowed.id === extensionId);
    }

    protected async setTrustedExtensionAndAccountPreference(providerId: string, accountName: string, extensionId: string, extensionName: string, sessionId: string): Promise<void> {
        const allowList = await readAllowedExtensions(this.storageService, providerId, accountName);
        if (!allowList.find(allowed => allowed.id === extensionId)) {
            allowList.push({ id: extensionId, name: extensionName });
            this.storageService.setData(`authentication-trusted-extensions-${providerId}-${accountName}`, JSON.stringify(allowList));
        }
        this.storageService.setData(`authentication-session-${extensionName}-${providerId}`, sessionId);
    }

    $onDidChangeSessions(providerId: string, event: theia.AuthenticationProviderAuthenticationSessionsChangeEvent): void {
        this.authenticationService.updateSessions(providerId, event);
    }
}

function isAuthenticationForceNewSessionOptions(arg: unknown): arg is theia.AuthenticationForceNewSessionOptions {
    return isObject<theia.AuthenticationForceNewSessionOptions>(arg) && typeof arg.detail === 'string';
}

async function addAccountUsage(storageService: StorageService, providerId: string, accountName: string, extensionId: string, extensionName: string): Promise<void> {
    const accountKey = `authentication-${providerId}-${accountName}-usages`;
    const usages = await readAccountUsages(storageService, providerId, accountName);

    const existingUsageIndex = usages.findIndex(usage => usage.extensionId === extensionId);
    if (existingUsageIndex > -1) {
        usages.splice(existingUsageIndex, 1, {
            extensionId,
            extensionName,
            lastUsed: Date.now()
        });
    } else {
        usages.push({
            extensionId,
            extensionName,
            lastUsed: Date.now()
        });
    }

    await storageService.setData(accountKey, JSON.stringify(usages));
}

interface AccountUsage {
    extensionId: string;
    extensionName: string;
    lastUsed: number;
}

export class AuthenticationProviderImpl implements AuthenticationProvider {
    /** map from account name to session ids */
    private accounts = new Map<string, string[]>();
    /** map from session id to account name */
    private sessions = new Map<string, string>();

    readonly onDidChangeSessions: theia.Event<theia.AuthenticationProviderAuthenticationSessionsChangeEvent>;

    constructor(
        private readonly proxy: AuthenticationExt,
        public readonly id: string,
        public readonly label: string,
        public readonly supportsMultipleAccounts: boolean,
        private readonly storageService: StorageService,
        private readonly messageService: MessageService
    ) { }

    public hasSessions(): boolean {
        return !!this.sessions.size;
    }

    private registerSession(session: theia.AuthenticationSession): void {
        this.sessions.set(session.id, session.account.label);

        const existingSessionsForAccount = this.accounts.get(session.account.label);
        if (existingSessionsForAccount) {
            this.accounts.set(session.account.label, existingSessionsForAccount.concat(session.id));
            return;
        } else {
            this.accounts.set(session.account.label, [session.id]);
        }
    }

    async signOut(accountName: string): Promise<void> {
        const accountUsages = await readAccountUsages(this.storageService, this.id, accountName);
        const sessionsForAccount = this.accounts.get(accountName);
        const result = await this.messageService.info(accountUsages.length
            ? nls.localizeByDefault("The account '{0}' has been used by: \n\n{1}\n\n Sign out from these extensions?", accountName,
                accountUsages.map(usage => usage.extensionName).join(', '))
            : nls.localizeByDefault("Sign out of '{0}'?", accountName),
            nls.localizeByDefault('Sign Out'),
            Dialog.CANCEL);

        if (result && result === nls.localizeByDefault('Sign Out') && sessionsForAccount) {
            sessionsForAccount.forEach(sessionId => this.removeSession(sessionId));
            removeAccountUsage(this.storageService, this.id, accountName);
        }
    }

    async getSessions(scopes?: string[], account?: AuthenticationSessionAccountInformation): Promise<ReadonlyArray<theia.AuthenticationSession>> {
        return this.proxy.$getSessions(this.id, scopes, { account: account });
    }

    async updateSessionItems(event: theia.AuthenticationProviderAuthenticationSessionsChangeEvent): Promise<void> {
        const { added, removed } = event;
        const session = await this.proxy.$getSessions(this.id, undefined, {});
        const addedSessions = added ? session.filter(s => added.some(addedSession => addedSession.id === s.id)) : [];

        removed?.forEach(removedSession => {
            const sessionId = removedSession.id;
            if (sessionId) {
                const accountName = this.sessions.get(sessionId);
                if (accountName) {
                    this.sessions.delete(sessionId);
                    const sessionsForAccount = this.accounts.get(accountName) || [];
                    const sessionIndex = sessionsForAccount.indexOf(sessionId);
                    sessionsForAccount.splice(sessionIndex);

                    if (!sessionsForAccount.length) {
                        this.accounts.delete(accountName);
                    }
                }
            }
        });

        addedSessions.forEach(s => this.registerSession(s));
    }

    async login(scopes: string[], options: AuthenticationProviderSessionOptions): Promise<theia.AuthenticationSession> {
        return this.createSession(scopes, options);
    }

    async logout(sessionId: string): Promise<void> {
        return this.removeSession(sessionId);
    }

    createSession(scopes: string[], options: AuthenticationProviderSessionOptions): Thenable<theia.AuthenticationSession> {
        return this.proxy.$createSession(this.id, scopes, options);
    }

    removeSession(sessionId: string): Thenable<void> {
        return this.proxy.$removeSession(this.id, sessionId)
            .then(() => {
                this.messageService.info(nls.localizeByDefault('Successfully signed out.'));
            });
    }
}

async function readAccountUsages(storageService: StorageService, providerId: string, accountName: string): Promise<AccountUsage[]> {
    const accountKey = `authentication-${providerId}-${accountName}-usages`;
    const storedUsages: string | undefined = await storageService.getData(accountKey);
    let usages: AccountUsage[] = [];
    if (storedUsages) {
        try {
            usages = JSON.parse(storedUsages);
        } catch (e) {
            console.log(e);
        }
    }

    return usages;
}

function removeAccountUsage(storageService: StorageService, providerId: string, accountName: string): void {
    const accountKey = `authentication-${providerId}-${accountName}-usages`;
    storageService.setData(accountKey, undefined);
}
