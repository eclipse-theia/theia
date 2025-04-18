// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import {
    ChatResponseContent,
    InformationalChatResponseContent,
    MarkdownChatResponseContent,
} from '@theia/ai-chat/lib/common';
import { ReactNode, useEffect, useRef } from '@theia/core/shared/react';
import * as React from '@theia/core/shared/react';
import * as markdownit from '@theia/core/shared/markdown-it';
import * as DOMPurify from '@theia/core/shared/dompurify';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';
import { OpenerService, open } from '@theia/core/lib/browser';
import { URI } from '@theia/core';

@injectable()
export class MarkdownPartRenderer implements ChatResponsePartRenderer<MarkdownChatResponseContent | InformationalChatResponseContent> {
    @inject(OpenerService) protected readonly openerService: OpenerService;
    protected readonly markdownIt = markdownit();
    canHandle(response: ChatResponseContent): number {
        if (MarkdownChatResponseContent.is(response)) {
            return 10;
        }
        if (InformationalChatResponseContent.is(response)) {
            return 10;
        }
        return -1;
    }
    render(response: MarkdownChatResponseContent | InformationalChatResponseContent): ReactNode {
        // TODO let the user configure whether they want to see informational content
        if (InformationalChatResponseContent.is(response)) {
            // null is valid in React
            // eslint-disable-next-line no-null/no-null
            return null;
        }

        return <MarkdownRender response={response} openerService={this.openerService} />;
    }
}

const MarkdownRender = ({ response, openerService }: { response: MarkdownChatResponseContent | InformationalChatResponseContent; openerService: OpenerService }) => {
    const ref = useMarkdownRendering(response.content, openerService);

    return <div ref={ref}></div>;
};

export interface DeclaredEventsEventListenerObject extends EventListenerObject {
    handledEvents?: (keyof HTMLElementEventMap)[];
}

/**
 * This hook uses markdown-it directly to render markdown.
 * The reason to use markdown-it directly is that the MarkdownRenderer is
 * overridden by theia with a monaco version. This monaco version strips all html
 * tags from the markdown with empty content. This leads to unexpected behavior when
 * rendering markdown with html tags.
 *
 * Moreover, we want to intercept link clicks to use the Theia OpenerService instead of the default browser behavior.
 *
 * @param markdown the string to render as markdown
 * @param skipSurroundingParagraph whether to remove a surrounding paragraph element (default: false)
 * @param openerService the service to handle link opening
 * @param eventHandler `handleEvent` will be called by default for `click` events and additionally
 * for all events enumerated in {@link DeclaredEventsEventListenerObject.handledEvents}. If `handleEvent` returns `true`,
 * no additional handlers will be run for the event.
 * @returns the ref to use in an element to render the markdown
 */
export const useMarkdownRendering = (
    markdown: string | MarkdownString,
    openerService: OpenerService,
    skipSurroundingParagraph: boolean = false,
    eventHandler?: DeclaredEventsEventListenerObject
) => {
    // null is valid in React
    // eslint-disable-next-line no-null/no-null
    const ref = useRef<HTMLDivElement | null>(null);
    const markdownString = typeof markdown === 'string' ? markdown : markdown.value;
    useEffect(() => {
        const markdownIt = markdownit();
        const host = document.createElement('div');

        // markdownIt always puts the content in a paragraph element, so we remove it if we don't want that
        const html = skipSurroundingParagraph ? markdownIt.render(markdownString).replace(/^<p>|<\/p>|<p><\/p>$/g, '') : markdownIt.render(markdownString);

        host.innerHTML = DOMPurify.sanitize(html, {
            // DOMPurify usually strips non http(s) links from hrefs
            // but we want to allow them (see handleClick via OpenerService below)
            ALLOW_UNKNOWN_PROTOCOLS: true
        });
        while (ref?.current?.firstChild) {
            ref.current.removeChild(ref.current.firstChild);
        }
        ref?.current?.appendChild(host);

        // intercept link clicks to use the Theia OpenerService instead of the default browser behavior
        const handleClick = (event: MouseEvent) => {
            if ((eventHandler?.handleEvent(event) as unknown) === true) {return; }
            let target = event.target as HTMLElement;
            while (target && target.tagName !== 'A') {
                target = target.parentElement as HTMLElement;
            }
            if (target && target.tagName === 'A') {
                const href = target.getAttribute('href');
                if (href) {
                    open(openerService, new URI(href));
                    event.preventDefault();
                }
            }
        };

        ref?.current?.addEventListener('click', handleClick);
        eventHandler?.handledEvents?.forEach(eventType => eventType !== 'click' && ref?.current?.addEventListener(eventType, eventHandler));
        return () => {
            ref.current?.removeEventListener('click', handleClick);
            eventHandler?.handledEvents?.forEach(eventType => eventType !== 'click' && ref?.current?.removeEventListener(eventType, eventHandler));
        };
    }, [markdownString, skipSurroundingParagraph, openerService]);

    return ref;
};
