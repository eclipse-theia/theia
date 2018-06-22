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

import { inject, injectable, postConstruct } from "inversify";
import { MergeConflict } from "./merge-conflict";
import { TextEditor, EditorManager, EditorWidget } from "@theia/editor/lib/browser";
import { Emitter, Event, DisposableCollection } from "@theia/core";
import { Deferred } from "@theia/core/lib/common/promise-util";
import { MergeConflictsParser } from "./merge-conflicts-parser";

import throttle = require('lodash.throttle');

@injectable()
export class MergeConflictsProvider {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(MergeConflictsParser)
    protected readonly mergeConflictParser: MergeConflictsParser;

    protected readonly onDidUpdateEmitter = new Emitter<MergeConflictsUpdate>();
    readonly onDidUpdate: Event<MergeConflictsUpdate> = this.onDidUpdateEmitter.event;

    deferredValues = new Map<string, Deferred<MergeConflictsUpdate>>();
    timeouts = new Map<string, number>();

    @postConstruct()
    protected initialize() {
        this.editorManager.onCreated(w => this.handleNewEditor(w));
    }

    get(uri: string): Promise<MergeConflictsUpdate | undefined> {
        const deferred = this.deferredValues.get(uri);
        return deferred ? deferred.promise : Promise.resolve(undefined);
    }

    protected handleNewEditor(editorWidget: EditorWidget): void {
        const editor = editorWidget.editor;
        const uri = editor.uri;
        if (uri.scheme !== 'file') {
            return;
        }
        const toDispose = new DisposableCollection();
        toDispose.push(editor.onDocumentContentChanged(throttle(document => this.contentChanged(editor), 500)));
        editorWidget.disposed.connect(() => {
            toDispose.dispose();
        });
        this.contentChanged(editor);
    }

    protected contentChanged(editor: TextEditor): void {
        const uri = editor.uri.toString();
        const deferred = new Deferred<MergeConflictsUpdate>();
        this.deferredValues.set(uri, deferred);
        window.setTimeout(() => {
            const mergeConflicts = this.computeMergeConflicts(editor);
            this.onDidUpdateEmitter.fire(mergeConflicts);
            deferred.resolve(mergeConflicts);
        }, 100);
    }

    protected computeMergeConflicts(editor: TextEditor): MergeConflictsUpdate {
        const document = editor.document;
        const input = <MergeConflictsParser.Input>{
            lineCount: document.lineCount,
            getLine: number => document.getLineContent(number + 1),
        };
        const mergeConflicts: MergeConflict[] = this.mergeConflictParser.parse(input);
        return { editor, mergeConflicts };
    }

}

export interface MergeConflictsUpdate {
    readonly editor: TextEditor;
    readonly mergeConflicts: MergeConflict[];
}
