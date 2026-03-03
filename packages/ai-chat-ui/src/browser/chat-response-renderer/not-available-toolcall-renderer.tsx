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

import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import { injectable } from '@theia/core/shared/inversify';
import { ChatResponseContent, ToolCallChatResponseContent } from '@theia/ai-chat/lib/common';
import { ReactNode } from '@theia/core/shared/react';
import { codicon } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { ResponseNode } from '../chat-tree-view';

/**
 * High-priority renderer for tool calls that were not available.
 *
 * This handles cases where the LLM attempted to call a tool that was not
 * made available to it in the request. This takes priority over all other
 * tool renderers (including specialized ones like ShellExecutionToolRenderer)
 * since unavailable tools should never be processed by tool-specific renderers.
 */
@injectable()
export class NotAvailableToolCallRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    canHandle(response: ChatResponseContent): number {
        if (ToolCallChatResponseContent.is(response) && response.finished) {
            if (ToolCallChatResponseContent.isNotAvailableResult(response.result)) {
                return 100;
            }
        }
        return -1;
    }

    render(response: ToolCallChatResponseContent, _parentNode: ResponseNode): ReactNode {
        const errorMessage = ToolCallChatResponseContent.getErrorMessage(response.result);
        return (
            <div className='theia-toolCall'>
                <span className='theia-toolCall-unavailable'>
                    <span className={codicon('warning')}></span>
                    {' '}
                    {response.name}: {errorMessage}
                </span>
            </div>
        );
    }
}
