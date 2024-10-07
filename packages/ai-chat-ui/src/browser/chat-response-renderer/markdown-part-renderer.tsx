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
import { injectable } from '@theia/core/shared/inversify';
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

@injectable()
export class MarkdownPartRenderer implements ChatResponsePartRenderer<MarkdownChatResponseContent | InformationalChatResponseContent> {
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

        return <MarkdownRender response={response} />;
    }

}

const MarkdownRender = ({ response }: { response: MarkdownChatResponseContent | InformationalChatResponseContent }) => {
    const ref = useMarkdownRendering(response.content);

    return <div ref={ref}></div>;
};

/**
 * This hook uses markdown-it directly to render markdown.
 * The reason to use markdown-it directly is that the MarkdownRenderer is
 * overriden by theia with a monaco version. This monaco version strips all html
 * tags from the markdown with empty content.
 * This leads to unexpected behavior when rendering markdown with html tags.
 *
 * @param markdown the string to render as markdown
 * @returns the ref to use in an element to render the markdown
 */
export const useMarkdownRendering = (markdown: string | MarkdownString) => {
    // eslint-disable-next-line no-null/no-null
    const ref = useRef<HTMLDivElement | null>(null);
    const markdownString = typeof markdown === 'string' ? markdown : markdown.value;
    useEffect(() => {
        const markdownIt = markdownit();
        const host = document.createElement('div');
        const html = markdownIt.render(markdownString);
        host.innerHTML = DOMPurify.sanitize(html, {
            ALLOW_UNKNOWN_PROTOCOLS: true // DOMPurify usually strips non http(s) links from hrefs
        });
        while (ref?.current?.firstChild) {
            ref.current.removeChild(ref.current.firstChild);
        }

        ref?.current?.appendChild(host);
    }, [markdownString]);

    return ref;
};
