/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * @jest-environment @theia/core/src/browser/test/jsdom-environment
 */

import 'reflect-metadata';

import URI from "@theia/core/lib/common/uri";
import { MarkdownPreviewHandler } from './markdown-preview-handler';

let previewHandler: MarkdownPreviewHandler;

beforeAll(() => {
    previewHandler = new MarkdownPreviewHandler();
});

describe("markdown-preview-handler", () => {

    test("renders html with line information", async () => {
        const contentElement = await previewHandler.renderContent({ content: exampleMarkdown1, originUri: new URI('') });
        expect(contentElement.innerHTML).toEqual(exampleHtml1);
    });

    test("finds element for source line", () => {
        document.body.innerHTML = exampleHtml1;
        const element = previewHandler.findElementForSourceLine(document.body, 4);
        expect(element).not.toEqual(undefined);
        expect(element!.tagName).toEqual('H2');
        expect(element!.textContent).toEqual('License');
    });

    test("finds previous element for empty source line", () => {
        document.body.innerHTML = exampleHtml1;
        const element = previewHandler.findElementForSourceLine(document.body, 3);
        expect(element).not.toEqual(undefined);
        expect(element!.tagName).toEqual('P');
        expect(element!.textContent!.startsWith('Shows a preview of supported resources.')).toEqual(true);
    });

    test("finds source line for offset in html", () => {
        mockOffsetProperties();
        document.body.innerHTML = exampleHtml1;
        for (const expectedLine of [0, 1, 4, 5]) {
            const line = previewHandler.getSourceLineForOffset(document.body, offsetForLine(expectedLine));
            expect(line).toEqual(expectedLine);
        }
    });

    test("interpolates source lines for offset in html", () => {
        mockOffsetProperties();
        document.body.innerHTML = exampleHtml1;
        const expectedLines = [1, 2, 3, 4];
        const offsets = expectedLines.map(l => offsetForLine(l));
        for (let i = 0; i < expectedLines.length; i++) {
            const expectedLine = expectedLines[i];
            const offset = offsets[i];
            const line = previewHandler.getSourceLineForOffset(document.body, offset);
            expect(line).toEqual(expectedLine);
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
    `<h1 id="theia-preview-extension" class="line" data-line="0">Theia - Preview Extension</h1>
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
