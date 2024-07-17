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

import { ChatResponsePartRenderer } from '../types';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatResponseContent, isMarkdownChatResponseContent, MarkdownChatResponseContent } from '@theia/ai-chat/lib/common';
import { ReactNode, useEffect, useRef } from '@theia/core/shared/react';
import * as React from '@theia/core/shared/react';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';

@injectable()
export class MarkdownPartRenderer implements ChatResponsePartRenderer<MarkdownChatResponseContent> {
    @inject(MarkdownRenderer) private renderer: MarkdownRenderer;
    canHandle(response: ChatResponseContent): number {
        if (isMarkdownChatResponseContent(response)) {
            return 10;
        }
        return -1;
    }
    private renderMarkdown(md: MarkdownString): HTMLElement {
        return this.renderer.render(md).element;
    }
    render(response: MarkdownChatResponseContent): ReactNode {
        return <MarkdownWrapper data={response.content} renderCallback={this.renderMarkdown.bind(this)}></MarkdownWrapper>;
    }

}

export const MarkdownWrapper = (props: { data: MarkdownString, renderCallback: (md: MarkdownString) => HTMLElement }) => {
    // eslint-disable-next-line no-null/no-null
    const ref: React.MutableRefObject<HTMLDivElement | null> = useRef(null);

    useEffect(() => {
        const myDomElement = props.renderCallback(props.data);

        while (ref?.current?.firstChild) {
            ref.current.removeChild(ref.current.firstChild);
        }

        ref?.current?.appendChild(myDomElement);
    }, [props.data.value]);

    return <div ref={ref}></div>;
};
