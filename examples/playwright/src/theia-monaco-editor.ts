// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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

import { ElementHandle } from '@playwright/test';
import { TheiaPageObject } from './theia-page-object';
import { TheiaApp } from './theia-app';

export class TheiaMonacoEditor extends TheiaPageObject {
    constructor(protected readonly selector: string, app: TheiaApp) {
        super(app);
    }

    async waitForVisible(): Promise<void> {
        await this.page.waitForSelector(this.selector, { state: 'visible' });
    }

    protected async viewElement(): Promise<ElementHandle<SVGElement | HTMLElement> | null> {
        return this.page.$(this.selector);
    }

    async numberOfLines(): Promise<number | undefined> {
        await this.waitForVisible();
        const viewElement = await this.viewElement();
        const lineElements = await viewElement?.$$('.view-lines .view-line');
        return lineElements?.length;
    }

    async textContentOfLineByLineNumber(lineNumber: number): Promise<string | undefined> {
        await this.waitForVisible();
        const lineElement = await this.lineByLineNumber(lineNumber);
        const content = await lineElement?.textContent();
        return content ? this.replaceEditorSymbolsWithSpace(content) : undefined;
    }

    async lineByLineNumber(lineNumber: number): Promise<ElementHandle<SVGElement | HTMLElement> | undefined> {
        await this.waitForVisible();
        const viewElement = await this.viewElement();
        const lines = await viewElement?.$$('.view-lines > .view-line');
        if (!lines) {
            throw new Error('Couldn\'t retrieve lines of monaco editor');
        }

        const linesWithXCoordinates = [];
        for (const lineElement of lines) {
            const box = await lineElement.boundingBox();
            linesWithXCoordinates.push({ x: box ? box.x : Number.MAX_VALUE, lineElement });
        }
        linesWithXCoordinates.sort((a, b) => a.x.toString().localeCompare(b.x.toString()));
        return linesWithXCoordinates[lineNumber - 1].lineElement;
    }

    async textContentOfLineContainingText(text: string): Promise<string | undefined> {
        await this.waitForVisible();
        const lineElement = await this.lineContainingText(text);
        const content = await lineElement?.textContent();
        return content ? this.replaceEditorSymbolsWithSpace(content) : undefined;
    }

    async lineContainingText(text: string): Promise<ElementHandle<SVGElement | HTMLElement> | undefined> {
        const viewElement = await this.viewElement();
        return viewElement?.waitForSelector(`.view-lines .view-line:has-text("${text}")`);
    }

    /**
     * @returns The text content of the editor.
     */
    async editorText(): Promise<string | undefined> {
        const lines: string[] = [];
        const linesCount = await this.numberOfLines();
        if (linesCount === undefined) {
            return undefined;
        }
        for (let line = 1; line <= linesCount; line++) {
            const lineText = await this.textContentOfLineByLineNumber(line);
            if (lineText === undefined) {
                break;
            }
            lines.push(lineText);
        }
        return lines.join('\n');
    }

    /**
     * Adds text to the editor.
     * @param text  The text to add to the editor.
     * @param lineNumber  The line number where to add the text. Default is 1.
     */
    async addEditorText(text: string, lineNumber: number = 1): Promise<void> {
        const line = await this.lineByLineNumber(lineNumber);
        await line?.click();
        await this.page.keyboard.type(text);
    }

    /**
     * @returns `true` if the editor is focused, `false` otherwise.
     */
    async isFocused(): Promise<boolean> {
        const viewElement = await this.viewElement();
        const monacoEditor = await viewElement?.$('div.monaco-editor');
        if (!monacoEditor) {
            throw new Error('Couldn\'t retrieve monaco editor element.');
        }
        const editorClass = await monacoEditor.getAttribute('class');
        return editorClass?.includes('focused') ?? false;
    }

    protected replaceEditorSymbolsWithSpace(content: string): string | Promise<string | undefined> {
        // [ ] &nbsp; => \u00a0 -- NO-BREAK SPACE
        // [·] &middot; => \u00b7 -- MIDDLE DOT
        // [] &zwnj; => \u200c -- ZERO WIDTH NON-JOINER
        return content.replace(/[\u00a0\u00b7]/g, ' ').replace(/[\u200c]/g, '');
    }
}
