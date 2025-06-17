// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { ConfigurableInMemoryResources, ConfigurableMutableReferenceResource } from '@theia/ai-core';
import { CancellationToken, DisposableCollection, Emitter, URI } from '@theia/core';
import { ConfirmDialog } from '@theia/core/lib/browser';
import { Replacement } from '@theia/core/lib/common/content-replacer';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { EditorPreferences } from '@theia/editor/lib/browser';
import { FileSystemPreferences } from '@theia/filesystem/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { IReference } from '@theia/monaco-editor-core/esm/vs/base/common/lifecycle';
import { TrimTrailingWhitespaceCommand } from '@theia/monaco-editor-core/esm/vs/editor/common/commands/trimTrailingWhitespaceCommand';
import { Selection } from '@theia/monaco-editor-core/esm/vs/editor/common/core/selection';
import { CommandExecutor } from '@theia/monaco-editor-core/esm/vs/editor/common/cursor/cursor';
import { formatDocumentWithSelectedProvider, FormattingMode } from '@theia/monaco-editor-core/esm/vs/editor/contrib/format/browser/format';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { IInstantiationService } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/instantiation';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { insertFinalNewline } from '@theia/monaco/lib/browser/monaco-utilities';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { ChangeSetElement } from '../common';
import { createChangeSetFileUri } from './change-set-file-resource';
import { ChangeSetFileService } from './change-set-file-service';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { MonacoCodeActionService } from '@theia/monaco/lib/browser';

export const ChangeSetFileElementFactory = Symbol('ChangeSetFileElementFactory');
export type ChangeSetFileElementFactory = (elementProps: ChangeSetElementArgs) => ChangeSetFileElement;
type ChangeSetElementState = ChangeSetElement['state'];

export const ChangeSetElementArgs = Symbol('ChangeSetElementArgs');
export interface ChangeSetElementArgs extends Partial<ChangeSetElement> {
    /** The URI of the element, expected to be unique within the same change set. */
    uri: URI;
    /** The id of the chat session containing this change set element. */
    chatSessionId: string;
    /** The id of the request with which this change set element is associated. */
    requestId: string;
    /**
     * The state of the file after the changes have been applied.
     * If `undefined`, there is no change.
     */
    targetState?: string;
    /**
     * An array of replacements used to create the new content for the targetState.
     * This is only available if the agent was able to provide replacements and we were able to apply them.
     */
    replacements?: Replacement[];
};

@injectable()
export class ChangeSetFileElement implements ChangeSetElement {

    static toReadOnlyUri(baseUri: URI, sessionId: string): URI {
        return baseUri.withScheme('change-set-immutable').withAuthority(sessionId);
    }

    @inject(ChangeSetElementArgs)
    protected readonly elementProps: ChangeSetElementArgs;

    @inject(ChangeSetFileService)
    protected readonly changeSetFileService: ChangeSetFileService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(ConfigurableInMemoryResources)
    protected readonly inMemoryResources: ConfigurableInMemoryResources;

    @inject(MonacoTextModelService)
    protected readonly monacoTextModelService: MonacoTextModelService;

    @inject(EditorPreferences)
    protected readonly editorPreferences: EditorPreferences;

    @inject(FileSystemPreferences)
    protected readonly fileSystemPreferences: FileSystemPreferences;

    @inject(MonacoCodeActionService)
    protected readonly codeActionService: MonacoCodeActionService;

    protected readonly toDispose = new DisposableCollection();
    protected _state: ChangeSetElementState;

    private _originalContent: string | undefined;
    protected _initialized = false;
    protected _initializationPromise: Promise<void> | undefined;
    protected _targetStateWithCodeActions: string | undefined;
    protected codeActionDeferred?: Deferred<string>;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    protected _readOnlyResource?: ConfigurableMutableReferenceResource;
    protected _changeResource?: ConfigurableMutableReferenceResource;

    @postConstruct()
    init(): void {
        this._initializationPromise = this.initializeAsync();
        this.toDispose.push(this.onDidChangeEmitter);
    }

    protected async initializeAsync(): Promise<void> {
        await this.obtainOriginalContent();
        this.listenForOriginalFileChanges();
        this._initialized = true;
    }

    /**
     * Ensures that the element is fully initialized before proceeding.
     * This includes loading the original content from the file system.
     */
    async ensureInitialized(): Promise<void> {
        await this._initializationPromise;
    }

    /**
     * Returns true if the element has been fully initialized.
     */
    get isInitialized(): boolean {
        return this._initialized;
    }

    protected async obtainOriginalContent(): Promise<void> {
        this._originalContent = await this.changeSetFileService.read(this.uri);
        if (this._readOnlyResource) {
            this.readOnlyResource.update({ contents: this._originalContent ?? '' });
        }
    }

    protected getInMemoryUri(uri: URI): ConfigurableMutableReferenceResource {
        try { return this.inMemoryResources.resolve(uri); } catch { return this.inMemoryResources.add(uri, { contents: '' }); }
    }

    protected listenForOriginalFileChanges(): void {
        this.toDispose.push(this.fileService.onDidFilesChange(async event => {
            if (!event.contains(this.uri)) { return; }
            if (!this._initialized && this._initializationPromise) {
                // make sure we are initialized
                await this._initializationPromise;
            }
            // If we are applied, the tricky thing becomes the question what to revert to; otherwise, what to apply.
            const newContent = await this.changeSetFileService.read(this.uri).catch(() => '');
            this.readOnlyResource.update({ contents: newContent });
            if (newContent === this._originalContent) {
                this.state = 'pending';
            } else if (newContent === this.targetState) {
                this.state = 'applied';
            } else {
                this.state = 'stale';
            }
        }));
    }

    get uri(): URI {
        return this.elementProps.uri;
    }

    protected get readOnlyResource(): ConfigurableMutableReferenceResource {
        if (!this._readOnlyResource) {
            this._readOnlyResource = this.getInMemoryUri(ChangeSetFileElement.toReadOnlyUri(this.uri, this.elementProps.chatSessionId));
            this._readOnlyResource.update({
                autosaveable: false,
                readOnly: true,
                contents: this._originalContent ?? ''
            });
            this.toDispose.push(this._readOnlyResource);

            // If not yet initialized, update the resource once initialization completes
            if (!this._initialized) {
                this._initializationPromise?.then(() => {
                    this._readOnlyResource?.update({ contents: this._originalContent ?? '' });
                });
            }
        }
        return this._readOnlyResource;
    }

    get readOnlyUri(): URI {
        return this.readOnlyResource.uri;
    }

    protected get changeResource(): ConfigurableMutableReferenceResource {
        if (!this._changeResource) {
            this._changeResource = this.getInMemoryUri(createChangeSetFileUri(this.elementProps.chatSessionId, this.uri));
            this._changeResource.update({ autosaveable: false, contents: this.targetState });
            this.applyCodeActionsToTargetState();
            this.toDispose.push(this._changeResource);
        }
        return this._changeResource;
    }

    get changedUri(): URI {
        return this.changeResource.uri;
    }

    get name(): string {
        return this.elementProps.name ?? this.changeSetFileService.getName(this.uri);
    }

    get icon(): string | undefined {
        return this.elementProps.icon ?? this.changeSetFileService.getIcon(this.uri);
    }

    get additionalInfo(): string | undefined {
        return this.changeSetFileService.getAdditionalInfo(this.uri);
    }

    get state(): ChangeSetElementState {
        return this._state ?? this.elementProps.state;
    }

    protected set state(value: ChangeSetElementState) {
        if (this._state !== value) {
            this._state = value;
            this.onDidChangeEmitter.fire();
        }
    }

    get replacements(): Replacement[] | undefined {
        return this.elementProps.replacements;
    }

    get type(): 'add' | 'modify' | 'delete' | undefined {
        return this.elementProps.type;
    }

    get data(): { [key: string]: unknown; } | undefined {
        return this.elementProps.data;
    };

    get originalContent(): string | undefined {
        if (!this._initialized && this._initializationPromise) {
            console.warn('Accessing originalContent before initialization is complete. Consider using async methods.');
        }
        return this._originalContent;
    }

    /**
     * Gets the original content of the file asynchronously.
     * Ensures initialization is complete before returning the content.
     */
    async getOriginalContent(): Promise<string | undefined> {
        await this.ensureInitialized();
        return this._originalContent;
    }

    get targetState(): string {
        return this._targetStateWithCodeActions ?? this.elementProps.targetState ?? '';
    }

    get originalTargetState(): string {
        return this.elementProps.targetState ?? '';
    }

    async open(): Promise<void> {
        await this.ensureInitialized();
        this.changeSetFileService.open(this);
    }

    async openChange(): Promise<void> {
        await this.ensureInitialized();
        this.changeSetFileService.openDiff(
            this.readOnlyUri,
            this.changedUri
        );
    }

    async apply(contents?: string): Promise<void> {
        await this.ensureInitialized();
        if (!await this.confirm('Apply')) { return; }

        if (this.type === 'delete') {
            await this.changeSetFileService.delete(this.uri);
            this.state = 'applied';
            this.changeSetFileService.closeDiff(this.readOnlyUri);
            return;
        }

        // Load Monaco model for the base file URI and apply changes
        await this.applyChangesWithMonaco(contents);
        this.changeSetFileService.closeDiff(this.readOnlyUri);
    }

    async writeChanges(contents?: string): Promise<void> {
        await this.changeSetFileService.writeFrom(this.changedUri, this.uri, contents ?? this.targetState);
        this.state = 'applied';
    }

    /**
     * Applies changes using Monaco utilities, including loading the model for the base file URI,
     * setting the value to the intended state, and running code actions on save.
     */
    protected async applyChangesWithMonaco(contents?: string): Promise<void> {
        let modelReference: IReference<MonacoEditorModel> | undefined;

        try {
            modelReference = await this.monacoTextModelService.createModelReference(this.uri);
            const model = modelReference.object;
            const targetContent = contents ?? this.targetState;
            model.textEditorModel.setValue(targetContent);

            const languageId = model.languageId;
            const uriStr = this.uri.toString();

            await this.codeActionService.applyOnSaveCodeActions(model.textEditorModel, languageId, uriStr, CancellationToken.None);
            await this.applyFormatting(model, languageId, uriStr);

            await model.save();
            this.state = 'applied';

        } catch (error) {
            console.error('Failed to apply changes with Monaco:', error);
            await this.writeChanges(contents);
        } finally {
            modelReference?.dispose();
        }
    }

    protected applyCodeActionsToTargetState(): Promise<string> {
        if (!this.codeActionDeferred) {
            this.codeActionDeferred = new Deferred();
            this.codeActionDeferred.resolve(this.doApplyCodeActionsToTargetState());
        }
        return this.codeActionDeferred.promise;
    }

    protected async doApplyCodeActionsToTargetState(): Promise<string> {
        const targetState = this.originalTargetState;
        if (!targetState) {
            this._targetStateWithCodeActions = '';
            return this._targetStateWithCodeActions;
        }

        let tempResource: ConfigurableMutableReferenceResource | undefined;
        let tempModel: IReference<MonacoEditorModel> | undefined;
        try {
            // Create a temporary model to apply code actions
            const tempUri = new URI(`untitled://changeset/${Date.now()}${this.uri.path.ext}`);
            tempResource = this.inMemoryResources.add(tempUri, { contents: this.targetState });
            tempModel = await this.monacoTextModelService.createModelReference(tempUri);
            tempModel.object.suppressOpenEditorWhenDirty = true;
            tempModel.object.textEditorModel.setValue(this.targetState);

            const languageId = tempModel.object.languageId;
            const uriStr = this.uri.toString();

            await this.codeActionService.applyOnSaveCodeActions(tempModel.object.textEditorModel, languageId, uriStr, CancellationToken.None);

            // Apply formatting and other editor preferences
            await this.applyFormatting(tempModel.object, languageId, uriStr);

            this._targetStateWithCodeActions = tempModel.object.textEditorModel.getValue();
            if (this._changeResource?.contents === this.elementProps.targetState) {
                this._changeResource?.update({ contents: this.targetState });
            }
        } catch (error) {
            console.warn('Failed to apply code actions to target state:', error);
            this._targetStateWithCodeActions = targetState;
        } finally {
            tempModel?.dispose();
            tempResource?.dispose();
        }

        return this.targetState;
    }

    /**
     * Applies formatting preferences like format on save, trim trailing whitespace, and insert final newline.
     */
    protected async applyFormatting(model: MonacoEditorModel, languageId: string, uriStr: string): Promise<void> {
        try {
            const formatOnSave = this.editorPreferences.get({ preferenceName: 'editor.formatOnSave', overrideIdentifier: languageId }, undefined, uriStr);
            if (formatOnSave) {
                const instantiation = StandaloneServices.get(IInstantiationService);
                await instantiation.invokeFunction(
                    formatDocumentWithSelectedProvider,
                    model.textEditorModel,
                    FormattingMode.Explicit,
                    { report(): void { } },
                    CancellationToken.None, true
                );
            }

            const trimTrailingWhitespace = this.fileSystemPreferences.get({ preferenceName: 'files.trimTrailingWhitespace', overrideIdentifier: languageId }, undefined, uriStr);
            if (trimTrailingWhitespace) {
                const ttws = new TrimTrailingWhitespaceCommand(new Selection(1, 1, 1, 1), [], false);
                CommandExecutor.executeCommands(model.textEditorModel, [], [ttws]);
            }

            const shouldInsertFinalNewline = this.fileSystemPreferences.get({ preferenceName: 'files.insertFinalNewline', overrideIdentifier: languageId }, undefined, uriStr);
            if (shouldInsertFinalNewline) {
                insertFinalNewline(model);
            }
        } catch (error) {
            console.warn('Failed to apply formatting:', error);
        }
    }

    onShow(): void {
        this.changeResource.update({
            contents: this.targetState,
            onSave: async content => {
                // Use Monaco utilities when saving from the change resource
                await this.applyChangesWithMonaco(content);
            }
        });
    }

    async revert(): Promise<void> {
        await this.ensureInitialized();
        if (!await this.confirm('Revert')) { return; }
        this.state = 'pending';
        if (this.type === 'add') {
            await this.changeSetFileService.delete(this.uri);
        } else if (this._originalContent) {
            await this.changeSetFileService.write(this.uri, this._originalContent);
        }
    }

    async confirm(verb: string): Promise<boolean> {
        if (this._state !== 'stale') { return true; }
        await this.openChange();
        const answer = await new ConfirmDialog({
            title: `${verb} suggestion.`,
            msg: `The file ${this.uri.path.toString()} has changed since this suggestion was created. Are you certain you wish to ${verb.toLowerCase()} the change?`
        }).open(true);
        return !!answer;
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}
