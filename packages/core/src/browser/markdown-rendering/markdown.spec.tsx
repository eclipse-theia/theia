// *****************************************************************************
// Copyright (C) 2025 EclipseSource and others.
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

import * as assert from 'assert';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { enableJSDOM } from '../test/jsdom';
import { Markdown, LocalizedMarkdown } from './markdown';
import { MarkdownRenderer } from './markdown-renderer';
import { MarkdownString, MarkdownStringImpl } from '../../common/markdown-rendering/markdown-string';

let disableJSDOM: () => void;

describe('Markdown', () => {
    let mockRenderer: MarkdownRenderer & { lastRenderedMarkdown?: MarkdownString };
    let container: HTMLElement;
    let root: Root;

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        mockRenderer = {
            lastRenderedMarkdown: undefined,
            render: (markdown: MarkdownString | undefined) => {
                // Store the markdown for verification
                if (typeof markdown === 'object' && 'value' in markdown) {
                    mockRenderer.lastRenderedMarkdown = markdown;
                }
                const div = document.createElement('div');
                if (markdown) {
                    const p = document.createElement('p');
                    const value = typeof markdown === 'object' && 'value' in markdown
                        ? markdown.value
                        : String(markdown);
                    p.textContent = value;
                    div.appendChild(p);
                }
                return {
                    element: div,
                    dispose: () => { }
                };
            }
        };
    });

    afterEach(() => {
        root.unmount();
        document.body.removeChild(container);
    });

    it('should render markdown content', done => {
        root.render(
            <Markdown
                markdown="**Hello World**"
                markdownRenderer={mockRenderer}
                className="test-class"
            />
        );

        setTimeout(() => {
            const div = container.querySelector('.test-class');
            assert.ok(div, 'Container should exist');
            assert.ok(div?.textContent?.includes('Hello World'), 'Should contain markdown text');
            done();
        }, 50);
    });

    it('should render empty div when markdown is undefined', done => {
        root.render(
            <Markdown
                markdown={undefined}
                markdownRenderer={mockRenderer}
                className="test-class"
            />
        );

        setTimeout(() => {
            const div = container.querySelector('.test-class');
            assert.ok(div, 'Container should exist');
            assert.strictEqual(div?.childNodes.length, 0, 'Should have no children');
            done();
        }, 50);
    });

    it('should render empty div when markdown is empty string', done => {
        root.render(
            <Markdown
                markdown=""
                markdownRenderer={mockRenderer}
                className="test-class"
            />
        );

        setTimeout(() => {
            const div = container.querySelector('.test-class');
            assert.ok(div, 'Container should exist');
            assert.strictEqual(div?.childNodes.length, 0, 'Should have no children');
            done();
        }, 50);
    });

    it('should render empty div when markdown is whitespace only', done => {
        root.render(
            <Markdown
                markdown="   "
                markdownRenderer={mockRenderer}
                className="test-class"
            />
        );

        setTimeout(() => {
            const div = container.querySelector('.test-class');
            assert.ok(div, 'Container should exist');
            assert.strictEqual(div?.childNodes.length, 0, 'Should have no children');
            done();
        }, 50);
    });

    it('should accept MarkdownString object', done => {
        const markdownString = new MarkdownStringImpl('**Bold Text**');
        root.render(
            <Markdown
                markdown={markdownString}
                markdownRenderer={mockRenderer}
                className="test-class"
            />
        );

        setTimeout(() => {
            const div = container.querySelector('.test-class');
            assert.ok(div, 'Container should exist');
            assert.ok(div?.textContent?.includes('Bold Text'), 'Should contain markdown text');
            done();
        }, 50);
    });

    it('should call onRender callback when content is rendered', done => {
        let renderCallbackCalled = false;
        let receivedElement: HTMLElement | undefined;

        root.render(
            <Markdown
                markdown="Test content"
                markdownRenderer={mockRenderer}
                className="test-class"
                onRender={element => {
                    renderCallbackCalled = true;
                    receivedElement = element;
                }}
            />
        );

        setTimeout(() => {
            assert.ok(renderCallbackCalled, 'onRender should be called');
            assert.ok(receivedElement, 'Should receive element');
            done();
        }, 50);
    });

    it('should call onRender callback with undefined when content is empty', done => {
        let renderCallbackCalled = false;
        let receivedElement: HTMLElement | undefined = document.createElement('div'); // Initialize to non-undefined

        root.render(
            <Markdown
                markdown={undefined}
                markdownRenderer={mockRenderer}
                className="test-class"
                onRender={element => {
                    renderCallbackCalled = true;
                    receivedElement = element;
                }}
            />
        );

        setTimeout(() => {
            assert.ok(renderCallbackCalled, 'onRender should be called even for empty content');
            assert.strictEqual(receivedElement, undefined, 'Should receive undefined for empty content');
            done();
        }, 100);
    });

    it('should apply className to container', done => {
        root.render(
            <Markdown
                markdown="Test"
                markdownRenderer={mockRenderer}
                className="custom-class"
            />
        );

        setTimeout(() => {
            const div = container.querySelector('.custom-class');
            assert.ok(div, 'Container with custom class should exist');
            done();
        }, 50);
    });
});

describe('LocalizedMarkdown', () => {
    let mockRenderer: MarkdownRenderer & { lastRenderedMarkdown?: MarkdownString };
    let container: HTMLElement;
    let root: Root;

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        mockRenderer = {
            lastRenderedMarkdown: undefined,
            render: (markdown: MarkdownString | undefined) => {
                // Store the markdown for verification
                if (typeof markdown === 'object' && 'value' in markdown) {
                    mockRenderer.lastRenderedMarkdown = markdown;
                }
                const div = document.createElement('div');
                if (markdown) {
                    const p = document.createElement('p');
                    const value = typeof markdown === 'object' && 'value' in markdown
                        ? markdown.value
                        : String(markdown);
                    p.textContent = value;
                    div.appendChild(p);
                }
                return {
                    element: div,
                    dispose: () => { }
                };
            }
        };
    });

    afterEach(() => {
        root.unmount();
        document.body.removeChild(container);
    });

    it('should render localized markdown content', done => {
        root.render(
            <LocalizedMarkdown
                localizationKey="test/basic"
                defaultMarkdown="Welcome to **Theia**!"
                markdownRenderer={mockRenderer}
                className="test-class"
            />
        );

        setTimeout(() => {
            const div = container.querySelector('.test-class');
            assert.ok(div, 'Container should exist');
            // The content should be localized (though in tests it will be the default)
            assert.ok(div?.textContent?.includes('Theia'), 'Should contain localized text');
            done();
        }, 50);
    });

    it('should render localized markdown with parameters', done => {
        root.render(
            <LocalizedMarkdown
                localizationKey="test/greeting"
                defaultMarkdown="Hello **{0}**! You have {1} messages."
                args={['Alice', 5]}
                markdownRenderer={mockRenderer}
                className="test-class"
            />
        );

        setTimeout(() => {
            const div = container.querySelector('.test-class');
            assert.ok(div, 'Container should exist');
            assert.ok(div?.textContent?.includes('Alice'), 'Should contain first parameter');
            assert.ok(div?.textContent?.includes('5'), 'Should contain second parameter');
            done();
        }, 50);
    });

    it('should render empty div when default markdown is empty', done => {
        root.render(
            <LocalizedMarkdown
                localizationKey="test/empty"
                defaultMarkdown=""
                markdownRenderer={mockRenderer}
                className="test-class"
            />
        );

        setTimeout(() => {
            const div = container.querySelector('.test-class');
            assert.ok(div, 'Container should exist');
            assert.strictEqual(div?.childNodes.length, 0, 'Should have no children');
            done();
        }, 50);
    });

    it('should update when localization key changes', done => {
        const { rerender } = { rerender: (element: React.ReactElement) => root.render(element) };

        root.render(
            <LocalizedMarkdown
                localizationKey="test/first"
                defaultMarkdown="First content"
                markdownRenderer={mockRenderer}
                className="test-class"
            />
        );

        setTimeout(() => {
            const div = container.querySelector('.test-class');
            assert.ok(div?.textContent?.includes('First'), 'Should contain first content');

            rerender(
                <LocalizedMarkdown
                    localizationKey="test/second"
                    defaultMarkdown="Second content"
                    markdownRenderer={mockRenderer}
                    className="test-class"
                />
            );

            setTimeout(() => {
                const updatedDiv = container.querySelector('.test-class');
                assert.ok(updatedDiv?.textContent?.includes('Second'), 'Should contain second content');
                done();
            }, 50);
        }, 50);
    });

    it('should pass markdown options correctly', done => {
        root.render(
            <LocalizedMarkdown
                localizationKey="test/html"
                defaultMarkdown="Content with <span>HTML</span>"
                markdownRenderer={mockRenderer}
                className="test-class"
                markdownOptions={{ supportHtml: true, supportThemeIcons: true, isTrusted: true }}
            />
        );

        setTimeout(() => {
            const div = container.querySelector('.test-class');
            assert.ok(div, 'Container should exist');
            assert.ok(mockRenderer.lastRenderedMarkdown, 'Should have rendered markdown');
            assert.strictEqual(mockRenderer.lastRenderedMarkdown?.supportHtml, true, 'Should pass supportHtml option');
            assert.strictEqual(mockRenderer.lastRenderedMarkdown?.supportThemeIcons, true, 'Should pass supportThemeIcons option');
            assert.strictEqual(mockRenderer.lastRenderedMarkdown?.isTrusted, true, 'Should pass isTrusted option');
            done();
        }, 50);
    });
});
