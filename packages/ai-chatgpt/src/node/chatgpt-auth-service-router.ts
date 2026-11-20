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
import { ChatGptAuthenticationMode, ChatGptAuthServiceClient, ChatGptAuthState, ChatGptCredentials, ChatGptLoginSession } from '../common/index.js';
import { ChatGptBackendAuthService } from './chatgpt-auth-service.js';
import { ChatGptAuthServiceImpl } from './chatgpt-auth-service-impl.js';
import { ChatGptCodexAuthService } from './chatgpt-codex-auth-service.js';

/** One signed-in session overall; protocol transitions durably forget the former session. */
@injectable()
export class ChatGptAuthServiceRouter implements ChatGptBackendAuthService {

    @inject(ChatGptAuthServiceImpl)
    protected readonly oss: ChatGptAuthServiceImpl;

    @inject(ChatGptCodexAuthService)
    protected readonly codex: ChatGptCodexAuthService;

    protected mode: ChatGptAuthenticationMode = 'codex';
    protected generation = 0;
    protected transition: Promise<void> = Promise.resolve();
    /** Failed clearing stays pending, so a later explicit login or mode change can safely retry it. */
    protected readonly pendingSignOuts = new Set<ChatGptAuthServiceImpl>();
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
            this.suspendInactiveSession();
            await this.finishSignOuts();
            return;
        }
        const previous = this.active;
        previous.suspend();
        this.pendingSignOuts.add(previous);
        this.mode = mode;
        ++this.generation;
        const transition = this.finishSignOuts();
        this.emitter.fire({ isAuthenticated: false });
        await transition;
    }

    async startLogin(): Promise<ChatGptLoginSession> {
        const service = this.active;
        const generation = this.generation;
        this.suspendInactiveSession();
        await this.finishSignOuts();
        if (generation !== this.generation) {
            throw new Error('The ChatGPT authentication mode changed. Please sign in again.');
        }
        const session = await service.startLogin();
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
        await this.transition;
        const state = await this.active.getAuthState();
        return generation === this.generation ? state : { isAuthenticated: false };
    }

    signOut(): Promise<void> {
        const service = this.active;
        service.suspend();
        this.pendingSignOuts.add(service);
        ++this.generation;
        const transition = this.finishSignOuts();
        this.emitter.fire({ isAuthenticated: false });
        return transition;
    }

    /** Reconcile persisted ownership too, including after a restart lost an unsuccessful logout's in-memory queue. */
    protected suspendInactiveSession(): void {
        const inactive = this.mode === 'codex' ? this.oss : this.codex;
        inactive.suspend();
        this.pendingSignOuts.add(inactive);
    }

    /** Never skip a failed logout when recovering the serialized transition queue. */
    protected finishSignOuts(): Promise<void> {
        this.transition = this.transition.catch(() => undefined).then(async () => {
            for (const service of this.pendingSignOuts) {
                await service.signOut();
                this.pendingSignOuts.delete(service);
            }
        });
        return this.transition;
    }

    async getCredentials(clientId?: string, sessionId?: string): Promise<ChatGptCredentials | undefined> {
        const generation = this.generation;
        const prefix = `${generation}:`;
        if (sessionId !== undefined && !sessionId.startsWith(prefix)) {
            return undefined;
        }
        const mode = this.mode;
        const service = this.active;
        await this.transition;
        if (generation !== this.generation) {
            return undefined;
        }
        const credentials = await service.getCredentials(clientId, sessionId?.slice(prefix.length));
        return credentials && generation === this.generation
            ? { ...credentials, authenticationMode: mode, sessionId: `${prefix}${credentials.sessionId}` }
            : undefined;
    }
}
