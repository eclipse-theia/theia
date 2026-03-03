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

import { ChatSessionMetadata } from '@theia/ai-chat';
import { ChatCommands } from '@theia/ai-chat-ui/lib/browser/chat-view-commands';
import { nls } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import { injectable } from '@theia/core/shared/inversify';

export interface ChatSessionCardAction {
    /** Command to execute; handler receives `ChatSessionMetadata` as first arg. */
    commandId: string;
    /** Icon CSS class (e.g. from `codicon()`). */
    iconClass: string;
    /** Accessible label / tooltip. */
    tooltip?: string;
    /** Sort order — lower = further left. Default 0. */
    priority?: number;
}

/**
 * Contribute actions to the session card action bar shown on hover in the welcome screen.
 * Bind to `ChatSessionCardActionContribution` to add entries.
 *
 * ### Example
 * ```ts
 * bind(ChatSessionCardActionContribution).toDynamicValue(() => ({
 *     getActions: (_session: ChatSessionMetadata) => [{
 *         commandId: 'my.command',
 *         iconClass: codicon('star'),
 *         tooltip: 'My action',
 *     }]
 * }));
 * ```
 */
export const ChatSessionCardActionContribution = Symbol('ChatSessionCardActionContribution');
export interface ChatSessionCardActionContribution {
    getActions(session: ChatSessionMetadata): ChatSessionCardAction[];
}

@injectable()
export class DefaultChatSessionCardActionContribution implements ChatSessionCardActionContribution {
    getActions(_session: ChatSessionMetadata): ChatSessionCardAction[] {
        return [
            {
                commandId: ChatCommands.AI_CHAT_RENAME_SESSION.id,
                iconClass: codicon('edit'),
                tooltip: nls.localize('theia/ai/ide/renameChat', 'Rename Chat'),
                priority: 0,
            },
            {
                commandId: ChatCommands.AI_CHAT_DELETE_SESSION.id,
                iconClass: codicon('remove-close'),
                tooltip: nls.localize('theia/ai/ide/deleteChat', 'Delete Chat'),
                priority: 10,
            },
        ];
    }
}
