/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable, postConstruct } from 'inversify';
import { MergeConflict } from './merge-conflict';
import { TextEditor, EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { Emitter, Event } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { MergeConflictsParser } from './merge-conflicts-parser';

import debounce = require('lodash.debounce');

@injectable()
export class MergeConflictsProvider {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(MergeConflictsParser)
    protected readonly mergeConflictParser: MergeConflictsParser;

    protected readonly onDidUpdateEmitter = new Emitter<MergeConflictsUpdate>();
    readonly onDidUpdate: Event<MergeConflictsUpdate> = this.onDidUpdateEmitter.event;

    protected values = new Map<string, Promise<MergeConflict[]>>();
    protected valueTimeouts = new Map<string, number>();

    @postConstruct()
    protected initialize(): void {
        this.editorManager.onCreated(w => this.handleNewEditor(w));
    }

    get(uri: string): Promise<MergeConflict[] | undefined> {
        return this.values.get(uri) || Promise.resolve(undefined);
    }

    protected handleNewEditor(editorWidget: EditorWidget): void {
        const editor = editorWidget.editor;
        const uri = editor.uri;
        if (uri.scheme !== 'file') {
            return;
        }
        const debouncedUpdate = debounce(() => this.updateMergeConflicts(editor), 200, { leading: true });
        const disposable = editor.onDocumentContentChanged(() => debouncedUpdate());
        editorWidget.disposed.connect(() => disposable.dispose());
        debouncedUpdate();
    }

    protected updateMergeConflicts(editor: TextEditor): void {
        const uri = editor.uri.toString();
        if (this.valueTimeouts.has(uri)) {
            window.clearTimeout(this.valueTimeouts.get(uri));
        }
        const deferred = new Deferred<MergeConflict[]>();
        this.values.set(uri, deferred.promise);
        window.setTimeout(() => {
            const mergeConflicts = this.computeMergeConflicts(editor);
            this.onDidUpdateEmitter.fire({ editor, mergeConflicts });
            deferred.resolve(mergeConflicts);
        }, 50);
        this.valueTimeouts.set(uri, window.setTimeout(() => {
            this.values.delete(uri);
        }, 1000));
    }

    protected computeMergeConflicts(editor: TextEditor): MergeConflict[] {
        const document = editor.document;
        const input = <MergeConflictsParser.Input>{
            lineCount: document.lineCount,
            getLine: number => document.getLineContent(number + 1),
        };
        return this.mergeConflictParser.parse(input);
    }

}

export interface MergeConflictsUpdate {
    readonly editor: TextEditor;
    readonly mergeConflicts: MergeConflict[];
}
