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
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { Emitter, URI } from '@theia/core';
import { BaseWidget, Navigatable, Saveable, SaveableSource, Widget } from '@theia/core/lib/browser';
import { SaveableService } from '@theia/core/lib/browser/saveable-service';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { EditorsAndDocumentsMain } from './editors-and-documents-main';

disableJSDOM();

class TestSaveable implements Saveable {
    dirty = true;
    readonly onDirtyChanged = new Emitter<void>().event;
    readonly onContentChanged = new Emitter<void>().event;
    saveCount = 0;

    async save(): Promise<void> {
        this.saveCount++;
        this.dirty = false;
    }
}

/** Navigatable to the resource, but with nothing to save. */
class TestNavigatableWidget extends BaseWidget implements Navigatable {
    constructor(private readonly uri: URI) {
        super();
    }

    getResourceUri(): URI {
        return this.uri;
    }

    createMoveToUri(): URI {
        return this.uri;
    }
}

/** Stands in for a `CustomEditorWidget`: saveable and navigatable, but not an `EditorWidget`. */
class TestSaveableWidget extends TestNavigatableWidget implements SaveableSource {
    readonly saveable = new TestSaveable();
}

function createEditorsAndDocumentsMain(
    editor: EditorWidget | undefined,
    widgets: Widget[]
): EditorsAndDocumentsMain {
    // Bypass the constructor's RPC/container wiring: `save` and `saveAs` only touch the
    // editor manager, the shell and the saveable service.
    const main = Object.create(EditorsAndDocumentsMain.prototype) as EditorsAndDocumentsMain;
    const fields = main as unknown as Record<string, unknown>;
    fields.editorManager = { getByUri: async () => editor } as unknown as EditorManager;
    fields.shell = { widgets };
    fields.saveResourceService = new SaveableService();
    return main;
}

describe('EditorsAndDocumentsMain#save', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    const uri = new URI('custom-editor:/some/resource?viewType=test');

    it('saves a saveable widget that the editor manager does not know', async () => {
        const widget = new TestSaveableWidget(uri);
        const main = createEditorsAndDocumentsMain(undefined, [widget]);

        const saved = await main.save(uri);

        expect(widget.saveable.saveCount).to.equal(1);
        expect(saved?.toString()).to.equal(uri.toString());
    });

    it('prefers the text editor when the editor manager has one', async () => {
        const editor = new TestSaveableWidget(uri);
        const custom = new TestSaveableWidget(uri);
        const main = createEditorsAndDocumentsMain(editor as unknown as EditorWidget, [custom]);

        await main.save(uri);

        expect(editor.saveable.saveCount).to.equal(1);
        expect(custom.saveable.saveCount).to.equal(0);
    });

    it('leaves widgets bound to another resource alone', async () => {
        const other = new TestSaveableWidget(new URI('custom-editor:/other/resource'));
        const main = createEditorsAndDocumentsMain(undefined, [other]);

        const saved = await main.save(uri);

        expect(other.saveable.saveCount).to.equal(0);
        expect(saved).to.be.undefined;
    });

    it('ignores a widget that is navigatable to the resource but not saveable', async () => {
        const main = createEditorsAndDocumentsMain(undefined, [new TestNavigatableWidget(uri)]);

        expect(await main.save(uri)).to.be.undefined;
    });

    it('resolves saveAs through the same fallback', async () => {
        const widget = new TestSaveableWidget(uri);
        const main = createEditorsAndDocumentsMain(undefined, [widget]);
        const saveAsTargets: Widget[] = [];
        // `SaveableService.canSaveAs` is unconditionally false on the base class, so the
        // service is stubbed to reach the `saveAs` branch at all.
        (main as unknown as Record<string, unknown>).saveResourceService = {
            canSaveAs: (candidate: Widget) => candidate === widget,
            saveAs: async (target: Widget) => { saveAsTargets.push(target); return uri; }
        };

        const saved = await main.saveAs(uri);

        expect(saveAsTargets).to.deep.equal([widget]);
        expect(saved?.toString()).to.equal(uri.toString());
    });
});
