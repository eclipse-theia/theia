// *****************************************************************************
// Copyright (C) 2026 JuliaHub, Inc. and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
// `languages-main` transitively pulls in Monaco and several frontend modules that touch `document`
// at module-load time.
const disableJSDOM = enableJSDOM();
import { expect } from 'chai';
import * as monaco from '@theia/monaco-editor-core';
import { mainWindow } from '@theia/monaco-editor-core/esm/vs/base/browser/window';
import { URI } from '@theia/core/lib/common/uri';
import { expectThrowsAsync } from '@theia/core/lib/common/test/expect';
import { CellEditType, CellUri } from '@theia/notebook/lib/common';
import { CellEditOperation } from '@theia/notebook/lib/browser/notebook-types';
import type { NotebookModel } from '@theia/notebook/lib/browser/view-model/notebook-model';
import { LanguagesMainImpl } from './languages-main';

after(() => disableJSDOM());

const notebookUri = new URI('file:///notebook.ipynb');
const cellHandle = 3;
const cellComponents = CellUri.generate(notebookUri, cellHandle).toComponents();

type FakeNotebookModel = Pick<NotebookModel, 'getCellIndexByHandle' | 'applyEdits'> & {
    edits: CellEditOperation[][];
};

function createNotebookModel(handles: number[]): FakeNotebookModel {
    const edits: CellEditOperation[][] = [];
    return {
        edits,
        getCellIndexByHandle: handle => handles.indexOf(handle),
        applyEdits: applied => { edits.push(applied); }
    };
}

/**
 * Bypasses the constructor's RPC/container wiring.
 */
function createLanguagesMain(notebook?: FakeNotebookModel): LanguagesMainImpl {
    const languagesMain = Object.create(LanguagesMainImpl.prototype) as LanguagesMainImpl;
    (languagesMain as unknown as Record<string, unknown>).notebookService = {
        getNotebookEditorModel: (uri: URI) => uri.toString() === notebookUri.toString() ? notebook : undefined
    };
    return languagesMain;
}

describe('LanguagesMainImpl#$changeLanguage', () => {

    before(() => {
        // Resolving a language id boots Monaco's standalone services, whose theme service reaches for
        // DOM APIs JSDOM does not provide. Monaco captures its window at module load.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).CSS ??= { escape: (value: string) => value };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mainWindow as any).matchMedia ??= () => ({ matches: false, addEventListener: () => { }, removeEventListener: () => { } });
        monaco.languages.register({ id: 'julia' });
    });

    it('applies a cell language edit for a notebook cell', async () => {
        const notebook = createNotebookModel([1, 2, cellHandle]);
        const languagesMain = createLanguagesMain(notebook);

        await languagesMain.$changeLanguage(cellComponents, 'julia');

        expect(notebook.edits).to.deep.equal([[{ editType: CellEditType.CellLanguage, index: 2, language: 'julia' }]]);
    });

    it('rejects for a cell of a notebook that is not open', async () => {
        const languagesMain = createLanguagesMain();

        await expectThrowsAsync(languagesMain.$changeLanguage(cellComponents, 'julia'), 'Invalid uri');
    });

    it('rejects for a cell handle the notebook does not know', async () => {
        const languagesMain = createLanguagesMain(createNotebookModel([1, 2]));

        await expectThrowsAsync(languagesMain.$changeLanguage(cellComponents, 'julia'), 'Invalid uri');
    });

    it('rejects an unknown language id before touching the notebook', async () => {
        const notebook = createNotebookModel([cellHandle]);
        const languagesMain = createLanguagesMain(notebook);

        await expectThrowsAsync(languagesMain.$changeLanguage(cellComponents, 'no-such-language'), /Unknown language ID/);
        expect(notebook.edits).to.be.empty;
    });
});
