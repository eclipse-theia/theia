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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { ApplicationProps } from '@theia/application-package/lib/application-props';
FrontendApplicationConfigProvider.set({
    ...ApplicationProps.DEFAULT.frontend.config
});

import * as chai from 'chai';
import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import { MarkdownPreviewHandler } from './markdown-preview-handler';

disableJSDOM();

chai.use(require('chai-string'));

let previewHandler: MarkdownPreviewHandler;

before(() => {
    previewHandler = new MarkdownPreviewHandler();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (previewHandler as any).linkNormalizer = {
        normalizeLink: (documentUri: URI, link: string) =>
            'endpoint/' + documentUri.parent.resolve(link).path.toString().substr(1)
    };
});

describe('markdown-preview-handler', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    it('renders html with line information', async () => {
        await assertRenderedContent(exampleMarkdown1, exampleHtml1);
    });

    it('renders images', async () => {
        await assertRenderedContent(exampleMarkdown2, exampleHtml2);
    });

    it('renders HTML image as block', async () => {
        await assertRenderedContent(exampleMarkdown3, exampleHtml3);
    });

    it('renders HTML images inlined', async () => {
        await assertRenderedContent(exampleMarkdown4, exampleHtml4);
    });

    it('renders multiple HTML images in a html block', async () => {
        await assertRenderedContent(exampleMarkdown5, exampleHtml5);
    });

    it('finds element for source line', () => {
        document.body.innerHTML = exampleHtml1;
        const element = previewHandler.findElementForSourceLine(document.body, 4);
        expect(element).not.to.be.equal(undefined);
        expect(element!.tagName).to.be.equal('H2');
        expect(element!.textContent).to.be.equal('License');
    });

    it('finds previous element for empty source line', () => {
        document.body.innerHTML = exampleHtml1;
        const element = previewHandler.findElementForSourceLine(document.body, 3);
        expect(element).not.to.be.equal(undefined);
        expect(element!.tagName).to.be.equal('P');
        expect(element!.textContent).that.startWith('Shows a preview of supported resources.');
    });

    it('finds source line for offset in html', () => {
        mockOffsetProperties();
        document.body.innerHTML = exampleHtml1;
        for (const expectedLine of [0, 1, 4, 5]) {
            const line = previewHandler.getSourceLineForOffset(document.body, offsetForLine(expectedLine));
            expect(line).to.be.equal(expectedLine);
        }
    });

    it('interpolates source lines for offset in html', () => {
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

    it('can handle \'.md\' files', () => {
        expect(previewHandler.canHandle(new URI('a.md'))).greaterThan(0);
    });

    it('can handle \'.markdown\' files', () => {
        expect(previewHandler.canHandle(new URI('a.markdown'))).greaterThan(0);
    });
});

async function assertRenderedContent(source: string, expectation: string): Promise<void> {
    const contentElement = previewHandler.renderContent({ content: source, originUri: new URI('file:///workspace/DEMO.md') });
    expect(contentElement.innerHTML).equals(expectation);
}

const exampleMarkdown1 = //
    `# Theia - Preview Extension
Shows a preview of supported resources.
See [here](https://github.com/eclipse-theia/theia).

## License
[Apache-2.0](https://github.com/eclipse-theia/theia/blob/master/LICENSE)
`;

const exampleHtml1 = //
    `<h1 data-line="0" class="line" id="theia---preview-extension">Theia - Preview Extension</h1>
<p data-line="1" class="line">Shows a preview of supported resources.
See <a href="https://github.com/eclipse-theia/theia">here</a>.</p>
<h2 data-line="4" class="line" id="license">License</h2>
<p data-line="5" class="line"><a href="https://github.com/eclipse-theia/theia/blob/master/LICENSE">Apache-2.0</a></p>
`;

const exampleMarkdown2 = //
    `# Heading
![alternativetext](subfolder/image.png)
`;

const exampleHtml2 = //
    `<h1 data-line="0" class="line" id="heading">Heading</h1>
<p data-line="1" class="line"><img alt="alternativetext" src="endpoint/workspace/subfolder/image.png"></p>
`;

const exampleMarkdown3 = //
    `# Block HTML Image
<img src="subfolder/image1.png" alt="tada"/>

# Block HTML Image
 <img src="subfolder/image3.png" alt="tada"/>
`;

const exampleHtml3 = //
    `<h1 data-line="0" class="line" id="block-html-image">Block HTML Image</h1>
<img alt="tada" src="endpoint/workspace/subfolder/image1.png">
<h1 data-line="3" class="line" id="block-html-image-2">Block HTML Image</h1>
<img alt="tada" src="endpoint/workspace/subfolder/image3.png">
`;

const exampleMarkdown4 = //
    `# Inlined HTML Image
text in paragraph <img src="subfolder/image2.png" alt="tada"/>
`;

const exampleHtml4 = //
    `<h1 data-line="0" class="line" id="inlined-html-image">Inlined HTML Image</h1>
<p data-line="1" class="line">text in paragraph <img alt="tada" src="endpoint/workspace/subfolder/image2.png"></p>
`;

const exampleMarkdown5 = //
    `# Multiple HTML Images nested in blocks
word  <p>
<img src="subfolder/image2.png" alt="tada"/>
</p>

<p>
<img src="subfolder/image2.png" alt="tada"/>
</p>
`;

const exampleHtml5 = //
    `<h1 data-line="0" class="line" id="multiple-html-images-nested-in-blocks">Multiple HTML Images nested in blocks</h1>
<p data-line="1" class="line">word  </p><p>
<img alt="tada" src="endpoint/workspace/subfolder/image2.png"></p>
<p></p>
<p>
<img alt="tada" src="endpoint/workspace/subfolder/image2.png">
</p>
`;

/**
 * `offsetTop` of elements to be `sourceLine` number times `20`.
 */
function mockOffsetProperties(): void {
    Object.defineProperties(HTMLElement.prototype, {
        offsetLeft: {
            get: () => 0
        },
        offsetTop: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            get: function (): any {
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

function offsetForLine(line: number): number {
    return line * 20;
}
