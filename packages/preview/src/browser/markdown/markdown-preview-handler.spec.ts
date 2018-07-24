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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import * as chai from 'chai';
import { expect } from 'chai';
import URI from "@theia/core/lib/common/uri";
import { MarkdownPreviewHandler } from './markdown-preview-handler';

disableJSDOM();

chai.use(require('chai-string'));

let previewHandler: MarkdownPreviewHandler;

before(() => {
    previewHandler = new MarkdownPreviewHandler();
});

describe("markdown-preview-handler", () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    it("renders html with line information", async () => {
        const contentElement = await previewHandler.renderContent({ content: exampleMarkdown1, originUri: new URI('') });
        expect(contentElement.innerHTML).equals(exampleHtml1);
    });

    it("finds element for source line", () => {
        document.body.innerHTML = exampleHtml1;
        const element = previewHandler.findElementForSourceLine(document.body, 4);
        expect(element).not.to.be.equal(undefined);
        expect(element!.tagName).to.be.equal('H2');
        expect(element!.textContent).to.be.equal('License');
    });

    it("finds previous element for empty source line", () => {
        document.body.innerHTML = exampleHtml1;
        const element = previewHandler.findElementForSourceLine(document.body, 3);
        expect(element).not.to.be.equal(undefined);
        expect(element!.tagName).to.be.equal('P');
        expect(element!.textContent).that.startWith('Shows a preview of supported resources.');
    });

    it("finds source line for offset in html", () => {
        mockOffsetProperties();
        document.body.innerHTML = exampleHtml1;
        for (const expectedLine of [0, 1, 4, 5]) {
            const line = previewHandler.getSourceLineForOffset(document.body, offsetForLine(expectedLine));
            expect(line).to.be.equal(expectedLine);
        }
    });

    it("interpolates source lines for offset in html", () => {
        mockOffsetProperties();
        document.body.innerHTML = exampleHtml1;
        const expectedLines = [1, 2, 3, 4];
        const offsets = expectedLines.map(l => offsetForLine(l));
        for (let i = 0; i < expectedLines.length; i++) {
            const expectedLine = expectedLines[i];
            const offset = offsets[i];
            const line = previewHandler.getSourceLineForOffset(document.body, offset);
            expect(line).to.be.equal(expectedLine);
        }
    });
});

const exampleMarkdown1 = //
    `# Theia - Preview Extension
Shows a preview of supported resources.
See [here](https://github.com/theia-ide/theia).

## License
[Apache-2.0](https://github.com/theia-ide/theia/blob/master/LICENSE)
`;

const exampleHtml1 = //
    `<h1 id="theia---preview-extension" class="line" data-line="0">Theia - Preview Extension</h1>
<p class="line" data-line="1">Shows a preview of supported resources.
See <a href="https://github.com/theia-ide/theia">here</a>.</p>
<h2 id="license" class="line" data-line="4">License</h2>
<p class="line" data-line="5"><a href="https://github.com/theia-ide/theia/blob/master/LICENSE">Apache-2.0</a></p>
`;

/**
 * `offsetTop` of elements to be `sourceLine` number times `20`.
 */
function mockOffsetProperties() {
    Object.defineProperties(HTMLElement.prototype, {
        offsetLeft: {
            get: () => 0
        },
        offsetTop: {
            get: function () {
                const element = this as HTMLElement;
                const line = Number.parseInt(element.getAttribute('data-line') || '0');
                return offsetForLine(line);
            }
        },
        offsetHeight: {
            get: () => 0
        },
        offsetWidth: {
            get: () => 0
        }
    });
}

function offsetForLine(line: number) {
    return line * 20;
}
