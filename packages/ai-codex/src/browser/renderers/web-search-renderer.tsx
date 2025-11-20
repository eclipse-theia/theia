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

import { ChatResponsePartRenderer } from '@theia/ai-chat-ui/lib/browser/chat-response-part-renderer';
import { ChatResponseContent } from '@theia/ai-chat/lib/common';
import { codicon } from '@theia/core/lib/browser';
import { nls } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactNode } from '@theia/core/shared/react';
import type { WebSearchItem } from '@openai/codex-sdk';
import { CodexToolCallChatResponseContent } from '../codex-tool-call-content';

@injectable()
export class WebSearchRenderer implements ChatResponsePartRenderer<CodexToolCallChatResponseContent> {

    canHandle(response: ChatResponseContent): number {
        return response.kind === 'toolCall' &&
            (response as CodexToolCallChatResponseContent).name === 'web_search'
            ? 15
            : 0;
    }

    render(content: CodexToolCallChatResponseContent): ReactNode {
        let item: WebSearchItem | undefined;

        if (content.result) {
            try {
                item = typeof content.result === 'string'
                    ? JSON.parse(content.result)
                    : content.result as WebSearchItem;
            } catch (error) {
                console.error('Failed to parse web_search result:', error);
                return undefined;
            }
        }

        if (!item) {
            const args = content.arguments ? JSON.parse(content.arguments) : {};
            return <WebSearchInProgressComponent query={args.query || ''} />;
        }

        return <WebSearchCompletedComponent item={item} />;
    }
}

const WebSearchInProgressComponent: React.FC<{ query: string }> = ({ query }) => (
    <div className="codex-tool container">
        <div className="codex-tool header">
            <div className="codex-tool header-left">
                <span className="codex-tool title">{nls.localize('theia/ai/codex/searching', 'Searching')}</span>
                <span className={`${codicon('loading')} codex-tool icon theia-animation-spin`} />
                <span className="codex-tool command">{query}</span>
            </div>
            <div className="codex-tool header-right">
                <span className="codex-tool badge">{nls.localize('theia/ai/codex/webSearch', 'Web Search')}</span>
            </div>
        </div>
    </div>
);

const WebSearchCompletedComponent: React.FC<{ item: WebSearchItem }> = ({ item }) => (
    <div className="codex-tool container">
        <div className="codex-tool header">
            <div className="codex-tool header-left">
                <span className="codex-tool title">{nls.localize('theia/ai/codex/searched', 'Searched')}</span>
                <span className={`${codicon('globe')} codex-tool icon`} />
                <span className="codex-tool command">{item.query}</span>
            </div>
            <div className="codex-tool header-right">
                <span className="codex-tool badge">{nls.localize('theia/ai/codex/webSearch', 'Web Search')}</span>
            </div>
        </div>
    </div>
);
