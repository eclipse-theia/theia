// *****************************************************************************
// Copyright (C) 2019 Red Hat, Inc. and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { DisposableCollection, Emitter, Event, ResourceProvider } from '@theia/core';
import { DirtyDiffDecorator, DirtyDiffUpdate } from '../dirty-diff/dirty-diff-decorator';
import { DiffComputer } from '../dirty-diff/diff-computer';
import { ContentLines } from '../dirty-diff/content-lines';
import { EditorManager, EditorWidget, TextEditor } from '@theia/editor/lib/browser';
import { ScmService } from '../scm-service';

import throttle = require('@theia/core/shared/lodash.throttle');

@injectable()
export class ScmDecorationsService {
    private readonly diffComputer = new DiffComputer();

    protected readonly onDirtyDiffUpdateEmitter = new Emitter<DirtyDiffUpdate>();
    readonly onDirtyDiffUpdate: Event<DirtyDiffUpdate> = this.onDirtyDiffUpdateEmitter.event;

    constructor(
        @inject(DirtyDiffDecorator) protected readonly decorator: DirtyDiffDecorator,
        @inject(ScmService) protected readonly scmService: ScmService,
        @inject(EditorManager) protected readonly editorManager: EditorManager,
        @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider
    ) {
        const updateTasks = new Map<EditorWidget, { (): void; cancel(): void }>();
        this.editorManager.onCreated(editorWidget => {
            const { editor } = editorWidget;
            if (!this.supportsDirtyDiff(editor)) {
                return;
            }
            const toDispose = new DisposableCollection();
            const updateTask = this.createUpdateTask(editor);
            updateTasks.set(editorWidget, updateTask);
            toDispose.push(editor.onDocumentContentChanged(() => updateTask()));
            toDispose.push(editorWidget.onDidChangeVisibility(visible => {
                if (visible) {
                    updateTask();
                }
            }));
            if (editor.onShouldDisplayDirtyDiffChanged) {
                toDispose.push(editor.onShouldDisplayDirtyDiffChanged(shouldDisplayDirtyDiff => {
                    if (shouldDisplayDirtyDiff) {
                        updateTask();
                    } else {
                        const update: DirtyDiffUpdate = { editor, changes: [] };
                        this.decorator.applyDecorations(update);
                        this.onDirtyDiffUpdateEmitter.fire(update);
                    }
                }));
            }
            editorWidget.disposed.connect(() => {
                updateTask.cancel();
                updateTasks.delete(editorWidget);
                toDispose.dispose();
            });
            updateTask();
        });
        const runUpdateTasks = () => {
            for (const updateTask of updateTasks.values()) {
                updateTask();
            }
        };
        this.scmService.onDidAddRepository(({ provider }) => {
            provider.onDidChange(runUpdateTasks);
            provider.onDidChangeResources?.(runUpdateTasks);
        });
        this.scmService.onDidChangeSelectedRepository(runUpdateTasks);
    }

    async applyEditorDecorations(editor: TextEditor): Promise<void> {
        if (!editor.shouldDisplayDirtyDiff()) {
            return;
        }
        const currentRepo = this.scmService.selectedRepository;
        if (currentRepo) {
            try {
                // Currently, the uri used here is specific to vscode.git; other SCM providers are thus not supported.
                // See https://github.com/eclipse-theia/theia/pull/13104#discussion_r1494540628 for a detailed discussion.
                const query = { path: editor.uri['codeUri'].fsPath, ref: '~' };
                const uri = editor.uri.withScheme(currentRepo.provider.id).withQuery(JSON.stringify(query));
                const previousResource = await this.resourceProvider(uri);
                try {
                    const previousContent = await previousResource.readContents();
                    if (!editor.shouldDisplayDirtyDiff()) { // check again; it might have changed in the meantime, since this is an async method
                        return;
                    }
                    const previousLines = ContentLines.fromString(previousContent);
                    const currentLines = ContentLines.fromTextEditorDocument(editor.document);
                    const dirtyDiff = this.diffComputer.computeDirtyDiff(ContentLines.arrayLike(previousLines), ContentLines.arrayLike(currentLines));
                    const update = { editor, previousRevisionUri: uri, ...dirtyDiff } satisfies DirtyDiffUpdate;
                    this.decorator.applyDecorations(update);
                    this.onDirtyDiffUpdateEmitter.fire(update);
                } finally {
                    previousResource.dispose();
                }
            } catch (e) {
                // Scm resource may not be found, do nothing.
            }
        }
    }

    protected supportsDirtyDiff(editor: TextEditor): boolean {
        return editor.shouldDisplayDirtyDiff() || !!editor.onShouldDisplayDirtyDiffChanged;
    }

    protected createUpdateTask(editor: TextEditor): { (): void; cancel(): void; } {
        return throttle(() => this.applyEditorDecorations(editor), 500);
    }
}
