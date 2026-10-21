// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses as the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

// Lightweight contract of the chat UI: identifiers, commands and the widget
// marker, importable without loading the chat implementation. Used by the
// thin registration module (see ai-chat-ui-frontend-module.ts) and by
// external consumers. The values must match the corresponding static fields
// of ChatViewWidget and the constants of AIChatContribution.

import { Command } from '@theia/core';
import { nls } from '@theia/core/lib/common/nls';

export const CHAT_VIEW_WIDGET_ID = 'chat-view-widget';
export const CHAT_VIEW_WIDGET_LABEL = nls.localize('theia/ai/chat/view/label', 'AI Chat');
export const AI_CHAT_TOGGLE_COMMAND_ID = 'aiChat:toggle';

export const APPROVE_LATEST_TOOL_CONFIRMATION_COMMAND = Command.toLocalizedCommand({
    id: 'theia.ai.chat.approveLatestToolConfirmation',
    label: 'Approve Latest Tool Confirmation'
}, 'theia/ai/chat-ui/toolconfirmation/approveLatest');

export const DENY_LATEST_TOOL_CONFIRMATION_COMMAND = Command.toLocalizedCommand({
    id: 'theia.ai.chat.denyLatestToolConfirmation',
    label: 'Deny Latest Tool Confirmation'
}, 'theia/ai/chat-ui/toolconfirmation/denyLatest');

/**
 * Marker for chat view widget instances. `instanceof ChatViewWidget`
 * requires a static import of the widget class and is therefore incompatible
 * with lazy loading; the marker is assigned by the `ChatViewWidget` class.
 */
export const CHAT_VIEW_WIDGET_MARKER = Symbol.for('theiaChatViewWidget');

export function isChatViewWidget(widget: unknown): widget is import('./chat-view-widget').ChatViewWidget {
    return typeof widget === 'object' && widget !== null
        && (widget as { [CHAT_VIEW_WIDGET_MARKER]?: unknown })[CHAT_VIEW_WIDGET_MARKER] === true;
}
