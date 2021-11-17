/********************************************************************************
 * Copyright (C) 2021 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as DOMPurify from 'dompurify';
import * as markdownit from 'markdown-it';

export class MarkdownRenderer {

    protected engine: markdownit;
    protected callbacks = new Map<string, ((element: Element) => Element | void)[]>();

    constructor(engine?: markdownit) {
        this.engine = engine ?? markdownit();
    }

    /**
     * Adds a modification callback that is applied to every element with the specified tag after rendering to HTML.
     *
     * @param tag The tag that this modification applies to.
     * @param callback The modification to apply on every selected rendered element. Can either modify the element in place or return a new element.
     */
    modify<K extends keyof HTMLElementTagNameMap>(tag: K, callback: (element: HTMLElementTagNameMap[K]) => Element | void): MarkdownRenderer {
        if (this.callbacks.has(tag)) {
            this.callbacks.get(tag)!.push(callback);
        } else {
            this.callbacks.set(tag, [callback]);
        }
        return this;
    }

    render(markdown: string): HTMLElement {
        return this.renderInternal(this.engine.render(markdown));
    }

    renderInline(markdown: string): HTMLElement {
        return this.renderInternal(this.engine.renderInline(markdown));
    }

    protected renderInternal(renderedHtml: string): HTMLElement {
        const div = this.sanitizeHtml(renderedHtml);
        for (const [tag, calls] of this.callbacks) {
            for (const callback of calls) {
                const elements = Array.from(div.getElementsByTagName(tag));
                for (const element of elements) {
                    const result = callback(element);
                    if (result) {
                        const parent = element.parentElement;
                        if (parent) {
                            parent.replaceChild(result, element);
                        }
                    }
                }
            }
        }
        return div;
    }

    protected sanitizeHtml(html: string): HTMLElement {
        const div = document.createElement('div');
        div.innerHTML = DOMPurify.sanitize(html);
        return div;
    }
}
