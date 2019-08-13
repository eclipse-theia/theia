/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { OpenerService } from '@theia/core/lib/browser';
import { isOSX } from '@theia/core/lib/common';

import * as hljs from 'highlight.js';
import * as markdownit from 'markdown-it';
import * as anchor from 'markdown-it-anchor';
import { PreviewUri } from '../preview-uri';
import { PreviewHandler, RenderContentParams } from '../preview-handler';
import { PreviewOpenerOptions } from '../preview-contribution';
import { PreviewLinkNormalizer } from '../preview-link-normalizer';

@injectable()
export class MarkdownPreviewHandler implements PreviewHandler {

    readonly iconClass: string = 'markdown-icon file-icon';
    readonly contentClass: string = 'markdown-preview';

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(PreviewLinkNormalizer)
    protected readonly linkNormalizer: PreviewLinkNormalizer;

    canHandle(uri: URI): number {
        return uri.scheme === 'file' && uri.path.ext.toLowerCase() === '.md' ? 500 : 0;
    }

    renderContent(params: RenderContentParams): HTMLElement {
        const content = params.content;
        const renderedContent = this.getEngine().render(content, params);
        const contentElement = document.createElement('div');
        contentElement.classList.add(this.contentClass);
        contentElement.innerHTML = renderedContent;
        this.addLinkClickedListener(contentElement, params);
        return contentElement;
    }

    protected addLinkClickedListener(contentElement: HTMLElement, params: RenderContentParams): void {
        contentElement.addEventListener('click', (event: MouseEvent) => {
            const candidate = (event.target || event.srcElement) as HTMLElement;
            const link = this.findLink(candidate, contentElement);
            if (link) {
                event.preventDefault();
                if (link.startsWith('#')) {
                    this.revealFragment(contentElement, link);
                } else {
                    const preview = !(isOSX ? event.metaKey : event.ctrlKey);
                    const uri = this.resolveUri(link, params.originUri, preview);
                    this.openLink(uri, params.originUri);
                }
            }
        });
    }

    protected findLink(element: HTMLElement, container: HTMLElement): string | undefined {
        let candidate = element;
        while (candidate.tagName !== 'A') {
            if (candidate === container) {
                return;
            }
            candidate = candidate.parentElement!;
            if (!candidate) {
                return;
            }
        }
        return candidate.getAttribute('href') || undefined;
    }

    protected async openLink(uri: URI, originUri: URI): Promise<void> {
        const opener = await this.openerService.getOpener(uri);
        opener.open(uri, <PreviewOpenerOptions>{ originUri });
    }

    protected resolveUri(link: string, uri: URI, preview: boolean): URI {
        const linkURI = new URI(link);
        if (!linkURI.path.isAbsolute && (
            !(linkURI.scheme || linkURI.authority) ||
            (linkURI.scheme === uri.scheme && linkURI.authority === uri.authority)
        )) {
            const resolvedUri = uri.parent.resolve(linkURI.path).withFragment(linkURI.fragment).withQuery(linkURI.query);
            return preview ? PreviewUri.encode(resolvedUri) : resolvedUri;
        }
        return linkURI;
    }

    protected revealFragment(contentElement: HTMLElement, fragment: string): void {
        const elementToReveal = this.findElementForFragment(contentElement, fragment);
        if (!elementToReveal) {
            return;
        }
        elementToReveal.scrollIntoView();
    }

    findElementForFragment(content: HTMLElement, link: string): HTMLElement | undefined {
        const fragment = link.startsWith('#') ? link.substring(1) : link;
        const filter: NodeFilter = {
            acceptNode: (node: Node) => {
                if (node instanceof HTMLHeadingElement) {
                    if (node.tagName.toLowerCase().startsWith('h') && node.id === fragment) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                }
                return NodeFilter.FILTER_SKIP;
            }
        };
        const treeWalker = document.createTreeWalker(content, NodeFilter.SHOW_ELEMENT, filter, false);
        if (treeWalker.nextNode()) {
            const element = treeWalker.currentNode as HTMLElement;
            return element;
        }
        return undefined;
    }

    findElementForSourceLine(content: HTMLElement, sourceLine: number): HTMLElement | undefined {
        const markedElements = content.getElementsByClassName('line');
        let matchedElement: HTMLElement | undefined;
        for (let i = 0; i < markedElements.length; i++) {
            const element = markedElements[i];
            const line = Number.parseInt(element.getAttribute('data-line') || '0');
            if (line > sourceLine) {
                break;
            }
            matchedElement = element as HTMLElement;
        }
        return matchedElement;
    }

    getSourceLineForOffset(content: HTMLElement, offset: number): number | undefined {
        const lineElements = this.getLineElementsAtOffset(content, offset);
        if (lineElements.length < 1) {
            return undefined;
        }
        const firstLineNumber = this.getLineNumberFromAttribute(lineElements[0]);
        if (firstLineNumber === undefined) {
            return undefined;
        }
        if (lineElements.length === 1) {
            return firstLineNumber;
        }
        const secondLineNumber = this.getLineNumberFromAttribute(lineElements[1]);
        if (secondLineNumber === undefined) {
            return firstLineNumber;
        }
        const y1 = lineElements[0].offsetTop;
        const y2 = lineElements[1].offsetTop;
        const dY = (offset - y1) / (y2 - y1);
        const dL = (secondLineNumber - firstLineNumber) * dY;
        const line = firstLineNumber + Math.floor(dL);
        return line;
    }

    /**
     * returns two significant line elements for the given offset.
     */
    protected getLineElementsAtOffset(content: HTMLElement, offset: number): HTMLElement[] {
        let skipNext = false;
        const filter: NodeFilter = {
            acceptNode: (node: Node) => {
                if (node instanceof HTMLElement) {
                    if (node.classList.contains('line')) {
                        if (skipNext) {
                            return NodeFilter.FILTER_SKIP;
                        }
                        if (node.offsetTop > offset) {
                            skipNext = true;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                }
                return NodeFilter.FILTER_REJECT;
            }
        };
        const treeWalker = document.createTreeWalker(content, NodeFilter.SHOW_ELEMENT, filter, false);
        const lineElements: HTMLElement[] = [];
        while (treeWalker.nextNode()) {
            const element = treeWalker.currentNode as HTMLElement;
            lineElements.push(element);
        }
        return lineElements.slice(-2);
    }

    protected getLineNumberFromAttribute(element: HTMLElement): number | undefined {
        const attribute = element.getAttribute('data-line');
        return attribute ? Number.parseInt(attribute) : undefined;
    }

    protected engine: markdownit | undefined;
    protected getEngine(): markdownit {
        if (!this.engine) {
            const engine: markdownit = this.engine = markdownit({
                html: true,
                linkify: true,
                highlight: (str, lang) => {
                    if (lang && hljs.getLanguage(lang)) {
                        try {
                            return '<pre class="hljs"><code><div>' + hljs.highlight(lang, str, true).value + '</div></code></pre>';
                        } catch { }
                    }
                    return '<pre class="hljs"><code><div>' + engine.utils.escapeHtml(str) + '</div></code></pre>';
                }
            });
            const renderers = ['heading_open', 'paragraph_open', 'list_item_open', 'blockquote_open', 'code_block', 'image', 'fence'];
            for (const renderer of renderers) {
                const originalRenderer = engine.renderer.rules[renderer];
                engine.renderer.rules[renderer] = (tokens, index, options, env, self) => {
                    const token = tokens[index];
                    if (token.map) {
                        const line = token.map[0];
                        token.attrJoin('class', 'line');
                        token.attrSet('data-line', line.toString());
                    }
                    return (originalRenderer)
                        // tslint:disable-next-line:no-void-expression
                        ? originalRenderer(tokens, index, options, env, self)
                        : self.renderToken(tokens, index, options);
                };
            }
            const originalImageRenderer = engine.renderer.rules['image'];
            engine.renderer.rules['image'] = (tokens, index, options, env, self) => {
                if (RenderContentParams.is(env)) {
                    const documentUri = env.originUri;
                    const token = tokens[index];
                    if (token.attrs) {
                        const srcAttr = token.attrs.find(a => a[0] === 'src');
                        if (srcAttr) {
                            const href = srcAttr[1];
                            srcAttr[1] = this.linkNormalizer.normalizeLink(documentUri, href);
                        }
                    }
                }
                // tslint:disable-next-line:no-void-expression
                return originalImageRenderer(tokens, index, options, env, self);
            };

            const domParser = new DOMParser();

            const parseDOM = (html: string) =>
                domParser.parseFromString(html, 'text/html').getElementsByTagName('body')[0] as HTMLElement;

            const modifyDOM = (body: HTMLElement, tag: string, procedure: (element: Element) => void) => {
                const elements = body.getElementsByTagName(tag);
                for (let i = 0; i < elements.length; i++) {
                    const element = elements.item(i);
                    if (element) {
                        procedure(element);
                    }
                }
            };

            const normalizeAllImgSrcInHTML = (html: string, normalizeLink: (link: string) => string) => {
                const body = parseDOM(html);
                modifyDOM(body, 'img', img => {
                    const src = img.getAttributeNode('src');
                    if (src) {
                        src.nodeValue = normalizeLink(src.nodeValue || '');
                    }
                });
                return body.innerHTML;
            };

            for (const name of ['html_block', 'html_inline']) {
                const originalRenderer = engine.renderer.rules[name];
                engine.renderer.rules[name] = (tokens, index, options, env, self) => {
                    const currentToken = tokens[index];
                    const content = currentToken.content;
                    if (content.includes('<img') && RenderContentParams.is(env)) {
                        const documentUri = env.originUri;
                        currentToken.content = normalizeAllImgSrcInHTML(content, link => this.linkNormalizer.normalizeLink(documentUri, link));
                    }
                    // tslint:disable-next-line:no-void-expression
                    return originalRenderer(tokens, index, options, env, self);
                };
            }

            anchor(engine, {});
        }
        return this.engine;
    }

}
