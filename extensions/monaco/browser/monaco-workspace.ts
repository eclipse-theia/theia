/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, decorate } from "inversify";
import {
    MonacoWorkspace as BaseMonacoWorkspace, ProtocolToMonacoConverter, MonacoToProtocolConverter, testGlob
} from "monaco-languageclient";
import { DisposableCollection } from "../../application/common";
import { FileChangeType, FileSystem, FileSystemWatcher } from '../../filesystem/common';
import { WorkspaceService } from "../../workspace/browser";
import * as lang from "../../languages/common";
import { Emitter, Event, TextDocument, TextDocumentWillSaveEvent, TextEdit } from "../../languages/common";
import { MonacoModelResolver } from "./monaco-model-resolver";
import { WillSaveModelEvent } from "./monaco-editor-model";
import URI from "../../application/common/uri";

decorate(injectable(), BaseMonacoWorkspace);
decorate(inject(MonacoToProtocolConverter), BaseMonacoWorkspace, 0);

@injectable()
export class MonacoWorkspace extends BaseMonacoWorkspace implements lang.Workspace {
    readonly capabilities = {
        applyEdit: true,
        workspaceEdit: {
            documentChanges: true
        }
    };

    readonly synchronization = {
        didSave: true,
        willSave: true,
        willSaveWaitUntil: true
    };

    protected resolveReady: () => void;
    readonly ready = new Promise<void>(resolve => {
        this.resolveReady = resolve;
    });
    protected readonly onWillSaveTextDocumentEmitter = new Emitter<TextDocumentWillSaveEvent>();
    protected readonly onDidSaveTextDocumentEmitter = new Emitter<TextDocument>();

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(FileSystemWatcher) protected readonly fileSystemWatcher: FileSystemWatcher,
        @inject(MonacoModelResolver) protected readonly monacoModelResolver: MonacoModelResolver,
        @inject(MonacoToProtocolConverter) protected readonly m2p: MonacoToProtocolConverter,
        @inject(ProtocolToMonacoConverter) protected readonly p2m: ProtocolToMonacoConverter
    ) {
        super(m2p);
        workspaceService.root.then(rootStat => {
            this._rootUri = rootStat.uri;
            this.resolveReady();
        });
        monaco.editor.onDidCreateModel(model => {
            this.monacoModelResolver.createModelReference(model.uri).then(reference => {
                reference.object.onDidSaveModel(model =>
                    this.onDidSaveModel(model)
                );
                reference.object.onWillSaveModel(event =>
                    this.onWillSaveModel(event)
                );
                reference.dispose();
            });
        });
    }

    get rootPath(): string | null {
        return this._rootUri && new URI(this._rootUri).path.toString();
    }

    getTextDocument(uri: string): TextDocument | undefined {
        return this.documents.get(uri);
    }

    get onWillSaveTextDocument(): Event<TextDocumentWillSaveEvent> {
        return this.onWillSaveTextDocumentEmitter.event;
    }

    protected onWillSaveModel(event: WillSaveModelEvent): void {
        const { model, reason } = event;
        const textDocument = this.getTextDocument(model.uri.toString());
        if (textDocument) {
            const timeout = new Promise<TextEdit[]>(resolve =>
                setTimeout(() => resolve([]), 1000)
            );
            const resolveEdits = new Promise<TextEdit[]>(resolve =>
                this.onWillSaveTextDocumentEmitter.fire({
                    textDocument,
                    reason,
                    waitUntil: thenable => thenable.then(resolve)
                })
            );
            event.waitUntil(
                Promise.race([resolveEdits, timeout]).then(edits =>
                    this.p2m.asTextEdits(edits).map(edit => edit as monaco.editor.IIdentifiedSingleEditOperation)
                )
            );
        }
    }

    get onDidSaveTextDocument(): Event<TextDocument> {
        return this.onDidSaveTextDocumentEmitter.event;
    }

    protected onDidSaveModel(model: monaco.editor.IModel): void {
        const document = this.getTextDocument(model.uri.toString());
        if (document) {
            this.onDidSaveTextDocumentEmitter.fire(document);
        }
    }

    createFileSystemWatcher(globPattern: string, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): lang.FileSystemWatcher {
        const disposables = new DisposableCollection()
        const onFileEventEmitter = new lang.Emitter<lang.FileEvent>()
        disposables.push(onFileEventEmitter);
        disposables.push(this.fileSystemWatcher.onFilesChanged(changes => {
            for (const change of changes) {
                const result: [lang.FileChangeType, boolean | undefined] =
                    change.type === FileChangeType.ADDED ? [lang.FileChangeType.Created, ignoreCreateEvents] :
                        change.type === FileChangeType.UPDATED ? [lang.FileChangeType.Changed, ignoreChangeEvents] :
                            [lang.FileChangeType.Deleted, ignoreDeleteEvents];

                const type = result[0];
                const ignoreEvents = result[1];
                const uri = change.uri.toString();
                if (ignoreEvents === undefined && ignoreEvents === false && testGlob(globPattern, uri)) {
                    onFileEventEmitter.fire({ uri, type });
                }
            }
        }));
        const onFileEvent = onFileEventEmitter.event;
        return {
            onFileEvent,
            dispose: () => disposables.dispose()
        };
    }

    applyEdit(changes: lang.WorkspaceEdit): Promise<boolean> {
        const workspaceEdit = this.p2m.asWorkspaceEdit(changes);
        const promises = [];
        for (const edit of workspaceEdit.edits) {
            promises.push(this.monacoModelResolver.createModelReference(edit.resource).then(reference => {
                const model = reference.object.textEditorModel;
                const range = edit.range;
                model.applyEdits([{
                    identifier: undefined!,
                    forceMoveMarkers: false,
                    range: new monaco.Range(range.startColumn, range.startLineNumber, range.endColumn, range.endLineNumber),
                    text: edit.newText
                }]);
                reference.dispose();
            }));
        }
        return Promise.all(promises).then(() => true);
    }

}
