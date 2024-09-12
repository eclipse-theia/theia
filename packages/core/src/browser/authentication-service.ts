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
// code copied and modified from https://github.com/microsoft/vscode/blob/1.47.3/src/vs/workbench/services/authentication/browser/authenticationService.ts

import { injectable, inject, postConstruct } from 'inversify';
import { Emitter, Event } from '../common/event';
import { StorageService } from '../browser/storage-service';
import { Disposable, DisposableCollection } from '../common/disposable';
import { ACCOUNTS_MENU, ACCOUNTS_SUBMENU, MenuModelRegistry } from '../common/menu';
import { Command, CommandRegistry } from '../common/command';
import { nls } from '../common/nls';

export interface AuthenticationSessionAccountInformation {
    readonly id: string;
    readonly label: string;
}
export interface AuthenticationProviderSessionOptions {
    /**
     * The account that is being asked about. If this is passed in, the provider should
     * attempt to return the sessions that are only related to this account.
     */
    account?: AuthenticationSessionAccountInformation;
}

export interface AuthenticationSession {
    id: string;
    accessToken: string;
    account: AuthenticationSessionAccountInformation;
    scopes: ReadonlyArray<string>;
}

export interface AuthenticationProviderInformation {
    id: string;
    label: string;
}

/** Should match the definition from the theia/vscode types */
export interface AuthenticationProviderAuthenticationSessionsChangeEvent {
    readonly added: readonly AuthenticationSession[] | undefined;
    readonly removed: readonly AuthenticationSession[] | undefined;
    readonly changed: readonly AuthenticationSession[] | undefined;
}

export interface SessionRequest {
    disposables: Disposable[];
    requestingExtensionIds: string[];
}

export interface SessionRequestInfo {
    [scopes: string]: SessionRequest;
}

/**
 * Our authentication provider should at least contain the following information:
 * - The signature of authentication providers from vscode
 * - Registration information about the provider (id, label)
 * - Provider options (supportsMultipleAccounts)
 *
 * Additionally, we provide the possibility to sign out of a specific account name.
 */
export interface AuthenticationProvider {
    id: string;

    label: string;

    supportsMultipleAccounts: boolean;

    hasSessions(): boolean;

    signOut(accountName: string): Promise<void>;

    updateSessionItems(event: AuthenticationProviderAuthenticationSessionsChangeEvent): Promise<void>;

    /**
     * An [event](#Event) which fires when the array of sessions has changed, or data
     * within a session has changed.
     */
    readonly onDidChangeSessions: Event<AuthenticationProviderAuthenticationSessionsChangeEvent>;

    /**
     * Get a list of sessions.
     * @param scopes An optional list of scopes. If provided, the sessions returned should match
     * these permissions, otherwise all sessions should be returned.
     * @param account The optional account that you would like to get the session for
     * @returns A promise that resolves to an array of authentication sessions.
     */
    getSessions(scopes: string[] | undefined, account?: AuthenticationSessionAccountInformation): Thenable<ReadonlyArray<AuthenticationSession>>;

    /**
     * Prompts a user to login.
     * @param scopes A list of scopes, permissions, that the new session should be created with.
     * @param options The options for createing the session
     * @returns A promise that resolves to an authentication session.
     */
    createSession(scopes: string[], options: AuthenticationProviderSessionOptions): Thenable<AuthenticationSession>;

    /**
     * Removes the session corresponding to session id.
     * @param sessionId The id of the session to remove.
     */
    removeSession(sessionId: string): Thenable<void>;
}
export const AuthenticationService = Symbol('AuthenticationService');

export interface AuthenticationService {
    isAuthenticationProviderRegistered(id: string): boolean;
    getProviderIds(): string[];
    registerAuthenticationProvider(id: string, provider: AuthenticationProvider): void;
    unregisterAuthenticationProvider(id: string): void;
    requestNewSession(id: string, scopes: string[], extensionId: string, extensionName: string): void;
    updateSessions(providerId: string, event: AuthenticationProviderAuthenticationSessionsChangeEvent): void;

    readonly onDidRegisterAuthenticationProvider: Event<AuthenticationProviderInformation>;
    readonly onDidUnregisterAuthenticationProvider: Event<AuthenticationProviderInformation>;

    readonly onDidChangeSessions: Event<{ providerId: string, label: string, event: AuthenticationProviderAuthenticationSessionsChangeEvent }>;
    readonly onDidUpdateSignInCount: Event<number>;
    getSessions(providerId: string, scopes?: string[], user?: AuthenticationSessionAccountInformation): Promise<ReadonlyArray<AuthenticationSession>>;
    getLabel(providerId: string): string;
    supportsMultipleAccounts(providerId: string): boolean;
    login(providerId: string, scopes: string[], options?: AuthenticationProviderSessionOptions): Promise<AuthenticationSession>;
    logout(providerId: string, sessionId: string): Promise<void>;

    signOutOfAccount(providerId: string, accountName: string): Promise<void>;
}

export interface SessionChangeEvent {
    providerId: string,
    label: string,
    event: AuthenticationProviderAuthenticationSessionsChangeEvent
}

@injectable()
export class AuthenticationServiceImpl implements AuthenticationService {
    private noAccountsMenuItem: Disposable | undefined;
    private noAccountsCommand: Command = { id: 'noAccounts' };
    private signInRequestItems = new Map<string, SessionRequestInfo>();
    private sessionMap = new Map<string, DisposableCollection>();

    protected authenticationProviders: Map<string, AuthenticationProvider> = new Map<string, AuthenticationProvider>();

    private readonly onDidRegisterAuthenticationProviderEmitter: Emitter<AuthenticationProviderInformation> = new Emitter<AuthenticationProviderInformation>();
    readonly onDidRegisterAuthenticationProvider: Event<AuthenticationProviderInformation> = this.onDidRegisterAuthenticationProviderEmitter.event;

    private readonly onDidUnregisterAuthenticationProviderEmitter: Emitter<AuthenticationProviderInformation> = new Emitter<AuthenticationProviderInformation>();
    readonly onDidUnregisterAuthenticationProvider: Event<AuthenticationProviderInformation> = this.onDidUnregisterAuthenticationProviderEmitter.event;

    private readonly onDidChangeSessionsEmitter: Emitter<SessionChangeEvent> = new Emitter<SessionChangeEvent>();
    readonly onDidChangeSessions: Event<SessionChangeEvent> = this.onDidChangeSessionsEmitter.event;

    private readonly onDidChangeSignInCountEmitter: Emitter<number> = new Emitter<number>();
    readonly onDidUpdateSignInCount: Event<number> = this.onDidChangeSignInCountEmitter.event;

    @inject(MenuModelRegistry) protected readonly menus: MenuModelRegistry;
    @inject(CommandRegistry) protected readonly commands: CommandRegistry;
    @inject(StorageService) protected readonly storageService: StorageService;

    @postConstruct()
    init(): void {
        this.onDidChangeSessions(event => this.handleSessionChange(event));
        this.commands.registerCommand(this.noAccountsCommand, {
            execute: () => { },
            isEnabled: () => false
        });
    }

    protected async handleSessionChange(changeEvent: SessionChangeEvent): Promise<void> {
        if (changeEvent.event.added && changeEvent.event.added.length > 0) {
            const sessions = await this.getSessions(changeEvent.providerId);
            sessions.forEach(session => {
                if (!this.sessionMap.get(session.id)) {
                    this.sessionMap.set(session.id, this.createAccountUi(changeEvent.providerId, changeEvent.label, session));
                }
            });
        }
        for (const removed of changeEvent.event.removed || []) {
            const sessionId = typeof removed === 'string' ? removed : removed?.id;
            if (sessionId) {
                this.sessionMap.get(sessionId)?.dispose();
                this.sessionMap.delete(sessionId);
            }
        }
    }

    protected createAccountUi(providerId: string, providerLabel: string, session: AuthenticationSession): DisposableCollection {
        // unregister old commands and menus if present (there is only one per account but there may be several sessions per account)
        const providerAccountId = `account-sign-out-${providerId}-${session.account.id}`;
        this.commands.unregisterCommand(providerAccountId);

        const providerAccountSubmenu = [...ACCOUNTS_SUBMENU, providerAccountId];
        this.menus.unregisterMenuAction({ commandId: providerAccountId }, providerAccountSubmenu);

        // register new command and menu entry for the sessions account
        const disposables = new DisposableCollection();
        disposables.push(this.commands.registerCommand({ id: providerAccountId }, {
            execute: async () => {
                this.signOutOfAccount(providerId, session.account.label);
            }
        }));
        this.menus.registerSubmenu(providerAccountSubmenu, `${session.account.label} (${providerLabel})`);
        disposables.push(this.menus.registerMenuAction(providerAccountSubmenu, {
            label: nls.localizeByDefault('Sign Out'),
            commandId: providerAccountId
        }));
        return disposables;
    }

    getProviderIds(): string[] {
        const providerIds: string[] = [];
        this.authenticationProviders.forEach(provider => {
            providerIds.push(provider.id);
        });
        return providerIds;
    }

    isAuthenticationProviderRegistered(id: string): boolean {
        return this.authenticationProviders.has(id);
    }

    private updateAccountsMenuItem(): void {
        let hasSession = false;
        this.authenticationProviders.forEach(async provider => {
            hasSession = hasSession || provider.hasSessions();
        });

        if (hasSession && this.noAccountsMenuItem) {
            this.noAccountsMenuItem.dispose();
            this.noAccountsMenuItem = undefined;
        }

        if (!hasSession && !this.noAccountsMenuItem) {
            this.noAccountsMenuItem = this.menus.registerMenuAction(ACCOUNTS_MENU, {
                label: 'You are not signed in to any accounts',
                order: '0',
                commandId: this.noAccountsCommand.id
            });
        }
    }

    registerAuthenticationProvider(id: string, authenticationProvider: AuthenticationProvider): void {
        if (this.authenticationProviders.get(id)) {
            throw new Error(`An authentication provider with id '${id}' is already registered.`);
        }
        this.authenticationProviders.set(id, authenticationProvider);
        this.onDidRegisterAuthenticationProviderEmitter.fire({ id, label: authenticationProvider.label });

        this.updateAccountsMenuItem();
        console.log(`An authentication provider with id '${id}' was registered.`);
    }

    unregisterAuthenticationProvider(id: string): void {
        const provider = this.authenticationProviders.get(id);
        if (provider) {
            this.authenticationProviders.delete(id);
            this.onDidUnregisterAuthenticationProviderEmitter.fire({ id, label: provider.label });
            this.updateAccountsMenuItem();
        } else {
            console.error(`Failed to unregister an authentication provider. A provider with id '${id}' was not found.`);
        }
    }

    async updateSessions(id: string, event: AuthenticationProviderAuthenticationSessionsChangeEvent): Promise<void> {
        const provider = this.authenticationProviders.get(id);
        if (provider) {
            await provider.updateSessionItems(event);
            this.onDidChangeSessionsEmitter.fire({ providerId: id, label: provider.label, event: event });
            this.updateAccountsMenuItem();

            if (event.added) {
                await this.updateNewSessionRequests(provider);
            }
        } else {
            console.error(`Failed to update an authentication session. An authentication provider with id '${id}' was not found.`);
        }
    }

    private async updateNewSessionRequests(provider: AuthenticationProvider): Promise<void> {
        const existingRequestsForProvider = this.signInRequestItems.get(provider.id);
        if (!existingRequestsForProvider) {
            return;
        }

        const previousSize = this.signInRequestItems.size;
        const sessions = await provider.getSessions(undefined);
        Object.keys(existingRequestsForProvider).forEach(requestedScopes => {
            if (sessions.some(session => session.scopes.slice().sort().join('') === requestedScopes)) {
                const sessionRequest = existingRequestsForProvider[requestedScopes];
                if (sessionRequest) {
                    sessionRequest.disposables.forEach(item => item.dispose());
                }

                delete existingRequestsForProvider[requestedScopes];
                if (Object.keys(existingRequestsForProvider).length === 0) {
                    this.signInRequestItems.delete(provider.id);
                } else {
                    this.signInRequestItems.set(provider.id, existingRequestsForProvider);
                }
            }
        });
        if (previousSize !== this.signInRequestItems.size) {
            this.onDidChangeSignInCountEmitter.fire(this.signInRequestItems.size);
        }
    }

    async requestNewSession(providerId: string, scopes: string[], extensionId: string, extensionName: string): Promise<void> {
        let provider = this.authenticationProviders.get(providerId);
        if (!provider) {
            // Activate has already been called for the authentication provider, but it cannot block on registering itself
            // since this is sync and returns a disposable. So, wait for registration event to fire that indicates the
            // provider is now in the map.
            await new Promise<void>((resolve, _) => {
                this.onDidRegisterAuthenticationProvider(e => {
                    if (e.id === providerId) {
                        provider = this.authenticationProviders.get(providerId);
                        resolve(undefined);
                    }
                });
            });
        }

        if (provider) {
            const providerRequests = this.signInRequestItems.get(providerId);
            const scopesList = scopes.sort().join('');
            const extensionHasExistingRequest = providerRequests
                && providerRequests[scopesList]
                && providerRequests[scopesList].requestingExtensionIds.indexOf(extensionId) > -1;

            if (extensionHasExistingRequest) {
                return;
            }

            const menuItem = this.menus.registerMenuAction(ACCOUNTS_SUBMENU, {
                label: nls.localizeByDefault('Sign in with {0} to use {1} (1)', provider.label, extensionName),
                order: '1',
                commandId: `${extensionId}signIn`,
            });

            const signInCommand = this.commands.registerCommand({ id: `${extensionId}signIn` }, {
                execute: async () => {
                    const session = await this.login(providerId, scopes);

                    // Add extension to allow list since user explicitly signed in on behalf of it
                    const allowList = await readAllowedExtensions(this.storageService, providerId, session.account.label);
                    if (!allowList.find(allowed => allowed.id === extensionId)) {
                        allowList.push({ id: extensionId, name: extensionName });
                        this.storageService.setData(`authentication-trusted-extensions-${providerId}-${session.account.label}`, JSON.stringify(allowList));
                    }

                    // And also set it as the preferred account for the extension
                    this.storageService.setData(`authentication-session-${extensionName}-${providerId}`, session.id);
                }
            });

            const previousSize = this.signInRequestItems.size;
            if (providerRequests) {
                const existingRequest = providerRequests[scopesList] || { disposables: [], requestingExtensionIds: [] };

                providerRequests[scopesList] = {
                    disposables: [...existingRequest.disposables, menuItem, signInCommand],
                    requestingExtensionIds: [...existingRequest.requestingExtensionIds, extensionId]
                };
                this.signInRequestItems.set(providerId, providerRequests);
            } else {
                this.signInRequestItems.set(providerId, {
                    [scopesList]: {
                        disposables: [menuItem, signInCommand],
                        requestingExtensionIds: [extensionId]
                    }
                });
            }
            if (previousSize !== this.signInRequestItems.size) {
                this.onDidChangeSignInCountEmitter.fire(this.signInRequestItems.size);
            }
        }
    }

    getLabel(id: string): string {
        const authProvider = this.authenticationProviders.get(id);
        if (authProvider) {
            return authProvider.label;
        } else {
            throw new Error(`No authentication provider '${id}' is currently registered.`);
        }
    }

    supportsMultipleAccounts(id: string): boolean {
        const authProvider = this.authenticationProviders.get(id);
        if (authProvider) {
            return authProvider.supportsMultipleAccounts;
        } else {
            throw new Error(`No authentication provider '${id}' is currently registered.`);
        }
    }

    async getSessions(id: string, scopes?: string[], user?: AuthenticationSessionAccountInformation): Promise<ReadonlyArray<AuthenticationSession>> {
        const authProvider = this.authenticationProviders.get(id);
        if (authProvider) {
            return authProvider.getSessions(scopes, user);
        } else {
            throw new Error(`No authentication provider '${id}' is currently registered.`);
        }
    }

    async login(id: string, scopes: string[], options?: AuthenticationProviderSessionOptions): Promise<AuthenticationSession> {
        const authProvider = this.authenticationProviders.get(id);
        if (authProvider) {
            return authProvider.createSession(scopes, options || {});
        } else {
            throw new Error(`No authentication provider '${id}' is currently registered.`);
        }
    }

    async logout(id: string, sessionId: string): Promise<void> {
        const authProvider = this.authenticationProviders.get(id);
        if (authProvider) {
            return authProvider.removeSession(sessionId);
        } else {
            throw new Error(`No authentication provider '${id}' is currently registered.`);
        }
    }

    async signOutOfAccount(id: string, accountName: string): Promise<void> {
        const authProvider = this.authenticationProviders.get(id);
        if (authProvider) {
            return authProvider.signOut(accountName);
        } else {
            throw new Error(`No authentication provider '${id}' is currently registered.`);
        }
    }
}

export interface AllowedExtension {
    id: string;
    name: string;
}

export async function readAllowedExtensions(storageService: StorageService, providerId: string, accountName: string): Promise<AllowedExtension[]> {
    let trustedExtensions: AllowedExtension[] = [];
    try {
        const trustedExtensionSrc: string | undefined = await storageService.getData(`authentication-trusted-extensions-${providerId}-${accountName}`);
        if (trustedExtensionSrc) {
            trustedExtensions = JSON.parse(trustedExtensionSrc);
        }
    } catch (err) {
        console.error(err);
    }

    return trustedExtensions;
}
