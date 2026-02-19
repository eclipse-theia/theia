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

import { Emitter, Event } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ChatAgentLocation, ChatService, isActiveSessionChangedEvent } from '@theia/ai-chat';

export const WELCOME_SCREEN_ENTRY = Symbol('ai-chat-navigation-welcome-screen');
export type NavEntry = typeof WELCOME_SCREEN_ENTRY | string;

@injectable()
export class AIChatNavigationService {

    @inject(ChatService)
    protected readonly chatService: ChatService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    private history: NavEntry[] = [WELCOME_SCREEN_ENTRY];
    private pointer = 0;
    private isNavigating = false;

    @postConstruct()
    protected init(): void {
        this.chatService.onSessionEvent(event => {
            if (this.isNavigating) { return; }
            if (isActiveSessionChangedEvent(event)) {
                this.handleActiveChange(event.sessionId);
            }
        });
    }

    private handleActiveChange(sessionId: string | undefined): void {
        if (!sessionId) { return; }
        const session = this.chatService.getSession(sessionId);
        if (!session) { return; }
        if (session.model.isEmpty()) {
            // A new empty session is being shown — represents the Welcome screen.
            // Push WELCOME_SCREEN_ENTRY only if we aren't already there.
            if (this.history[this.pointer] !== WELCOME_SCREEN_ENTRY) {
                this.push(WELCOME_SCREEN_ENTRY);
            }
        } else {
            // An existing session with content — a regular session switch.
            this.push(sessionId);
        }
    }

    /** Called by ChatViewWidget when a query is submitted on an empty (welcome screen) session. */
    notifyQueryFromWelcomeScreen(sessionId: string): void {
        if (this.isNavigating) { return; }
        this.push(sessionId);
    }

    private push(entry: NavEntry): void {
        this.history.splice(this.pointer + 1);
        this.history.push(entry);
        this.pointer = this.history.length - 1;
        this.onDidChangeEmitter.fire();
    }

    get canGoBack(): boolean { return this.pointer > 0; }
    get canGoForward(): boolean { return this.pointer < this.history.length - 1; }

    async back(): Promise<void> {
        if (!this.canGoBack) { return; }
        this.pointer--;
        await this.navigateTo(this.history[this.pointer]);
        this.onDidChangeEmitter.fire();
    }

    async forward(): Promise<void> {
        if (!this.canGoForward) { return; }
        this.pointer++;
        await this.navigateTo(this.history[this.pointer]);
        this.onDidChangeEmitter.fire();
    }

    private async navigateTo(entry: NavEntry): Promise<void> {
        this.isNavigating = true;
        try {
            if (entry === WELCOME_SCREEN_ENTRY) {
                this.chatService.createSession(ChatAgentLocation.Panel, { focus: false });
            } else {
                const session = await this.chatService.getOrRestoreSession(entry);
                if (session) {
                    this.chatService.setActiveSession(entry, { focus: false });
                } else {
                    console.warn(`AI Chat navigation: session ${entry} not found`);
                }
            }
        } finally {
            this.isNavigating = false;
        }
    }
}
