// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import * as DOMPurify from 'dompurify';
import { injectable, inject, postConstruct } from 'inversify';
import * as markdownit from 'markdown-it';
import { MarkdownString } from '../../common/markdown-rendering/markdown-string';
import { Disposable, DisposableGroup } from '../../common';
import { LabelParser } from '../label-parser';
import { codicon } from '../widgets';

// #region Copied from Copied from https://github.com/microsoft/vscode/blob/7d9b1c37f8e5ae3772782ba3b09d827eb3fdd833/src/vs/base/browser/formattedTextRenderer.ts
export interface ContentActionHandler {
    callback: (content: string, event?: MouseEvent | KeyboardEvent) => void;
    readonly disposables: DisposableGroup;
}

export interface FormattedTextRenderOptions {
    readonly className?: string;
    readonly inline?: boolean;
    readonly actionHandler?: ContentActionHandler;
    readonly renderCodeSegments?: boolean;
}

// #endregion

// #region Copied from Copied from https://github.com/microsoft/vscode/blob/7d9b1c37f8e5ae3772782ba3b09d827eb3fdd833/src/vs/base/browser/markdownRenderer.ts

export interface MarkdownRenderResult extends Disposable {
    element: HTMLElement;
}

export interface MarkdownRenderOptions extends FormattedTextRenderOptions {
    readonly codeBlockRenderer?: (languageId: string, value: string) => Promise<HTMLElement>;
    readonly asyncRenderCallback?: () => void;
}

// #endregion

/** Use this directly if you aren't worried about circular dependencies in the Shell */
export const MarkdownRenderer = Symbol('MarkdownRenderer');
export interface MarkdownRenderer {
    render(markdown: MarkdownString | undefined, options?: MarkdownRenderOptions): MarkdownRenderResult;
}

/** Use this to avoid circular dependencies in the Shell */
export const MarkdownRendererFactory = Symbol('MarkdownRendererFactory');
export interface MarkdownRendererFactory {
    (): MarkdownRenderer;
}

@injectable()
export class MarkdownRendererImpl implements MarkdownRenderer {
    @inject(LabelParser) protected readonly labelParser: LabelParser;
    protected readonly markdownIt = markdownit();
    protected resetRenderer: Disposable | undefined;

    @postConstruct()
    protected init(): void {
        this.markdownItPlugin();
    }

    render(markdown: MarkdownString | undefined, options?: MarkdownRenderOptions): MarkdownRenderResult {
        const host = document.createElement('div');
        if (markdown) {
            const html = this.markdownIt.render(markdown.value);
            host.innerHTML = DOMPurify.sanitize(html, {
                ALLOW_UNKNOWN_PROTOCOLS: true // DOMPurify usually strips non http(s) links from hrefs
            });
        }
        return { element: host, dispose: () => { } };
    }

    protected markdownItPlugin(): void {
        this.markdownIt.renderer.rules.text = (tokens, idx) => {
            const content = tokens[idx].content;
            return this.labelParser.parse(content).map(chunk => {
                if (typeof chunk === 'string') {
                    return chunk;
                }
                return `<i class="${codicon(chunk.name)} ${chunk.animation ? `fa-${chunk.animation}` : ''} icon-inline"></i>`;
            }).join('');
        };
    }
}
