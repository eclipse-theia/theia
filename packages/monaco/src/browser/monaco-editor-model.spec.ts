// *****************************************************************************
// Copyright (C) 2026 CodeSignal and others.
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
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import { Resource } from '@theia/core/lib/common/resource';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices.js';
import { IInstantiationService } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/instantiation.js';
import type { MonacoEditorModel as MonacoEditorModelType } from './monaco-editor-model.js';
import type { MonacoToProtocolConverter as MonacoToProtocolConverterType } from './monaco-to-protocol-converter.js';
import type { ProtocolToMonacoConverter as ProtocolToMonacoConverterType } from './protocol-to-monaco-converter.js';

disableJSDOM();

describe('MonacoEditorModel save', () => {
    let MonacoEditorModel: typeof MonacoEditorModelType;
    let MonacoToProtocolConverter: typeof MonacoToProtocolConverterType;
    let ProtocolToMonacoConverter: typeof ProtocolToMonacoConverterType;

    before(async () => {
        disableJSDOM = enableJSDOM();
        StandaloneServices.get(IInstantiationService);
        ({ MonacoEditorModel } = await import('./monaco-editor-model.js'));
        ({ MonacoToProtocolConverter } = await import('./monaco-to-protocol-converter.js'));
        ({ ProtocolToMonacoConverter } = await import('./protocol-to-monaco-converter.js'));
    });
    after(() => disableJSDOM());

    let files = 0;

    class SlowResource implements Resource {
        readonly uri = new URI(`file:///workspace/notes-${++files}.txt`);
        content = '';
        writing?: Deferred<void>;
        readonly writeStarted = new Deferred<void>();

        async readContents(): Promise<string> {
            return this.content;
        }

        async saveContents(content: string): Promise<void> {
            this.writeStarted.resolve();
            await this.writing?.promise;
            this.content = content;
        }

        dispose(): void { }
    }

    async function createModel(resource: SlowResource): Promise<MonacoEditorModelType> {
        const model = new MonacoEditorModel(resource, new MonacoToProtocolConverter(), new ProtocolToMonacoConverter());
        await model.load();
        return model;
    }

    function type(model: MonacoEditorModelType, text: string): void {
        const end = model.textEditorModel.getFullModelRange().getEndPosition();
        model.textEditorModel.pushEditOperations([], [{
            range: { startLineNumber: end.lineNumber, startColumn: end.column, endLineNumber: end.lineNumber, endColumn: end.column },
            text
        }], () => []);
        model.textEditorModel.pushStackElement();
    }

    it('stays dirty when edited while a save is being written, and the next save writes the edit', async () => {
        const resource = new SlowResource();
        const model = await createModel(resource);
        let saves = 0;
        model.onDidSaveModel(() => saves++);
        type(model, 'a');
        resource.writing = new Deferred<void>();

        const saving = model.save();
        await resource.writeStarted.promise;
        type(model, 'b');
        resource.writing.resolve();
        await saving;

        expect(resource.content).to.equal('a');
        expect(model.dirty).to.be.true;
        expect(saves).to.equal(1);

        await model.save();

        expect(resource.content).to.equal('ab');
        expect(model.dirty).to.be.false;
        model.dispose();
    });

    it('is clean after a save when nothing changed during it', async () => {
        const resource = new SlowResource();
        const model = await createModel(resource);
        type(model, 'a');

        await model.save();

        expect(resource.content).to.equal('a');
        expect(model.dirty).to.be.false;
        model.dispose();
    });

    it('is clean again when an edit made during the save is undone', async () => {
        const resource = new SlowResource();
        const model = await createModel(resource);
        type(model, 'a');
        resource.writing = new Deferred<void>();

        const saving = model.save();
        await resource.writeStarted.promise;
        type(model, 'b');
        resource.writing.resolve();
        await saving;
        model.textEditorModel.undo();

        expect(model.textEditorModel.getValue()).to.equal('a');
        expect(model.dirty).to.be.false;
        model.dispose();
    });

    it('is clean after a revert during the save, which cancels it', async () => {
        const resource = new SlowResource();
        const model = await createModel(resource);
        let saves = 0;
        model.onDidSaveModel(() => saves++);
        type(model, 'a');
        resource.writing = new Deferred<void>();

        const saving = model.save();
        await resource.writeStarted.promise;
        type(model, 'b');
        const reverting = model.revert();
        resource.writing.resolve();
        await Promise.all([saving, reverting]);

        expect(model.textEditorModel.getValue()).to.equal('a');
        expect(model.dirty).to.be.false;
        expect(saves).to.equal(0);
        model.dispose();
    });
});
