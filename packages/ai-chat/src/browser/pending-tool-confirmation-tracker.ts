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

import { injectable } from '@theia/core/shared/inversify';
import { Disposable, Emitter, Event } from '@theia/core';
import { ToolCallChatResponseContent } from '../common';

export interface PendingToolConfirmation {
    readonly chatId: string;
    readonly response: ToolCallChatResponseContent;
    allow(): void;
    deny(): void;
}

/**
 * Tracks tool confirmations that are currently awaiting user input across all chats.
 *
 * Used to drive keyboard shortcuts that approve or deny the most recently surfaced
 * pending confirmation. Queries are scoped by chat id so a shortcut only ever targets a
 * confirmation in the chat the user is interacting with, never one in a different chat.
 */
@injectable()
export class PendingToolConfirmationTracker {

    protected readonly pending: PendingToolConfirmation[] = [];
    protected readonly onChangedEmitter = new Emitter<void>();
    protected readonly introShownChats = new Set<string>();

    readonly onChanged: Event<void> = this.onChangedEmitter.event;

    /**
     * Whether the one-time tool-confirmation intro has already been shown for the given chat.
     *
     * Pure query - call {@link markIntroShown} to record that it was shown. Kept separate so it
     * can be used from a React render without side effects.
     */
    hasShownIntro(chatId: string): boolean {
        return this.introShownChats.has(chatId);
    }

    /**
     * Marks the tool-confirmation intro as shown for the given chat, so it is only rendered once
     * per chat session.
     */
    markIntroShown(chatId: string): void {
        this.introShownChats.add(chatId);
    }

    register(entry: PendingToolConfirmation): Disposable {
        this.pending.push(entry);
        this.onChangedEmitter.fire();
        return Disposable.create(() => this.unregister(entry));
    }

    unregister(entry: PendingToolConfirmation): void {
        const index = this.pending.indexOf(entry);
        if (index >= 0) {
            this.pending.splice(index, 1);
            this.onChangedEmitter.fire();
        }
    }

    /**
     * Returns the most recently registered pending confirmation, optionally restricted to a single
     * chat. Without a `chatId` it considers all chats (e.g. to drive a global context key); with a
     * `chatId` it only returns a confirmation belonging to that chat.
     */
    getLatest(chatId?: string): PendingToolConfirmation | undefined {
        for (let i = this.pending.length - 1; i >= 0; i--) {
            if (chatId === undefined || this.pending[i].chatId === chatId) {
                return this.pending[i];
            }
        }
        return undefined;
    }

    /**
     * Whether there is a pending confirmation, optionally restricted to a single chat.
     */
    hasPending(chatId?: string): boolean {
        if (chatId === undefined) {
            return this.pending.length > 0;
        }
        return this.pending.some(entry => entry.chatId === chatId);
    }
}
