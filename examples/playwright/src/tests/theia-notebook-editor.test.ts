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

import { PlaywrightWorkerArgs, expect, test } from '@playwright/test';
import { TheiaApp } from '../theia-app';
import { TheiaAppLoader, TheiaPlaywrightTestConfig } from '../theia-app-loader';
import { TheiaNotebookCell } from '../theia-notebook-cell';
import { TheiaNotebookEditor } from '../theia-notebook-editor';
import { TheiaWorkspace } from '../theia-workspace';
import path = require('path');

// See .github/workflows/playwright.yml for preferred python version
const preferredKernel = process.env.CI ? 'Python 3.11' : 'Python 3';

test.describe('Theia Notebook Editor interaction', () => {

    let app: TheiaApp;
    let editor: TheiaNotebookEditor;

    test.beforeAll(async ({ playwright, browser }) => {
        app = await loadApp({ playwright, browser });
    });

    test.beforeEach(async ({ playwright, browser }) => {
        editor = await app.openEditor('sample.ipynb', TheiaNotebookEditor);
    });

    test.afterAll(async () => {
        await app.page.close();
    });

    test.afterEach(async () => {
        if (editor) {
            await editor.closeWithoutSave();
        }
    });

    test('kernels are installed', async () => {
        const kernels = await editor.availableKernels();
        const msg = `Available kernels:\n ${kernels.join('\n')}`;
        console.log(msg); // Print available kernels, useful when running in CI.
        expect(kernels.length, msg).toBeGreaterThan(0);

        const py3kernel = kernels.filter(kernel => kernel.match(new RegExp(`^${preferredKernel}`)));
        expect(py3kernel.length, msg).toBeGreaterThan(0);
    });

    test('should select a kernel', async () => {
        await editor.selectKernel(preferredKernel);
        const selectedKernel = await editor.selectedKernel();
        expect(selectedKernel).toMatch(new RegExp(`^${preferredKernel}`));
    });

    test('should add a new code cell', async () => {
        await editor.addCodeCell();
        const cells = await editor.cells();
        expect(cells.length).toBe(2);
        expect(await cells[1].mode()).toBe('python');
    });

    test('should add a new markdown cell', async () => {
        await editor.addMarkdownCell();
        await (await editor.cells())[1].addEditorText('print("markdown")');

        const cells = await editor.cells();
        expect(cells.length).toBe(2);
        expect(await cells[1].mode()).toBe('markdown');
        expect(await cells[1].editorText()).toBe('print("markdown")');
    });

    test('should execute all cells', async () => {
        const cell = await firstCell(editor);
        await cell.addEditorText('print("Hallo Notebook!")');

        await editor.addCodeCell();
        const secondCell = (await editor.cells())[1];
        await secondCell.addEditorText('print("Bye Notebook!")');

        await editor.executeAllCells();

        expect(await cell.outputText()).toBe('Hallo Notebook!');
        expect(await secondCell.outputText()).toBe('Bye Notebook!');
    });

    test('should split cell', async () => {
        const cell = await firstCell(editor);
        /*
        Add cell text:
        print("Line-1")
        print("Line-2")
        */
        await cell.addEditorText('print("Line-1")\nprint("Line-2")');

        /*
        Set cursor:
        print("Line-1")
        <|>print("Line-2")
        */
        const line = await cell.editor.lineByLineNumber(1);
        await line?.waitForElementState('visible');
        await line?.click();
        await line?.press('ArrowRight');

        // split cell
        await cell.splitCell();

        // expect two cells with text "print("Line-1")" and "print("Line-2")"
        expect(await editor.cells()).toHaveLength(2);
        expect(await (await editor.cells())[0].editorText()).toBe('print("Line-1")');
        expect(await (await editor.cells())[1].editorText()).toBe('print("Line-2")');
    });
});

test.describe('Theia Notebook Cell interaction', () => {

    let app: TheiaApp;
    let editor: TheiaNotebookEditor;

    test.beforeAll(async ({ playwright, browser }) => {
        app = await loadApp({ playwright, browser });
    });

    test.afterAll(async () => {
        await app.page.close();
    });

    test.beforeEach(async () => {
        editor = await app.openEditor('sample.ipynb', TheiaNotebookEditor);
        const selectedKernel = await editor.selectedKernel();
        if (selectedKernel?.match(new RegExp(`^${preferredKernel}`)) === null) {
            await editor.selectKernel(preferredKernel);
        }
    });

    test.afterEach(async () => {
        if (editor) {
            await editor.closeWithoutSave();
        }
    });

    test('should write text in a code cell', async () => {
        const cell = await firstCell(editor);
        // assume the first cell is a code cell
        expect(await cell.isCodeCell()).toBe(true);

        await cell.addEditorText('print("Hallo")');
        const cellText = await cell.editorText();
        expect(cellText).toBe('print("Hallo")');
    });

    test('should write multi-line text in a code cell', async () => {
        const cell = await firstCell(editor);
        await cell.addEditorText('print("Hallo")\nprint("Notebook")');

        const cellText = await cell.editorText();
        expect(cellText).toBe('print("Hallo")\nprint("Notebook")');
    });

    test('Execute code cell and read output', async () => {
        const cell = await firstCell(editor);
        await cell.addEditorText('print("Hallo Notebook!")');
        await cell.execute();

        const cellOutput = await cell.outputText();
        expect(cellOutput).toBe('Hallo Notebook!');
    });

    test('Check execution count matches', async () => {
        const cell = await firstCell(editor);
        await cell.addEditorText('print("Hallo Notebook!")');
        await cell.execute();
        await cell.execute();
        await cell.execute();

        expect(await cell.executionCount()).toBe('3');
    });

});

async function firstCell(editor: TheiaNotebookEditor): Promise<TheiaNotebookCell> {
    return (await editor.cells())[0];
}

async function loadApp(args: TheiaPlaywrightTestConfig & PlaywrightWorkerArgs): Promise<TheiaApp> {
    const workingDir = path.resolve();
    // correct WS path. When running from IDE the path is playwright/configs with CLI it's playwright/
    const prefix = workingDir.endsWith('playwright/configs') ? '../' : '';
    const ws = new TheiaWorkspace([prefix + 'src/tests/resources/notebook-files']);
    const app = await TheiaAppLoader.load(args, ws);
    // auto-save are disabled using settings.json file
    // see examples/playwright/src/tests/resources/notebook-files/.theia/settings.json

    // NOTE: Workspace trust is disabled in examples/browser/package.json using default preferences.
    // If workspace trust check is on, python extension will not be able to explore Python installations.
    return app;
}
