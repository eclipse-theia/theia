// *****************************************************************************
// Copyright (C) 2024 TypeFox GmbH and others.
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
import { expect, FrameLocator, Locator } from '@playwright/test';
import { TheiaApp } from './theia-app';
import { TheiaMonacoEditor } from './theia-monaco-editor';
import { TheiaPageObject } from './theia-page-object';

export type CellStatus = 'success' | 'error' | 'waiting';

/**
 * Page object for a Theia notebook cell.
 */
export class TheiaNotebookCell extends TheiaPageObject {

    protected cellEditor: TheiaNotebookCellEditor;

    constructor(readonly locator: Locator, protected readonly notebookEditorLocator: Locator, app: TheiaApp) {
        super(app);
        const editorLocator = locator.locator('div.theia-notebook-cell-editor');
        this.cellEditor = new TheiaNotebookCellEditor(editorLocator, app);
    }

    /**
     * @returns The cell editor page object.
     */
    get editor(): TheiaNotebookCellEditor {
        return this.cellEditor;
    }

    /**
     * @returns Locator for the sidebar (left) of the cell.
     */
    sidebar(): Locator {
        return this.locator.locator('div.theia-notebook-cell-sidebar');
    }

    /**
     * @returns Locator for the toolbar (top) of the cell.
     */
    toolbar(): Locator {
        return this.locator.locator('div.theia-notebook-cell-toolbar');
    }
    /**
     * @returns Locator for the statusbar (bottom) of the cell.
     */
    statusbar(): Locator {
        return this.locator.locator('div.notebook-cell-status');
    }

    /**
     * @returns Locator for the status icon inside the statusbar of the cell.
     */
    statusIcon(): Locator {
        return this.statusbar().locator('span.notebook-cell-status-item');
    }

    /**
     * @returns `true` id the cell is a code cell, `false` otherwise.
     */
    async isCodeCell(): Promise<boolean> {
        const classAttribute = await this.mode();
        return classAttribute !== 'markdown';
    }

    /**
     * @returns The mode of the cell, e.g. 'python', 'markdown', etc.
     */
    async mode(): Promise<string> {
        await this.locator.waitFor({ state: 'visible' });
        const editorElement = await this.editor.locator.elementHandle();
        if (editorElement === null) {
            throw new Error('Could not find editor element for the notebook cell.');
        }
        const classAttribute = await editorElement.getAttribute('data-mode-id');
        if (classAttribute === null) {
            throw new Error('Could not find mode attribute for the notebook cell.');
        }
        return classAttribute;
    }

    /**
     * @returns The text content of the cell editor.
     */
    async editorText(): Promise<string | undefined> {
        return this.editor.monacoEditor.editorText();
    }

    /**
     * Adds text to the editor of the cell.
     * @param text  The text to add to the editor.
     * @param lineNumber  The line number where to add the text. Default is 1.
     */
    async addEditorText(text: string, lineNumber: number = 1): Promise<void> {
        await this.editor.monacoEditor.addEditorText(text, lineNumber);
    }

    /**
     * @param wait If `true` waits for the cell to finish execution, otherwise returns immediately.
     */
    async execute(wait = true): Promise<void> {
        const execButton = this.sidebar().locator('[id="notebook.cell.execute-cell"]');
        await execButton.waitFor({ state: 'visible' });
        await execButton.click();
        if (wait) {
            // wait for the cell to finish execution
            await this.waitForCellToFinish();
        }
    }

    /**
     * Splits the cell into two cells by dividing the cell text on current cursor position.
     */
    async splitCell(): Promise<void> {
        const execButton = this.toolbar().locator('[id="notebook.cell.split"]');
        await execButton.waitFor({ state: 'visible' });
        await execButton.click();
    }

    /**
     * Deletes the cell.
     */
    async deleteCell(): Promise<void> {
        const button = this.toolbar().locator('[id="notebook.cell.delete"]');
        await button.waitFor({ state: 'visible' });
        await button.click();
    }

    /**
     *  Waits for the cell to reach success or error status.
     */
    async waitForCellToFinish(): Promise<void> {
        await expect(this.statusIcon()).toHaveClass(/(.*codicon-check.*|.*codicon-error.*)/);
    }

    /**
     * @returns The status of the cell. Possible values are 'success', 'error', 'waiting'.
     */
    async status(): Promise<CellStatus> {
        const statusLocator = this.statusIcon();
        const status = this.toCellStatus(await (await statusLocator.elementHandle())?.getAttribute('class') ?? '');
        return status;
    }

    protected toCellStatus(classes: string): CellStatus {
        return classes.includes('codicon-check') ? 'success'
            : classes.includes('codicon-error') ? 'error'
                : 'waiting';
    }

    /**
     * @param acceptEmpty If `true`, accepts empty execution count. Otherwise waits for the execution count to be set.
     * @returns The execution count of the cell.
     */
    async executionCount(acceptEmpty: boolean = false): Promise<string | undefined> {
        const countNode = this.sidebar().locator('span.theia-notebook-code-cell-execution-order');
        await countNode.waitFor({ state: 'visible' });
        await this.waitForCellToFinish();
        // Wait for the execution count to be set.
        await countNode.page().waitForFunction(
            arg => {
                const text = arg.ele?.textContent;
                return text && (arg.acceptEmpty || text !== '[ ]');
            },
            { ele: await countNode.elementHandle(), acceptEmpty },
        );
        const counterText = await countNode.textContent();
        return counterText?.substring(1, counterText.length - 1); // remove square brackets
    }

    /**
     * @returns `true` if the cell is selected (blue vertical line), `false` otherwise.
     */
    async isSelected(): Promise<boolean> {
        const markerClass = await this.locator.locator('div.theia-notebook-cell-marker').getAttribute('class');
        return markerClass?.includes('theia-notebook-cell-marker-selected') ?? false;
    }

    /**
     * @returns The output text of the cell.
     */
    async outputText(): Promise<string> {
        const outputContainer = await this.outputContainer();
        await outputContainer.waitFor({ state: 'visible' });
        // By default just collect all spans text.
        const spansLocator: Locator = outputContainer.locator('span:not(:has(*))'); // ignore nested spans
        const spanTexts = await spansLocator.evaluateAll(spans => spans.map(span => span.textContent?.trim())
            .filter(text => text !== undefined && text.length > 0));
        return spanTexts.join('');
    }

    /**
     * Selects the cell itself not it's editor. Important for shortcut usage like copy-, cut-, paste-cell.
     */
    async selectCell(): Promise<void> {
        await this.sidebar().click();
    }

    async outputContainer(): Promise<Locator> {
        const outFrame = await this.outputFrame();
        // each cell has it's own output div with a unique id = cellHandle<handle>
        const cellOutput = outFrame.locator(`div#cellHandle${await this.cellHandle()}`);
        return cellOutput.locator('div.output-container');
    }

    protected async cellHandle(): Promise<string | null> {
        const handle = await this.locator.getAttribute('data-cell-handle');
        if (handle === null) {
            throw new Error('Could not find cell handle attribute `data-cell-handle` for the notebook cell.');
        }
        return handle;
    }

    protected async outputFrame(): Promise<FrameLocator> {
        const containerDiv = this.notebookEditorLocator.locator('div.theia-notebook-cell-output-webview');
        const webViewFrame = containerDiv.frameLocator('iframe.webview');
        await webViewFrame.locator('iframe').waitFor({ state: 'attached' });
        return webViewFrame.frameLocator('iframe');
    }

}

/**
 * Wrapper around the monaco editor inside a notebook cell.
 */
export class TheiaNotebookCellEditor extends TheiaPageObject {

    public readonly monacoEditor: TheiaMonacoEditor;

    constructor(readonly locator: Locator, app: TheiaApp) {
        super(app);
        this.monacoEditor = new TheiaMonacoEditor(locator.locator('.monaco-editor'), app);
    }

    async waitForVisible(): Promise<void> {
        await this.locator.waitFor({ state: 'visible' });
    }

    async isVisible(): Promise<boolean> {
        return this.locator.isVisible();
    }
}
