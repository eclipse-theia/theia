/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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

    protected readonly onDidUpdateEmitter = new Emitter<MergeConflicts>();
    readonly onDidUpdate: Event<MergeConflicts> = this.onDidUpdateEmitter.event;

    deferredValues = new Map<string, Deferred<MergeConflicts>>();
    timeouts = new Map<string, number>();

    @postConstruct()
    protected initialize() {
        this.editorManager.onCreated(w => this.handleNewEditor(w));
    }

    get(uri: string): Promise<MergeConflicts | undefined> {
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
        const deferred = new Deferred<MergeConflicts>();
        this.deferredValues.set(uri, deferred);
        window.setTimeout(() => {
            const mergeConflicts = this.computeMergeConflicts(editor);
            this.onDidUpdateEmitter.fire(mergeConflicts);
            deferred.resolve(mergeConflicts);
        }, 100);
    }

    protected remove(editor: TextEditor): void {
        const uri = editor.uri.toString();
        const deferred = this.deferredValues.get(uri);
        if (deferred) {
            this.deferredValues.delete(uri);
            deferred.reject();
        }
    }

    protected computeMergeConflicts(editor: TextEditor): MergeConflicts {
        const uri = editor.uri.toString();
        const document = editor.document;
        const input = <MergeConflictsParser.Input>{
            lineCount: document.lineCount,
            getLine: number => document.getLineContent(number + 1),
        };
        const mergeConflicts: MergeConflict[] = this.mergeConflictParser.parse(input);
        return { uri, mergeConflicts };
    }

}

export interface MergeConflicts {
    uri: string;
    mergeConflicts: MergeConflict[];
}
