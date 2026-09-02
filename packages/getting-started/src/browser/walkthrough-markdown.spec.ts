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

import * as assert from 'assert';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import {
    parseWalkthroughDescription,
    renderKeycaps,
    resolveMarkdownMediaUris,
    toTheiaWalkthroughMarkdown,
} from './walkthrough-markdown';

let disableJSDOM = enableJSDOM();

describe('walkthrough Markdown', () => {
    before(() => (disableJSDOM = enableJSDOM()));
    after(() => disableJSDOM());

    it('preserves VS Code formatted-text semantics', () => {
        assert.strictEqual(
            toTheiaWalkthroughMarkdown(
                '- first\n\nPress <kbd>Enter</kbd> and __italic__ with ``code``.',
            ),
            '\\- first\n\nPress [[theia-walkthrough-keycap:Enter]] and *italic* with `code`.',
        );
    });

    it('parses non-empty description lines in order with standalone and inline links', () => {
        const root = document.createElement('div');
        root.innerHTML = '<p>[[theia-walkthrough-keycap:Enter]]</p>';
        renderKeycaps(root);
        assert.strictEqual(
            root.querySelector('.monaco-keybinding-key')?.textContent,
            'Enter',
        );
        const [standalone, inline] = parseWalkthroughDescription('\n[Run](command:sample.run)\n\nUse [Run](command:sample.run).\n');
        assert.strictEqual(standalone.linkedText.nodes.length, 1);
        assert.deepStrictEqual(standalone.linkedText.nodes[0], { label: 'Run', href: 'command:sample.run' });
        assert.strictEqual(inline.linkedText.nodes.length, 3);
    });

    it('resolves relative Markdown media images against the media document', () => {
        assert.strictEqual(
            resolveMarkdownMediaUris(
                '![Diagram](images/diagram.png)',
                'https://example.test/walkthrough/media.md',
            ),
            '![Diagram](https://example.test/walkthrough/images/diagram.png)',
        );
    });

    it('preserves encoded hosted-plugin paths when resolving Markdown media', () => {
        assert.strictEqual(
            resolveMarkdownMediaUris(
                '![Diagram](images/diagram.png)',
                'https://example.test/hostedPlugin/sample.extension/docs%2Fmedia%2Fwalkthrough.md',
            ),
            '![Diagram](https://example.test/hostedPlugin/sample.extension/docs%2Fmedia%2Fimages%2Fdiagram.png)',
        );
    });
});
