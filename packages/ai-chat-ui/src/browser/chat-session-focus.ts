// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { ChatService } from '@theia/ai-chat';
import { ApplicationShell } from '@theia/core/lib/browser';

/** Id of the chat view widget. Kept in sync with `ChatViewWidget.ID`. */
const CHAT_VIEW_WIDGET_ID = 'chat-view-widget';

/**
 * Whether the user is currently looking at the given session in the chat view. In that case the
 * user is already aware of what is happening, so notifications about it (completion, input
 * needed) should be suppressed.
 *
 * This deliberately uses {@link ApplicationShell.currentWidget} rather than the focused widget:
 * while an agent is running, the chat input editor is disabled and loses DOM focus, but the user
 * is still looking at the chat. `currentWidget` remains the chat view until the user activates a
 * different widget, whereas `activeWidget` would already be `undefined`. The window must also have
 * focus, otherwise the user has switched to another application and should still be notified.
 *
 * Lives in this standalone module (rather than on the `ChatViewWidget` namespace) so that
 * `chat-input-widget` can use it without importing `chat-view-widget`, which would form a
 * load-time import cycle (chat-view-widget → chat tree widgets → chat-input-widget). For the same
 * reason it matches the chat view by id rather than `instanceof ChatViewWidget`.
 */
export function isChatSessionFocused(shell: ApplicationShell, chatService: ChatService, sessionId: string): boolean {
    if (!document.hasFocus()) {
        return false;
    }
    if (chatService.getActiveSession()?.id !== sessionId) {
        return false;
    }
    // currentWidget rather than activeWidget: the chat view stays the current widget even when
    // its input editor is disabled and blurred while the agent runs.
    const current = shell.currentWidget;
    return current?.id === CHAT_VIEW_WIDGET_ID && current.isVisible;
}
