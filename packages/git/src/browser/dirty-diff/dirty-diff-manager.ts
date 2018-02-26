/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, postConstruct } from 'inversify';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { Workspace } from '@theia/languages/lib/common';
import URI from '@theia/core/lib/common/uri';
import { DiffComputer, DirtyDiff } from './diff-computer';
import { Emitter, Event, Disposable, ReferenceCollection } from '@theia/core';
import { GitPreferences, GitConfiguration } from '../git-preferences';
import { PreferenceChangeEvent } from '@theia/core/lib/browser';
import { GitResourceResolver, GIT_RESOURCE_SCHEME } from '../git-resource';
import { WorkingDirectoryStatus, GitFileStatus, GitFileChange, Repository } from '../../common';
import { GitRepositoryTracker } from '../git-repository-tracker';

@injectable()
export class DirtyDiffManager {

    protected readonly models = new ReferenceCollection<string, DirtyDiffModel>(
        uri => this.createNewModel(uri)
    );

    protected readonly onDirtyDiffUpdateEmitter = new Emitter<DirtyDiffUpdate>();
    readonly onDirtyDiffUpdate: Event<DirtyDiffUpdate> = this.onDirtyDiffUpdateEmitter.event;

    @inject(GitRepositoryTracker) protected readonly repositoryTracker: GitRepositoryTracker;
    @inject(GitResourceResolver) protected readonly gitResourceResolver: GitResourceResolver;

    @inject(EditorManager) protected readonly editorManager: EditorManager;

    @inject(Workspace) protected readonly workspace: Workspace;
    @inject(GitPreferences) protected readonly preferences: GitPreferences;

    @postConstruct()
    protected async initialize() {
        this.workspace.onDidChangeTextDocument(async params => await this.handleDocumentChanged(params.textDocument.uri));
        this.preferences.onPreferenceChanged(async e => await this.handlePreferenceChange(e));
        this.editorManager.onCreated(async e => await this.handleEditorCreated(e));
        this.repositoryTracker.onGitEvent(async event => await this.handleGitStatusUpdate(event.source, event.status));
        const gitStatus = this.repositoryTracker.selectedRepositoryStatus;
        const repository = this.repositoryTracker.selectedRepository;
        if (gitStatus && repository) {
            await this.handleGitStatusUpdate(repository, gitStatus);
        }
    }

    protected async handleEditorCreated(editorWidget: EditorWidget): Promise<void> {
        const editor = editorWidget.editor;
        const uri = editor.document.uri;
        const reference = await this.models.acquire(uri);
        editorWidget.disposed.connect(() => reference.dispose());
        const model = reference.object;
        const gitStatus = this.repositoryTracker.selectedRepositoryStatus;
        const repository = this.repositoryTracker.selectedRepository;
        if (gitStatus && repository) {
            const changes = gitStatus.changes.filter(c => c.uri === uri);
            await model.handleGitStatusUpdate(repository, changes);
        }
        model.handleDocumentChanged(editor.document.getText());
    }

    protected createNewModel(uri: string): DirtyDiffModel {
        const model = new DirtyDiffModel(uri, async gitUri => await this.readGitResourceContents(gitUri));
        model.onDirtyDiffUpdate(e => this.onDirtyDiffUpdateEmitter.fire(e));
        model.enabled = this.isEnabled();
        return model;
    }

    protected async readGitResourceContents(uri: URI): Promise<string> {
        const gitResource = await this.gitResourceResolver.getResource(uri);
        return gitResource.readContents();
    }

    protected async handleDocumentChanged(uri: string): Promise<void> {
        const model = await this.getModel(uri);
        if (model) {
            const document = this.workspace.textDocuments.find(d => d.uri === uri);
            if (document) {
                model.handleDocumentChanged(document.getText());
            }
        }
    }

    protected async handleGitStatusUpdate(repository: Repository, status: WorkingDirectoryStatus): Promise<void> {
        const uris = new Set(this.models.keys());
        const relevantChanges = status.changes.filter(c => uris.has(c.uri));
        const models = await this.allModels();
        for (const model of models) {
            const uri = model.uri;
            const changes = relevantChanges.filter(c => c.uri === uri);
            await model.handleGitStatusUpdate(repository, changes);
        }
    }

    protected isEnabled(): boolean {
        return this.preferences["git.editor.decorations.enabled"];
    }

    protected async handlePreferenceChange(event: PreferenceChangeEvent<GitConfiguration>): Promise<void> {
        const { preferenceName, newValue } = event;
        if (preferenceName === "git.editor.decorations.enabled") {
            const enabled = !!newValue;
            const models = await this.allModels();
            for (const model of models) {
                model.enabled = enabled;
                model.update();
            }
        }
    }

    protected async allModels(): Promise<DirtyDiffModel[]> {
        const models = [];
        const uris = this.models.keys();
        for (const uri of uris) {
            const reference = await this.models.acquire(uri);
            models.push(reference.object);
            reference.dispose();
        }
        return models;
    }

    protected async getModel(uri: string): Promise<DirtyDiffModel | undefined> {
        if (this.models.has(uri)) {
            const reference = await this.models.acquire(uri);
            const model = reference.object;
            reference.dispose();
            return model;
        }
        return undefined;
    }

}

export interface DirtyDiffUpdate extends DirtyDiff {
    readonly uri: string;
}

export class DirtyDiffModel implements Disposable {

    enabled = true;

    protected dirty = true;
    protected staged: boolean;
    protected previousContent: string[];
    protected currentContent: string[];

    protected readonly onDirtyDiffUpdateEmitter = new Emitter<DirtyDiffUpdate>();
    readonly onDirtyDiffUpdate: Event<DirtyDiffUpdate> = this.onDirtyDiffUpdateEmitter.event;
    protected readonly updateDelayer = new DirtyDiffModel.Throttler(200);

    constructor(
        readonly uri: string,
        protected readonly readGitResource: DirtyDiffModel.GitResourceReader
    ) { }

    update(): void {
        const enabled = this.enabled && this.dirty;
        const previous = enabled ? this.previousContent : [];
        const current = enabled ? this.currentContent : [];
        if (!previous || !current) {
            return;
        }
        const uri = this.uri;
        this.updateDelayer.push(() => {
            const dirtyDiff = enabled
                ? DirtyDiffModel.computeDirtyDiff(previous, current)
                : <DirtyDiff>{ added: [], removed: [], modified: [] };
            const dirtyDiffUpdate = <DirtyDiffUpdate>{ uri, ...dirtyDiff };
            this.onDirtyDiffUpdateEmitter.fire(dirtyDiffUpdate);
        });
    }

    handleDocumentChanged(documentContent: string): void {
        this.currentContent = DirtyDiffModel.splitLines(documentContent);
        this.update();
    }

    async handleGitStatusUpdate(repository: Repository, relevantChanges: GitFileChange[]): Promise<void> {
        const noRelevantChanges = relevantChanges.length === 0;
        const isNewAndStaged = relevantChanges.some(c => c.status === GitFileStatus.New && !!c.staged);
        const isNewAndUnstaged = relevantChanges.some(c => c.status === GitFileStatus.New && !c.staged);
        const modifiedChange = relevantChanges.find(c => c.status === GitFileStatus.Modified);
        const isModified = !!modifiedChange;
        if (isModified || isNewAndStaged) {
            this.dirty = true;
            this.staged = isNewAndStaged || modifiedChange!.staged || false;
            try {
                this.previousContent = await this.getPreviousRevision();
            } catch {
                this.dirty = false;
                this.previousContent = [];
            }
        }
        if (isNewAndUnstaged && !isNewAndStaged) {
            this.dirty = false;
            this.previousContent = [];
        }
        if (noRelevantChanges && this.isInGitRepository(repository)) {
            try {
                this.previousContent = await this.getPreviousRevision();
            } catch { }
        }
        this.update();
    }

    protected isInGitRepository(repository: Repository): boolean {
        const modelUri = new URI(this.uri).withoutScheme().toString();
        const repoUri = new URI(repository.localUri).withoutScheme().toString();
        return modelUri.startsWith(repoUri);
    }

    protected async getPreviousRevision(): Promise<string[]> {
        const query = this.staged ? "" : "HEAD";
        const uri = new URI(this.uri).withScheme(GIT_RESOURCE_SCHEME).withQuery(query);
        const contents = await this.readGitResource(uri);
        return DirtyDiffModel.splitLines(contents);
    }

    dispose(): void {
        this.onDirtyDiffUpdateEmitter.dispose();
    }
}

export namespace DirtyDiffModel {

    const diffComputer = new DiffComputer();

    export function computeDirtyDiff(previous: string[], current: string[]): DirtyDiff {
        return diffComputer.computeDirtyDiff(previous, current);
    }

    export function splitLines(text: string): string[] {
        return text.split(/\r\n|\n/);
    }

    export interface GitResourceReader {
        (uri: URI): Promise<string>;
    }

    export class Throttler {

        protected lastTask: () => void;
        protected timeout: number | undefined;

        constructor(protected readonly delay: number) { }

        push(task: () => void): void {
            this.lastTask = task;
            if (!this.timeout) {
                this.timeout = window.setTimeout(() => {
                    this.timeout = undefined;
                    this.lastTask();
                }, this.delay);
            }
        }

    }

}
