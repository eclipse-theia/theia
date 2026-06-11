// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    ChatResponseContent,
    InformationalChatResponseContent,
    MarkdownChatResponseContent,
} from '@theia/ai-chat/lib/common';
import { ChatResponsePartRenderer } from '@theia/ai-chat-ui/lib/browser/chat-response-part-renderer';
import { OpenerService, open } from '@theia/core/lib/browser';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';
import { URI } from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ReactNode, useEffect, useRef } from '@theia/core/shared/react';
import * as React from '@theia/core/shared/react';
import {
    QaapChatMarkdownRenderMode,
    renderChatMarkdownHtml,
    resolveChatMarkdownRenderMode,
} from '../common/qaap-chat-markdown-render';

export const QAAP_CHAT_MARKDOWN_PLAIN_STREAM_CLASS = 'theia-mod-qaap-chat-stream-plain';

export interface QaapMarkdownRenderProps {
    text: string | MarkdownString;
    openerService: OpenerService;
    className?: string;
}

const QaapMarkdownRender: React.FC<QaapMarkdownRenderProps> = ({ text, openerService, className }) => {
    const ref = useQaapMarkdownRendering(text, openerService);
    return <div className={className} ref={ref}></div>;
};

/** Chat markdown renderer — shared markdown-it instance, RAF-coalesced paints, plain streaming when safe. */
@injectable()
export class QaapMarkdownPartRenderer implements ChatResponsePartRenderer<MarkdownChatResponseContent | InformationalChatResponseContent> {

    static readonly PRIORITY = 11;

    @inject(OpenerService) protected readonly openerService: OpenerService;

    canHandle(response: ChatResponseContent): number {
        if (MarkdownChatResponseContent.is(response)) {
            return QaapMarkdownPartRenderer.PRIORITY;
        }
        if (InformationalChatResponseContent.is(response)) {
            return QaapMarkdownPartRenderer.PRIORITY;
        }
        return -1;
    }

    render(response: MarkdownChatResponseContent | InformationalChatResponseContent): ReactNode {
        if (InformationalChatResponseContent.is(response)) {
            // eslint-disable-next-line no-null/no-null
            return null;
        }
        return <QaapMarkdownRender text={response.content} openerService={this.openerService} />;
    }
}

export const useQaapMarkdownRendering = (
    markdown: string | MarkdownString,
    openerService: OpenerService,
    skipSurroundingParagraph = false,
): React.RefObject<HTMLDivElement> => {
    // eslint-disable-next-line no-null/no-null
    const ref = useRef<HTMLDivElement | null>(null);
    const lastMarkdownRef = useRef('');
    const lastModeRef = useRef<QaapChatMarkdownRenderMode | undefined>(undefined);
    const rafRef = useRef(0);
    const markdownString = typeof markdown === 'string' ? markdown : markdown.value;

    useEffect(() => {
        if (markdownString === lastMarkdownRef.current) {
            return undefined;
        }

        const applyRender = (): void => {
            rafRef.current = 0;
            const host = ref.current;
            if (!host) {
                return;
            }
            const mode = resolveChatMarkdownRenderMode(
                markdownString,
                lastMarkdownRef.current,
                lastModeRef.current,
            );
            if (mode === 'plain') {
                host.classList.add(QAAP_CHAT_MARKDOWN_PLAIN_STREAM_CLASS);
                host.replaceChildren();
                host.textContent = markdownString;
                lastMarkdownRef.current = markdownString;
                lastModeRef.current = 'plain';
                return;
            }

            host.classList.remove(QAAP_CHAT_MARKDOWN_PLAIN_STREAM_CLASS);
            const htmlHost = document.createElement('div');
            htmlHost.innerHTML = renderChatMarkdownHtml(markdownString, skipSurroundingParagraph);
            host.replaceChildren(htmlHost);
            lastMarkdownRef.current = markdownString;
            lastModeRef.current = 'full';
        };

        if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(applyRender);
        }

        const handleClick = (event: MouseEvent): void => {
            let target = event.target as HTMLElement;
            while (target && target.tagName !== 'A') {
                target = target.parentElement as HTMLElement;
            }
            if (target?.tagName === 'A') {
                const href = target.getAttribute('href');
                if (href) {
                    open(openerService, new URI(href));
                    event.preventDefault();
                }
            }
        };

        ref.current?.addEventListener('click', handleClick);
        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = 0;
            }
            ref.current?.removeEventListener('click', handleClick);
        };
    }, [markdownString, skipSurroundingParagraph, openerService]);

    return ref;
};
