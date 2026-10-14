// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { Disposable, Emitter } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ChatGptAccount, ChatGptAuthenticationMode, ChatGptAuthServiceClient, ChatGptAuthState, ChatGptCredentials, ChatGptLoginSession } from '../common';
import { ChatGptBackendAuthService } from './chatgpt-auth-service';
import { ChatGptAuthServiceImpl } from './chatgpt-auth-service-impl';
import { ChatGptCodexAuthService } from './chatgpt-codex-auth-service';

/** One backend-wide selection; each protocol owns its credentials and refresh lifecycle. */
@injectable()
export class ChatGptAuthServiceRouter implements ChatGptBackendAuthService {

    @inject(ChatGptAuthServiceImpl)
    protected readonly oss: ChatGptAuthServiceImpl;

    @inject(ChatGptCodexAuthService)
    protected readonly codex: ChatGptCodexAuthService;

    protected mode: ChatGptAuthenticationMode = 'codex';
    protected generation = 0;
    protected readonly emitter = new Emitter<ChatGptAuthState>();
    readonly onAuthStateChanged = this.emitter.event;

    protected get active(): ChatGptAuthServiceImpl {
        return this.mode === 'codex' ? this.codex : this.oss;
    }

    @postConstruct()
    protected init(): void {
        for (const service of [this.codex, this.oss]) {
            service.onAuthStateChanged(state => {
                if (service === this.active) {
                    this.emitter.fire(state);
                }
            });
        }
    }

    addClient(client: ChatGptAuthServiceClient): Disposable {
        return this.onAuthStateChanged(state => client.onAuthStateChanged(state));
    }

    async setAuthenticationMode(mode: ChatGptAuthenticationMode): Promise<void> {
        if (mode !== 'codex' && mode !== 'oss') {
            throw new Error('Unknown ChatGPT authentication mode.');
        }
        if (mode === this.mode) {
            return;
        }
        this.active.suspend();
        this.mode = mode;
        const generation = ++this.generation;
        this.emitter.fire({ isAuthenticated: false });
        if (mode === 'oss') {
            // Preserve legacy credentials before an OSS login can overwrite their original slot.
            await this.codex.getAuthState();
        }
        const state = await this.active.getAuthState();
        if (generation === this.generation) {
            this.emitter.fire(state);
        }
    }

    async startLogin(clientId?: string): Promise<ChatGptLoginSession> {
        const service = this.active;
        const generation = this.generation;
        if (service === this.oss) {
            await this.codex.getAuthState();
        }
        if (generation !== this.generation) {
            throw new Error('The ChatGPT authentication mode changed. Please sign in again.');
        }
        const session = await service.startLogin(clientId);
        if (generation !== this.generation) {
            await service.cancelLogin(session.loginId);
            throw new Error('The ChatGPT authentication mode changed. Please sign in again.');
        }
        return session;
    }

    waitForLogin(loginId: string): Promise<boolean> {
        return this.active.waitForLogin(loginId);
    }

    completeLogin(input: string, loginId: string): Promise<boolean> {
        return this.active.completeLogin(input, loginId);
    }

    cancelLogin(loginId: string): Promise<void> {
        return this.active.cancelLogin(loginId);
    }

    async getAuthState(): Promise<ChatGptAuthState> {
        const generation = this.generation;
        const state = await this.active.getAuthState();
        return generation === this.generation ? state : { isAuthenticated: false };
    }

    async getAccounts(): Promise<ChatGptAccount[]> {
        const generation = this.generation;
        const accounts = await this.active.getAccounts();
        return generation === this.generation ? accounts : [];
    }

    selectAccount(clientId: string): Promise<void> {
        return this.active.selectAccount(clientId);
    }

    signOut(): Promise<void> {
        return this.active.signOut();
    }

    async getCredentials(clientId?: string, sessionId?: string): Promise<ChatGptCredentials | undefined> {
        const generation = this.generation;
        const prefix = `${generation}:`;
        if (sessionId !== undefined && !sessionId.startsWith(prefix)) {
            return undefined;
        }
        const mode = this.mode;
        const credentials = await this.active.getCredentials(clientId, sessionId?.slice(prefix.length));
        return credentials && generation === this.generation
            ? { ...credentials, authenticationMode: mode, sessionId: `${prefix}${credentials.sessionId}` }
            : undefined;
    }
}
