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

import { ElementHandle, Locator, Page } from '@playwright/test';
import { TheiaPageObject } from './theia-page-object';
import { TheiaApp } from './theia-app';

/**
 * Monaco editor page object.
 *
 * Note: The constructor overload using `selector: string` is deprecated. Use the `locator: Locator` overload instead.
 *
 */
export class TheiaMonacoEditor extends TheiaPageObject {

    public readonly locator: Locator;

    protected readonly LINES_SELECTOR = '.view-lines > .view-line';

    /**
     * Monaco editor page object.
     *
     * @param locator The locator of the editor.
     * @param app  The Theia app instance.
     */
    constructor(locator: Locator, app: TheiaApp);

    /**
     * @deprecated Use the `constructor(locator: Locator, app: TheiaApp)` overload instead.
     */
    constructor(selector: string, app: TheiaApp);

    constructor(locatorOrString: Locator | string, app: TheiaApp) {
        super(app);
        if (typeof locatorOrString === 'string') {
            this.locator = app.page.locator(locatorOrString);
        } else {
            this.locator = locatorOrString;
        }
    }

    async waitForVisible(): Promise<void> {
        await this.locator.waitFor({ state: 'visible' });
        // wait until lines are created
        await this.locator.evaluate(editor =>
            editor.querySelectorAll(this.LINES_SELECTOR).length > 0
        );
    }

    /**
     * @deprecated Use `locator` instead. To get the element handle use `await locator.elementHandle()`.
     * @returns The view element of the editor.
     */
    protected async viewElement(): Promise<ElementHandle<SVGElement | HTMLElement> | null> {
        return this.locator.elementHandle();
    }

    async numberOfLines(): Promise<number> {
        await this.waitForVisible();
        const lineElements = await this.locator.locator(this.LINES_SELECTOR).all();
        return lineElements.length;
    }

    async textContentOfLineByLineNumber(lineNumber: number): Promise<string | undefined> {
        await this.waitForVisible();
        const lineElement = await this.line(lineNumber);
        const content = await lineElement?.textContent();
        return content ? this.replaceEditorSymbolsWithSpace(content) : undefined;
    }

    /**
     * @deprecated Use `line(lineNumber: number)` instead.
     * @param lineNumber The line number to retrieve.
     * @returns The line element of the editor.
     */
    async lineByLineNumber(lineNumber: number): Promise<ElementHandle<SVGElement | HTMLElement> | undefined> {
        const lineLocator = await this.line(lineNumber);
        return (await lineLocator.elementHandle()) ?? undefined;
    }

    /**
     * Returns the locator for the given model line number.
     *
     * Monaco uses virtual rendering so only lines in the viewport are in the DOM.
     * Each `.view-line` element has a `style.top` value corresponding to its model position.
     * This method uses that to find the correct line, scrolling to reveal it if necessary.
     */
    async line(lineNumber: number): Promise<Locator> {
        await this.waitForVisible();

        let index = await this.findLineIndex(lineNumber);
        if (index >= 0) {
            return this.locator.locator(this.LINES_SELECTOR).nth(index);
        }

        // Line not in viewport, scroll to reveal it
        await this.locator.click();
        await this.page.keyboard.press('Control+Home');
        await this.locator.locator(this.LINES_SELECTOR).first().waitFor({ state: 'visible' });

        index = await this.findLineIndex(lineNumber);
        if (index >= 0) {
            return this.locator.locator(this.LINES_SELECTOR).nth(index);
        }

        // Line might be near the end, try scrolling there
        await this.page.keyboard.press('Control+End');
        await this.locator.locator(this.LINES_SELECTOR).first().waitFor({ state: 'visible' });

        index = await this.findLineIndex(lineNumber);
        if (index >= 0) {
            return this.locator.locator(this.LINES_SELECTOR).nth(index);
        }

        throw new Error(`Could not find line number ${lineNumber}`);
    }

    /**
     * Finds the DOM index of the `.view-line` element that corresponds to the given model line number.
     * Uses the `style.top` value of each `.view-line` to compute the model line number.
     * Returns -1 if the line is not currently rendered in the viewport.
     */
    protected async findLineIndex(lineNumber: number): Promise<number> {
        return this.locator.evaluate((editor, targetLine) => {
            const viewLines = editor.querySelectorAll('.view-lines > .view-line') as NodeListOf<HTMLElement>;
            if (viewLines.length === 0) {
                return -1;
            }
            const lineHeight = viewLines[0].getBoundingClientRect().height;
            if (lineHeight <= 0) {
                return -1;
            }
            const targetTop = (targetLine - 1) * lineHeight;
            for (let i = 0; i < viewLines.length; i++) {
                const top = parseFloat(viewLines[i].style.top) || 0;
                if (Math.abs(top - targetTop) < lineHeight * 0.5) {
                    return i;
                }
            }
            return -1;
        }, lineNumber);
    }

    async textContentOfLineContainingText(text: string): Promise<string | undefined> {
        await this.waitForVisible();
        const lineElement = await this.lineWithText(text);
        const content = await lineElement?.textContent();
        return content ? this.replaceEditorSymbolsWithSpace(content) : undefined;
    }

    /**
     * @deprecated Use `lineWithText(text: string)` instead.
     * @param text The text to search for in the editor.
     * @returns  The line element containing the text.
     */
    async lineContainingText(text: string): Promise<ElementHandle<SVGElement | HTMLElement> | undefined> {
        const lineWithText = await this.lineWithText(text);
        return await lineWithText?.elementHandle() ?? undefined;
    }

    async lineWithText(text: string): Promise<Locator | undefined> {
        const lineWithText = this.locator.locator(`${this.LINES_SELECTOR}:has-text("${text}")`);
        await lineWithText.waitFor({ state: 'visible' });
        return lineWithText;
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
        const line = await this.line(lineNumber);
        await line?.click();
        await TheiaMonacoEditor.typeText(this.page, text);
    }

    /**
     * Types text into a focused Monaco editor using `keyboard.insertText()`.
     *
     * Monaco 1.108+ uses the native EditContext API by default instead of a hidden textarea.
     * `keyboard.type()` dispatches individual key events which are not reliably processed by EditContext,
     * causing characters to be lost. `keyboard.insertText()` dispatches an `InputEvent` which is handled
     * correctly by both the legacy textarea and the native EditContext input mechanisms.
     *
     * Newlines in the text are handled by pressing Enter between segments.
     */
    static async typeText(page: Page, text: string): Promise<void> {
        const segments = text.split('\n');
        for (let i = 0; i < segments.length; i++) {
            if (i > 0) {
                await page.keyboard.press('Enter');
            }
            if (segments[i].length > 0) {
                await page.keyboard.insertText(segments[i]);
            }
        }
    }

    /**
     * @returns `true` if the editor is focused, `false` otherwise.
     */
    async isFocused(): Promise<boolean> {
        await this.locator.waitFor({ state: 'visible' });
        const editorClass = await this.locator.getAttribute('class');
        return editorClass?.includes('focused') ?? false;
    }

    protected replaceEditorSymbolsWithSpace(content: string): string | Promise<string | undefined> {
        // [ ] &nbsp; => \u00a0 -- NO-BREAK SPACE
        // [·] &middot; => \u00b7 -- MIDDLE DOT
        // [] &zwnj; => \u200c -- ZERO WIDTH NON-JOINER
        return content.replace(/[\u00a0\u00b7]/g, ' ').replace(/[\u200c]/g, '');
    }
}
