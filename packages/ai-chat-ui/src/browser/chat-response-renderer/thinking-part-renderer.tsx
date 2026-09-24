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
import { injectable } from '@theia/core/shared/inversify';
import { ChatResponseContent, ThinkingChatResponseContent } from '@theia/ai-chat/lib/common';
import { ReactNode } from '@theia/core/shared/react';
import { nls } from '@theia/core/lib/common/nls';
import * as React from '@theia/core/shared/react';
import { ResponseNode } from '../chat-tree-view';
import { Spinner } from './spinner';

/**
 * Number of trailing characters of the reasoning the live preview keeps at least. Far more than its
 * few visible lines, so that the dropped text is always well above them, while the browser never has
 * to lay out the whole reasoning.
 */
const PREVIEW_LENGTH = 2000;

/** Duration in milliseconds of the slide that moves the live preview up when a new line starts. */
const PREVIEW_SCROLL_DURATION = 600;

@injectable()
export class ThinkingPartRenderer implements ChatResponsePartRenderer<ThinkingChatResponseContent> {

    canHandle(response: ChatResponseContent): number {
        if (ThinkingChatResponseContent.is(response)) {
            return 10;
        }
        return -1;
    }

    render(response: ThinkingChatResponseContent, parentNode?: ResponseNode): ReactNode {
        return <ThinkingContent response={response} active={this.isThinking(response, parentNode)} />;
    }

    /**
     * A thinking part is still being written iff it is the last content part of a response that is
     * still running: as soon as the answer text or a tool call arrives, a new part becomes the last
     * one. `ThinkingChatResponseContent` carries no completion flag of its own, and chunks are
     * merged into the existing part, so its position in the response is the reliable signal.
     */
    protected isThinking(response: ThinkingChatResponseContent, parentNode?: ResponseNode): boolean {
        const model = parentNode?.response;
        if (!model || model.isComplete || model.isCanceled || model.isError) {
            return false;
        }
        const contents = model.response.content;
        return contents[contents.length - 1] === response;
    }
}

/**
 * Renders the reasoning of an agent. While the agent is still thinking, a spinner and a preview of
 * the last few lines of the streaming reasoning show that it is working, without the reasoning
 * taking over the response. Once the thinking is done, the full reasoning becomes available in a
 * collapsed block the user can expand.
 */
const ThinkingContent: React.FC<{ response: ThinkingChatResponseContent, active: boolean }> = ({ response, active }) => active
    ? <div className='theia-thinking active'>
        <div className='theia-thinking-status'>
            <Spinner /> {nls.localizeByDefault('Thinking')}
        </div>
        <ThinkingPreview content={response.content} />
    </div>
    : <div className='theia-thinking'>
        <details>
            <summary>{nls.localizeByDefault('Thinking')}</summary>
            <pre>{response.content}</pre>
        </details>
    </div>;

interface PreviewParagraph {
    /** Offset of the paragraph in the reasoning; stays the same while the reasoning grows. */
    start: number;
    text: string;
}

/**
 * Splits the tail of the reasoning into its non-empty paragraphs. Only whole paragraphs are dropped
 * from the start, never parts of one, so that the visible lines never re-wrap as the reasoning grows.
 */
const previewParagraphs = (content: string): PreviewParagraph[] => {
    const cut = content.length - PREVIEW_LENGTH;
    let start = cut > 0 ? content.lastIndexOf('\n', cut) + 1 : 0;
    const paragraphs: PreviewParagraph[] = [];
    for (const text of content.slice(start).split('\n')) {
        if (text.trim()) {
            paragraphs.push({ start, text });
        }
        start += text.length + 1;
    }
    return paragraphs;
};

/**
 * The last few lines of the reasoning as it streams in, hidden from assistive technology because the
 * streaming text carries no information on its own. The text is anchored to the bottom, so the newest
 * reasoning always stays visible, while the oldest line dissolves at the top.
 *
 * New text within a line simply appears. When a new line starts, the lines slide up instead of jumping,
 * and a line starting mid-slide continues from the current position rather than restarting.
 */
const ThinkingPreview: React.FC<{ content: string }> = ({ content }) => {
    const boxRef = React.useRef<HTMLDivElement | undefined>(undefined);
    const textRef = React.useRef<HTMLDivElement | undefined>(undefined);
    // The last paragraph of the previous render and its position; how far it has moved up since is
    // how far the lines have to slide.
    const anchorRef = React.useRef<{ start: number, top: number } | undefined>(undefined);
    const [overflowing, setOverflowing] = React.useState(false);
    const paragraphs = React.useMemo(() => previewParagraphs(content), [content]);

    React.useLayoutEffect(() => {
        const box = boxRef.current;
        const text = textRef.current;
        const last = text?.lastElementChild;
        if (!box || !text || !(last instanceof HTMLElement)) {
            return;
        }
        setOverflowing(text.offsetHeight > box.clientHeight);
        const previous = anchorRef.current;
        anchorRef.current = { start: Number(last.dataset.start), top: last.offsetTop };
        const anchor = previous && text.querySelector<HTMLElement>(`[data-start="${previous.start}"]`);
        if (!previous || !anchor || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return;
        }
        const shift = Math.min(previous.top - anchor.offsetTop, box.clientHeight);
        if (shift <= 0) {
            return;
        }
        // Where a running slide currently is, so that the next one picks up from there.
        const transform = getComputedStyle(text).transform;
        const currentOffset = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
        text.getAnimations().forEach(animation => animation.cancel());
        text.animate(
            [{ transform: `translateY(${currentOffset + shift}px)` }, { transform: 'none' }],
            { duration: PREVIEW_SCROLL_DURATION, easing: 'ease-out' }
        );
    }, [paragraphs]);

    return <div
        className={`theia-thinking-preview${overflowing ? ' overflowing' : ''}`}
        aria-hidden={true}
        ref={(element: HTMLDivElement | null) => { boxRef.current = element ?? undefined; }}
    >
        <div className='theia-thinking-preview-text' ref={(element: HTMLDivElement | null) => { textRef.current = element ?? undefined; }}>
            {paragraphs.map(paragraph => <div key={paragraph.start} data-start={paragraph.start}>{paragraph.text}</div>)}
        </div>
    </div>;
};
