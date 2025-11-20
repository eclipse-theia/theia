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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ElementHandle, Locator } from '@playwright/test';

import { TheiaApp } from './theia-app';
import { TheiaEditor } from './theia-editor';
import { normalizeId } from './util';
import { TheiaMonacoEditor } from './theia-monaco-editor';

export class TheiaTextEditor extends TheiaEditor {

    protected monacoEditor: TheiaMonacoEditor;

    constructor(filePath: string, app: TheiaApp) {
        // shell-tab-code-editor-opener:file:///c%3A/Users/user/AppData/Local/Temp/cloud-ws-JBUhb6/sample.txt:1
        // code-editor-opener:file:///c%3A/Users/user/AppData/Local/Temp/cloud-ws-JBUhb6/sample.txt:1
        super({
            tabSelector: normalizeId(`#shell-tab-code-editor-opener:${app.workspace.pathAsUrl(filePath)}:1`),
            viewSelector: normalizeId(`#code-editor-opener:${app.workspace.pathAsUrl(filePath)}:1`) + '.theia-editor'
        }, app);
        this.monacoEditor = new TheiaMonacoEditor(this.page.locator(this.data.viewSelector), app);
    }

    async numberOfLines(): Promise<number | undefined> {
        await this.activate();
        return this.monacoEditor.numberOfLines();
    }

    async textContentOfLineByLineNumber(lineNumber: number): Promise<string | undefined> {
        return this.monacoEditor.textContentOfLineByLineNumber(lineNumber);
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
        const lineElement = await this.monacoEditor.line(lineNumber);
        await this.selectLine(lineElement);
        return await lineElement.elementHandle() ?? undefined;
    }

    async placeCursorInLineWithLineNumber(lineNumber: number): Promise<ElementHandle<SVGElement | HTMLElement> | undefined> {
        await this.activate();
        const lineElement = await this.monacoEditor.line(lineNumber);
        await this.placeCursorInLine(lineElement);
        return await lineElement.elementHandle() ?? undefined;
    }

    async deleteLineByLineNumber(lineNumber: number): Promise<void> {
        await this.selectLineWithLineNumber(lineNumber);
        await this.page.keyboard.press('Backspace');
    }

    async textContentOfLineContainingText(text: string): Promise<string | undefined> {
        await this.activate();
        return this.monacoEditor.textContentOfLineContainingText(text);
    }

    async replaceLineContainingText(newText: string, oldText: string): Promise<void> {
        await this.selectLineContainingText(oldText);
        await this.typeTextAndHitEnter(newText);
    }

    async selectLineContainingText(text: string): Promise<ElementHandle<SVGElement | HTMLElement> | undefined> {
        await this.activate();
        const lineElement = await this.monacoEditor.lineWithText(text);
        await this.selectLine(lineElement);
        return await lineElement?.elementHandle() ?? undefined;
    }

    async placeCursorInLineContainingText(text: string): Promise<ElementHandle<SVGElement | HTMLElement> | undefined> {
        await this.activate();
        const lineElement = await this.monacoEditor.lineWithText(text);
        await this.placeCursorInLine(lineElement);
        return await lineElement?.elementHandle() ?? undefined;
    }

    async deleteLineContainingText(text: string): Promise<void> {
        await this.selectLineContainingText(text);
        await this.page.keyboard.press('Backspace');
    }

    async addTextToNewLineAfterLineContainingText(textContainedByExistingLine: string, newText: string): Promise<void> {
        const existingLine = await this.monacoEditor.lineWithText(textContainedByExistingLine);
        await this.placeCursorInLine(existingLine);
        await this.page.keyboard.press('End');
        await this.page.keyboard.press('Enter');
        await this.page.keyboard.type(newText);
    }

    async addTextToNewLineAfterLineByLineNumber(lineNumber: number, newText: string): Promise<void> {
        const existingLine = await this.monacoEditor.line(lineNumber);
        await this.placeCursorInLine(existingLine);
        await this.page.keyboard.press('End');
        await this.page.keyboard.press('Enter');
        await this.page.keyboard.type(newText);
    }

    protected async selectLine(lineLocator: Locator | undefined): Promise<void> {
        await lineLocator?.click({ clickCount: 3 });
    }

    protected async placeCursorInLine(lineLocator: Locator | undefined): Promise<void> {
        await lineLocator?.click();
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
