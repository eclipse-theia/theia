// *****************************************************************************
// Copyright (C) 2021 logi.cals GmbH, EclipseSource and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { ElementHandle } from '@playwright/test';
import { join } from 'path';

import { TheiaApp } from './theia-app';
import { TheiaEditor } from './theia-editor';
import { normalizeId, OSUtil, urlEncodePath } from './util';

export class TheiaTextEditor extends TheiaEditor {

    constructor(filePath: string, app: TheiaApp) {
        // shell-tab-code-editor-opener:file:///c%3A/Users/user/AppData/Local/Temp/cloud-ws-JBUhb6/sample.txt:1
        // code-editor-opener:file:///c%3A/Users/user/AppData/Local/Temp/cloud-ws-JBUhb6/sample.txt:1
        super({
            tabSelector: normalizeId(`#shell-tab-code-editor-opener:file://${urlEncodePath(join(app.workspace.escapedPath, OSUtil.fileSeparator, filePath))}:1`),
            viewSelector: normalizeId(`#code-editor-opener:file://${urlEncodePath(join(app.workspace.escapedPath, OSUtil.fileSeparator, filePath))}:1`) + '.theia-editor'
        }, app);
    }

    async numberOfLines(): Promise<number | undefined> {
        await this.activate();
        const viewElement = await this.viewElement();
        const lineElements = await viewElement?.$$('.view-lines .view-line');
        return lineElements?.length;
    }

    async textContentOfLineByLineNumber(lineNumber: number): Promise<string | undefined> {
        const lineElement = await this.lineByLineNumber(lineNumber);
        const content = await lineElement?.textContent();
        return content ? this.replaceEditorSymbolsWithSpace(content) : undefined;
    }

    async replaceLineWithLineNumber(text: string, lineNumber: number): Promise<void> {
        await this.selectLineWithLineNumber(lineNumber);
        await this.typeTextAndHitEnter(text);
    }

    protected async typeTextAndHitEnter(text: string): Promise<void> {
        await this.page.keyboard.type(text);
        await this.page.keyboard.press('Enter');
    }

    async selectLineWithLineNumber(lineNumber: number): Promise<ElementHandle<SVGElement | HTMLElement> | undefined> {
        await this.activate();
        const lineElement = await this.lineByLineNumber(lineNumber);
        await this.selectLine(lineElement);
        return lineElement;
    }

    async placeCursorInLineWithLineNumber(lineNumber: number): Promise<ElementHandle<SVGElement | HTMLElement> | undefined> {
        await this.activate();
        const lineElement = await this.lineByLineNumber(lineNumber);
        await this.placeCursorInLine(lineElement);
        return lineElement;
    }

    async deleteLineByLineNumber(lineNumber: number): Promise<void> {
        await this.selectLineWithLineNumber(lineNumber);
        await this.page.keyboard.press('Backspace');
    }

    protected async lineByLineNumber(lineNumber: number): Promise<ElementHandle<SVGElement | HTMLElement> | undefined> {
        await this.activate();
        const viewElement = await this.viewElement();
        const lines = await viewElement?.$$('.view-lines .view-line');
        if (!lines) {
            throw new Error(`Couldn't retrieve lines of text editor ${this.tabSelector}`);
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
        await this.activate();
        const lineElement = await this.lineContainingText(text);
        const content = await lineElement?.textContent();
        return content ? this.replaceEditorSymbolsWithSpace(content) : undefined;
    }

    async replaceLineContainingText(newText: string, oldText: string): Promise<void> {
        await this.selectLineContainingText(oldText);
        await this.typeTextAndHitEnter(newText);
    }

    async selectLineContainingText(text: string): Promise<ElementHandle<SVGElement | HTMLElement> | undefined> {
        await this.activate();
        const lineElement = await this.lineContainingText(text);
        await this.selectLine(lineElement);
        return lineElement;
    }

    async placeCursorInLineContainingText(text: string): Promise<ElementHandle<SVGElement | HTMLElement> | undefined> {
        await this.activate();
        const lineElement = await this.lineContainingText(text);
        await this.placeCursorInLine(lineElement);
        return lineElement;
    }

    async deleteLineContainingText(text: string): Promise<void> {
        await this.selectLineContainingText(text);
        await this.page.keyboard.press('Backspace');
    }

    async addTextToNewLineAfterLineContainingText(textContainedByExistingLine: string, newText: string): Promise<void> {
        const existingLine = await this.lineContainingText(textContainedByExistingLine);
        await this.placeCursorInLine(existingLine);
        await this.page.keyboard.press('End');
        await this.page.keyboard.press('Enter');
        await this.page.keyboard.type(newText);
    }

    async addTextToNewLineAfterLineByLineNumber(lineNumber: number, newText: string): Promise<void> {
        const existingLine = await this.lineByLineNumber(lineNumber);
        await this.placeCursorInLine(existingLine);
        await this.page.keyboard.press('End');
        await this.page.keyboard.press('Enter');
        await this.page.keyboard.type(newText);
    }

    protected async lineContainingText(text: string): Promise<ElementHandle<SVGElement | HTMLElement> | undefined> {
        const viewElement = await this.viewElement();
        return viewElement?.waitForSelector(`.view-lines .view-line:has-text("${text}")`);
    }

    protected async selectLine(lineElement: ElementHandle<SVGElement | HTMLElement> | undefined): Promise<void> {
        await lineElement?.click({ clickCount: 3 });
    }

    protected async placeCursorInLine(lineElement: ElementHandle<SVGElement | HTMLElement> | undefined): Promise<void> {
        await lineElement?.click();
    }

    protected replaceEditorSymbolsWithSpace(content: string): string | Promise<string | undefined> {
        // [ ] &nbsp; => \u00a0 -- NO-BREAK SPACE
        // [·] &middot; => \u00b7 -- MIDDLE DOT
        // [] &zwnj; => \u200c -- ZERO WIDTH NON-JOINER
        return content.replace(/[\u00a0\u00b7]/g, ' ').replace(/[\u200c]/g, '');
    }

    protected async selectedSuggestion(): Promise<ElementHandle<SVGElement | HTMLElement>> {
        return this.page.waitForSelector(this.viewSelector + ' .monaco-list-row.show-file-icons.focused');
    }

    async getSelectedSuggestionText(): Promise<string> {
        const suggestion = await this.selectedSuggestion();
        const text = await suggestion.textContent();
        if (text === null) { throw new Error('Text content could not be found'); }
        return text;
    }

}
