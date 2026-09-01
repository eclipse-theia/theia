// *****************************************************************************
// Copyright (C) 2026 Renesas Electronics Corporation and others.
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

import { MarkdownRenderer, MarkdownRenderOptions } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { Disposable } from '@theia/core/lib/common/disposable';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import * as React from '@theia/core/shared/react';
import * as assert from 'assert';
import { createRoot, Root } from 'react-dom/client';
import * as sinon from 'sinon';
import { renderWalkthroughCodeBlock } from './walkthrough-code-block-renderer';
import { WalkthroughImageMedia } from './walkthrough-image-media';
import { WalkthroughMarkdownMedia } from './walkthrough-markdown-media';
import { WalkthroughMedia } from './walkthrough-media';
import {
    createThemedSvgDocument,
    isSafeWalkthroughLink,
    isSvgLinkMessage,
    removeSvgScripts,
    resolveWalkthroughImageSource,
} from './walkthrough-media-utils';

let disableJSDOM = enableJSDOM();

const logger = new MockLogger();
const themeService = {
    getCurrentTheme: () => ({ id: 'test', label: 'Test', type: 'dark' }),
    onDidColorThemeChange: () => Disposable.NULL,
} as unknown as ThemeService;

describe('WalkthroughMedia', () => {
    let container: HTMLElement;
    let root: Root;

    before(() => (disableJSDOM = enableJSDOM()));
    after(() => disableJSDOM());
    beforeEach(() => {
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });
    afterEach(() => {
        root.unmount();
        container.remove();
        sinon.restore();
    });

    it('selects the VS Code image variant for every theme type', () => {
        const image = { dark: 'dark.png', light: 'light.png', hc: 'hc.png', hcLight: 'hc-light.png' };
        assert.strictEqual(resolveWalkthroughImageSource(image, 'dark'), 'dark.png');
        assert.strictEqual(resolveWalkthroughImageSource(image, 'light'), 'light.png');
        assert.strictEqual(resolveWalkthroughImageSource(image, 'hc'), 'hc.png');
        assert.strictEqual(resolveWalkthroughImageSource(image, 'hcLight'), 'hc-light.png');
        assert.strictEqual(resolveWalkthroughImageSource('image.png', 'light'), 'image.png');
    });

    it('removes executable SVG content and bridges Theia theme variables', () => {
        document.documentElement.style.setProperty('--theia-editor-foreground', 'rgb(1, 2, 3)');
        const documentText = createThemedSvgDocument(
            '<svg style="color:var(--vscode-editor-foreground)" onclick="bad()"><script>bad()</script></svg>',
        );
        assert.ok(documentText.includes('--vscode-editor-foreground: rgb(1, 2, 3);'));
        assert.ok(!documentText.includes('<script>bad()</script>'));
        assert.ok(!documentText.includes('onclick='));
        assert.strictEqual(removeSvgScripts('<svg onload="bad()"><script>bad()</script></svg>'), '<svg></svg>');
    });

    it('recognizes only valid relayed SVG link messages', () => {
        assert.ok(isSvgLinkMessage({ type: 'theia-walkthrough-svg-link', href: 'command:sample.run' }));
        assert.ok(!isSvgLinkMessage({ type: 'theia-walkthrough-svg-link' }));
        assert.ok(!isSvgLinkMessage(undefined));
        assert.ok(isSafeWalkthroughLink('command:sample.run'));
        assert.ok(isSafeWalkthroughLink('https://theia-ide.org'));
        assert.ok(!isSafeWalkthroughLink('javascript:alert(1)'));
    });

    it('renders the image component and hides it after an image error', done => {
        root.render(<WalkthroughImageMedia image='image.png' alt='Example' themeService={themeService} />);
        setTimeout(() => {
            const image = container.querySelector('img');
            assert.strictEqual(image?.alt, 'Example');
            image?.dispatchEvent(new image.ownerDocument.defaultView!.Event('error', { bubbles: true }));
            setTimeout(() => {
                assert.ok(!container.querySelector('img'));
                done();
            }, 0);
        }, 0);
    });

    it('does not render a media wrapper when a step has no media', done => {
        root.render(
            <WalkthroughMedia
                step={{ id: 'step', title: 'Step', description: '', isComplete: false }}
                markdownRenderer={{} as never}
                logger={logger}
                themeService={themeService}
            />,
        );
        setTimeout(() => {
            assert.strictEqual(container.children.length, 0);
            done();
        }, 0);
    });

    it('uses Monaco’s tokenizing renderer for fenced Markdown code blocks', done => {
        const render = sinon.stub().returns({ element: document.createElement('div'), dispose: () => undefined });
        sinon.stub(globalThis, 'fetch').resolves({ ok: true, text: async () => '```typescript\nconst answer = 42;\n```' } as Response);
        root.render(<WalkthroughMarkdownMedia src='media.md' markdownRenderer={{ render } as unknown as MarkdownRenderer} logger={logger} />);
        setTimeout(() => {
            const options = render.firstCall.args[1] as MarkdownRenderOptions;
            assert.strictEqual(options.codeBlockRenderer, renderWalkthroughCodeBlock);
            done();
        }, 0);
    });

});
