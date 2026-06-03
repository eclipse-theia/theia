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
    readonly response: ToolCallChatResponseContent;
    allow(): void;
    deny(): void;
}

/**
 * Tracks tool confirmations that are currently awaiting user input across all chats.
 *
 * Used to drive keyboard shortcuts that approve or deny the most recently surfaced
 * pending confirmation without requiring the user to click on the confirmation card.
 */
@injectable()
export class PendingToolConfirmationTracker {

    protected readonly pending: PendingToolConfirmation[] = [];
    protected readonly onChangedEmitter = new Emitter<void>();
    protected readonly introShownChats = new Set<string>();

    readonly onChanged: Event<void> = this.onChangedEmitter.event;

    /**
     * Returns `true` the first time it is called for a given chat id (and `false` thereafter),
     * marking the chat as having had the tool-confirmation intro shown.
     *
     * Used by the UI to decide whether to render a one-time explainer above the first
     * tool-confirmation card in a chat session.
     */
    shouldShowIntro(chatId: string): boolean {
        if (this.introShownChats.has(chatId)) {
            return false;
        }
        this.introShownChats.add(chatId);
        return true;
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
     * Returns the most recently registered pending confirmation, or `undefined` if none are pending.
     */
    getLatest(): PendingToolConfirmation | undefined {
        return this.pending[this.pending.length - 1];
    }

    hasPending(): boolean {
        return this.pending.length > 0;
    }
}
