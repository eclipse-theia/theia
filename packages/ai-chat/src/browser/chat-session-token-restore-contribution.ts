// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ChatService, isSessionCreatedEvent } from '../common/chat-service';
import { ChatSessionTokenTracker } from '../common/chat-session-token-tracker';

/**
 * Contribution that wires ChatService session events to the token tracker.
 * This breaks the circular dependency between ChatService and ChatSessionTokenTracker
 * by deferring the wiring until after both services are fully constructed.
 */
@injectable()
export class ChatSessionTokenRestoreContribution implements FrontendApplicationContribution {
    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(ChatSessionTokenTracker)
    protected readonly tokenTracker: ChatSessionTokenTracker;

    onStart(): void {
        this.chatService.onSessionEvent(event => {
            if (isSessionCreatedEvent(event) && event.tokenCount !== undefined) {
                this.tokenTracker.resetSessionTokens(event.sessionId, event.tokenCount);
            }
        });
    }
}
