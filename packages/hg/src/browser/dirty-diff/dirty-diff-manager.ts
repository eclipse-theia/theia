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
import { EditorManager, EditorWidget, TextEditor, TextEditorDocument, TextDocumentChangeEvent } from '@theia/editor/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { Emitter, Event, Disposable, DisposableCollection } from '@theia/core';
import { ContentLines } from '@theia/scm/lib/browser/dirty-diff/content-lines';
import { DirtyDiffUpdate } from '@theia/scm/lib/browser/dirty-diff/dirty-diff-decorator';
import { DiffComputer, DirtyDiff } from '@theia/scm/lib/browser/dirty-diff/diff-computer';
import { HgPreferences, HgConfiguration } from '../hg-preferences';
import { PreferenceChangeEvent } from '@theia/core/lib/browser';
import { HG_RESOURCE_SCHEME } from '../hg-resource';
import { HgResourceResolver } from '../hg-resource-resolver';
import { HgFileStatus, HgFileChange, Repository, Hg, HgStatusChangeEvent } from '../../common';
import { HgRepositoryTracker } from '../hg-repository-tracker';

import throttle = require('lodash.throttle');

@injectable()
export class DirtyDiffManager {

    protected readonly models = new Map<string, DirtyDiffModel>();

    protected readonly onDirtyDiffUpdateEmitter = new Emitter<DirtyDiffUpdate>();
    readonly onDirtyDiffUpdate: Event<DirtyDiffUpdate> = this.onDirtyDiffUpdateEmitter.event;

    @inject(Hg)
    protected readonly hg: Hg;

    @inject(HgRepositoryTracker)
    protected readonly repositoryTracker: HgRepositoryTracker;

    @inject(HgResourceResolver)
    protected readonly hgResourceResolver: HgResourceResolver;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(HgPreferences)
    protected readonly preferences: HgPreferences;

    @postConstruct()
    protected async initialize(): Promise<void> {
        this.editorManager.onCreated(async e => this.handleEditorCreated(e));
        this.repositoryTracker.onHgEvent(throttle(async (event: HgStatusChangeEvent | undefined) =>
            this.handleHgStatusUpdate(event && event.source, event ? event.status : []), 500));
        const hgStatus = this.repositoryTracker.selectedRepositoryStatus;
        const repository = this.repositoryTracker.selectedRepository;
        if (hgStatus && repository) {
            await this.handleHgStatusUpdate(repository, hgStatus.changes);
        }
    }

    protected async handleEditorCreated(editorWidget: EditorWidget): Promise<void> {
        const editor = editorWidget.editor;
        const uri = editor.uri.toString();
        if (editor.uri.scheme !== 'file') {
            return;
        }
        const toDispose = new DisposableCollection();
        const model = this.createNewModel(editor);
        toDispose.push(model);
        this.models.set(uri, model);
        toDispose.push(editor.onDocumentContentChanged(throttle((event: TextDocumentChangeEvent) => model.handleDocumentChanged(event.document), 1000)));
        editorWidget.disposed.connect(() => {
            this.models.delete(uri);
            toDispose.dispose();
        });
        const hgStatus = this.repositoryTracker.selectedRepositoryStatus;
        const repository = this.repositoryTracker.selectedRepository;
        if (repository) {
            const changes = hgStatus.changes.filter(c => c.uri === uri);
            await model.handleHgStatusUpdate(repository, changes);
        }
        model.handleDocumentChanged(editor.document);
    }

    protected createNewModel(editor: TextEditor): DirtyDiffModel {
        const previousRevision = this.createPreviousFileRevision(editor.uri);
        const model = new DirtyDiffModel(editor, this.preferences, previousRevision);
        model.onDirtyDiffUpdate(e => this.onDirtyDiffUpdateEmitter.fire(e));
        return model;
    }

    protected createPreviousFileRevision(fileUri: URI): DirtyDiffModel.PreviousFileRevision {
        return <DirtyDiffModel.PreviousFileRevision>{
            fileUri,
            getContents: async (staged: boolean) => {
                const query = staged ? '' : 'tip';
                const uri = fileUri.withScheme(HG_RESOURCE_SCHEME).withQuery(query);
                const hgResource = await this.hgResourceResolver.getResource(uri);
                return hgResource.readContents();
            },
            isVersionControlled: async () => {
                const repository = this.repositoryTracker.selectedRepository;
                if (repository) {
                    return this.hg.lsFiles(repository, fileUri.toString());
                }
                return false;
            }
        };
    }

    protected async handleHgStatusUpdate(repository: Repository | undefined, changes: HgFileChange[]): Promise<void> {
        const uris = new Set(this.models.keys());
        const relevantChanges = changes.filter(c => uris.has(c.uri));
        for (const model of this.models.values()) {
            const uri = model.editor.uri.toString();
            const changesForUri = relevantChanges.filter(c => c.uri === uri);
            await model.handleHgStatusUpdate(repository, changesForUri);
        }
    }

}

export class DirtyDiffModel implements Disposable {

    protected toDispose = new DisposableCollection();

    protected enabled = true;
    protected tracked: boolean;
    protected previousContent: ContentLines | undefined;
    protected currentContent: ContentLines | undefined;

    protected readonly onDirtyDiffUpdateEmitter = new Emitter<DirtyDiffUpdate>();
    readonly onDirtyDiffUpdate: Event<DirtyDiffUpdate> = this.onDirtyDiffUpdateEmitter.event;

    constructor(
        readonly editor: TextEditor,
        readonly preferences: HgPreferences,
        protected readonly previousRevision: DirtyDiffModel.PreviousFileRevision
    ) {
        this.toDispose.push(this.preferences.onPreferenceChanged(e => this.handlePreferenceChange(e)));
    }

    protected async handlePreferenceChange(event: PreferenceChangeEvent<HgConfiguration>): Promise<void> {
        const { preferenceName, newValue } = event;
        if (preferenceName === 'hg.editor.decorations.enabled') {
            const enabled = !!newValue;
            this.enabled = enabled;
            this.update();
        }
        if (preferenceName === 'hg.editor.dirtyDiff.linesLimit') {
            this.update();
        }
    }

    protected get linesLimit(): number {
        const limit = this.preferences['hg.editor.dirtyDiff.linesLimit'];
        return limit > 0 ? limit : Number.MAX_SAFE_INTEGER;
    }

    protected updateTimeout: number | undefined;

    protected shouldRender(): boolean {
        if (!this.enabled || !this.previousContent || !this.currentContent) {
            return false;
        }
        const limit = this.linesLimit;
        return this.previousContent.length < limit && this.currentContent.length < limit;
    }

    update(): void {
        const editor = this.editor;
        if (!this.shouldRender()) {
            this.onDirtyDiffUpdateEmitter.fire({ editor, added: [], removed: [], modified: [] });
            return;
        }
        if (this.updateTimeout) {
            window.clearTimeout(this.updateTimeout);
        }
        this.updateTimeout = window.setTimeout(() => {
            const previous = this.previousContent;
            const current = this.currentContent;
            if (!previous || !current) {
                return;
            }
            this.updateTimeout = undefined;
            const dirtyDiff = DirtyDiffModel.computeDirtyDiff(previous, current);
            if (!dirtyDiff) {
                // if the computation fails, it might be because of changes in the editor, in that case
                // a new update task should be scheduled anyway.
                return;
            }
            const dirtyDiffUpdate = <DirtyDiffUpdate>{ editor, ...dirtyDiff };
            this.onDirtyDiffUpdateEmitter.fire(dirtyDiffUpdate);
        }, 100);
    }

    handleDocumentChanged(document: TextEditorDocument): void {
        this.currentContent = DirtyDiffModel.documentContentLines(document);
        this.update();
    }

    async handleHgStatusUpdate(repository: Repository | undefined, relevantChanges: HgFileChange[]): Promise<void> {
        const noRelevantChanges = relevantChanges.length === 0;
        const isNewAndTracked = relevantChanges.some(c => c.status === HgFileStatus.New);
        const isUntracked = relevantChanges.some(c => c.status === HgFileStatus.Untracked);
        const modifiedChange = relevantChanges.find(c => c.status === HgFileStatus.Modified);
        const isModified = !!modifiedChange;
        const readPreviousRevisionContent = async () => {
            try {
                this.previousContent = await this.getPreviousRevisionContent();
            } catch {
                this.previousContent = undefined;
            }
        };
        if (isModified || isNewAndTracked) {
            this.tracked = isNewAndTracked;
            await readPreviousRevisionContent();
        }
        if (isUntracked && !isNewAndTracked) {
            this.previousContent = undefined;
        }
        if (noRelevantChanges) {
            const inHgRepository = await this.isInHgRepository(repository);
            if (inHgRepository) {
                await readPreviousRevisionContent();
            }
        }
        this.update();
    }

    protected async isInHgRepository(repository: Repository | undefined): Promise<boolean> {
        if (!repository) {
            return false;
        }
        const modelUri = this.editor.uri.withScheme('file').toString();
        const repoUri = new URI(repository.localUri).withScheme('file').toString();
        return modelUri.startsWith(repoUri) && this.previousRevision.isVersionControlled();
    }

    protected async getPreviousRevisionContent(): Promise<ContentLines | undefined> {
        const contents = await this.previousRevision.getContents(this.tracked);
        return contents ? ContentLines.fromString(contents) : undefined;
    }

    dispose(): void {
        this.toDispose.dispose();
        this.onDirtyDiffUpdateEmitter.dispose();
    }
}

export namespace DirtyDiffModel {

    const diffComputer = new DiffComputer();

    /**
     * Returns an eventually consistent result. E.g. it can happen, that lines are deleted during the computation,
     * which will internally produce 'line out of bound' errors, then it will return `undefined`.
     *
     * `ContentLines` are to avoid copying contents which improves the performance, therefore handling of the `undefined`
     * result, and rescheduling of the computation should be done by caller.
     */
    export function computeDirtyDiff(previous: ContentLines, current: ContentLines): DirtyDiff | undefined {
        try {
            return diffComputer.computeDirtyDiff(ContentLines.arrayLike(previous), ContentLines.arrayLike(current));
        } catch {
            return undefined;
        }
    }

    export function documentContentLines(document: TextEditorDocument): ContentLines {
        return {
            length: document.lineCount,
            getLineContent: line => document.getLineContent(line + 1),
        };
    }

    export interface PreviousFileRevision {
        readonly fileUri: URI;
        getContents(staged: boolean): Promise<string>;
        isVersionControlled(): Promise<boolean>;
    }

}
