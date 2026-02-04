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

import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatResponseContent, SummaryChatResponseContent } from '@theia/ai-chat/lib/common';
import { ReactNode } from '@theia/core/shared/react';
import { nls } from '@theia/core/lib/common/nls';
import * as React from '@theia/core/shared/react';
import { OpenerService } from '@theia/core/lib/browser';
import { useMarkdownRendering } from './markdown-part-renderer';

/**
 * Renderer for SummaryChatResponseContent.
 * Displays the summary in a collapsible section that is collapsed by default.
 */
@injectable()
export class SummaryPartRenderer implements ChatResponsePartRenderer<SummaryChatResponseContent> {

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    canHandle(response: ChatResponseContent): number {
        if (SummaryChatResponseContent.is(response)) {
            return 10;
        }
        return -1;
    }

    render(response: SummaryChatResponseContent): ReactNode {
        return <SummaryContent content={response.content} openerService={this.openerService} />;
    }
}

interface SummaryContentProps {
    content: string;
    openerService: OpenerService;
}

const SummaryContent: React.FC<SummaryContentProps> = ({ content, openerService }) => {
    const contentRef = useMarkdownRendering(content, openerService);

    return (
        <div className='theia-chat-summary'>
            <details>
                <summary>
                    <span className='codicon codicon-bookmark'></span>
                    {nls.localize('theia/ai/chat-ui/summary-part-renderer/conversationSummary', 'Conversation Summary')}
                </summary>
                <div className='theia-chat-summary-content' ref={contentRef}></div>
            </details>
        </div>
    );
};
