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
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatResponseContent, ServerToolCallChatResponseContent } from '@theia/ai-chat/lib/common';
import * as React from '@theia/core/shared/react';
import { ReactNode } from '@theia/core/shared/react';
import { nls } from '@theia/core/lib/common/nls';
import { codicon, HoverService, OpenerService } from '@theia/core/lib/browser';
import { renderToolCallResult } from './toolcall-result';
import { condenseArguments, formatArgsForTooltip } from './toolcall-utils';

/**
 * Renders a {@link ServerToolCallChatResponseContent}: a tool the provider executed on its own
 * infrastructure. It mirrors the client tool call renderer but never shows a confirmation UI
 * (server tools are auto-approved when selected).
 */
@injectable()
export class ServerToolCallPartRenderer implements ChatResponsePartRenderer<ServerToolCallChatResponseContent> {

    @inject(OpenerService)
    protected openerService: OpenerService;

    @inject(HoverService)
    protected hoverService: HoverService;

    canHandle(response: ChatResponseContent): number {
        if (ServerToolCallChatResponseContent.is(response)) {
            return 10;
        }
        return -1;
    }

    render(response: ServerToolCallChatResponseContent): ReactNode {
        return <ServerToolCallContent
            response={response}
            getArgumentsLabel={args => this.getArgumentsLabel(args)}
            showArgsTooltip={(r, target) => this.showArgsTooltip(r, target)}
            showServerTooltip={target => this.showServerTooltip(target)}
            responseRenderer={r => renderToolCallResult(r.result, this.openerService)}
        />;
    }

    protected showServerTooltip(target: HTMLElement | undefined): void {
        if (!target) {
            return;
        }
        this.hoverService.requestHover({
            content: nls.localize(
                'theia/ai/chat-ui/server-toolcall-part-renderer/serverTooltip',
                "Ran on the provider's servers (not locally). Server tools are auto-approved when selected."
            ),
            target,
            position: 'right'
        });
    }

    protected getArgumentsLabel(args: string | undefined): string {
        if (!args || !args.trim() || args.trim() === '{}') {
            return '';
        }
        return condenseArguments(args) ?? '…';
    }

    protected showArgsTooltip(response: ServerToolCallChatResponseContent, target: HTMLElement | undefined): void {
        if (!target || !response.arguments || !response.arguments.trim() || response.arguments.trim() === '{}') {
            return;
        }
        this.hoverService.requestHover({
            content: formatArgsForTooltip(response.arguments),
            target,
            position: 'right',
            interactive: true,
            cssClasses: ['toolcall-args-hover']
        });
    }
}

const Spinner = () => (
    <span className={`${codicon('loading')} theia-animation-spin`}></span>
);

interface ServerToolCallContentProps {
    response: ServerToolCallChatResponseContent;
    getArgumentsLabel: (args: string | undefined) => string;
    showArgsTooltip: (response: ServerToolCallChatResponseContent, target: HTMLElement | undefined) => void;
    showServerTooltip: (target: HTMLElement | undefined) => void;
    responseRenderer: (response: ServerToolCallChatResponseContent) => ReactNode | undefined;
}

const ServerToolCallContent: React.FC<ServerToolCallContentProps> = ({
    response,
    getArgumentsLabel,
    showArgsTooltip,
    showServerTooltip,
    responseRenderer
}) => {
    const summaryRef = React.useRef<HTMLElement | undefined>(undefined);
    const runningRef = React.useRef<HTMLElement | undefined>(undefined);
    const argsLabel = getArgumentsLabel(response.arguments);

    // mouseover (unlike mouseenter) bubbles up from child crossings, so sliding from the badge back to
    // the rest of the summary re-fires here and the tooltip updates correctly.
    const handleHover = (parentTarget: HTMLElement | undefined) => (e: React.MouseEvent<HTMLElement>) => {
        const badge = (e.target as HTMLElement).closest('.theia-serverToolCall-badge') as HTMLElement | null;
        if (badge) {
            showServerTooltip(badge);
        } else {
            showArgsTooltip(response, parentTarget);
        }
    };

    const serverIndicator = (
        <span className='theia-serverToolCall-badge'>
            {nls.localize('theia/ai/chat-ui/server-toolcall-part-renderer/indicator', 'server')}
        </span>
    );

    return (
        <div className='theia-toolCall'>
            {response.finished ? (
                <details className='theia-toolCall-finished'>
                    <summary
                        ref={(el: HTMLElement | null) => { summaryRef.current = el ?? undefined; }}
                        onMouseOver={handleHover(summaryRef.current)}
                    >
                        {nls.localize('theia/ai/chat-ui/toolcall-part-renderer/finished', 'Ran')} {response.name} {serverIndicator}
                        {' '}(<span className='theia-toolCall-args-label'>{argsLabel}</span>)
                    </summary>
                    <div className='theia-toolCall-response-result'>
                        {responseRenderer(response)}
                    </div>
                </details>
            ) : (
                <span className='theia-toolCall-allowed'
                    ref={(el: HTMLElement | null) => { runningRef.current = el ?? undefined; }}
                    onMouseOver={handleHover(runningRef.current)}
                >
                    <Spinner /> {nls.localizeByDefault('Running')} {response.name} {serverIndicator}
                    {' '}(<span className='theia-toolCall-args-label'>{argsLabel}</span>)
                </span>
            )}
        </div>
    );
};
