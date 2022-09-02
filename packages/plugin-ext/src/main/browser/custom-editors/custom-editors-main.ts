// *****************************************************************************
// Copyright (C) 2021 SAP SE or an SAP affiliate company and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/53eac52308c4611000a171cc7bf1214293473c78/src/vs/workbench/api/browser/mainThreadCustomEditors.ts

import { interfaces } from '@theia/core/shared/inversify';
import { MAIN_RPC_CONTEXT, CustomEditorsMain, CustomEditorsExt, CustomTextEditorCapabilities } from '../../../common/plugin-api-rpc';
import { RPCProtocol } from '../../../common/rpc-protocol';
import { HostedPluginSupport } from '../../../hosted/browser/hosted-plugin';
import { PluginCustomEditorRegistry } from './plugin-custom-editor-registry';
import { CustomEditorWidget } from './custom-editor-widget';
import { Emitter } from '@theia/core';
import { UriComponents } from '../../../common/uri-components';
import { URI } from '@theia/core/shared/vscode-uri';
import TheiaURI from '@theia/core/lib/common/uri';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { Reference } from '@theia/core/lib/common/reference';
import { CancellationToken, CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { EditorModelService } from '../text-editor-model-service';
import { CustomEditorService } from './custom-editor-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { UndoRedoService } from './undo-redo-service';
import { WebviewsMainImpl } from '../webviews-main';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { ApplicationShell, DefaultUriLabelProviderContribution, Saveable, SaveOptions, WidgetOpenerOptions } from '@theia/core/lib/browser';
import { WebviewOptions, WebviewPanelOptions, WebviewPanelShowOptions } from '@theia/plugin';
import { WebviewWidgetIdentifier } from '../webview/webview';
import { EditorPreferences } from '@theia/editor/lib/browser';
import { ViewColumn, WebviewPanelTargetArea } from '../../../plugin/types-impl';

const enum CustomEditorModelType {
    Custom,
    Text,
}

export class CustomEditorsMainImpl implements CustomEditorsMain, Disposable {
    protected readonly pluginService: HostedPluginSupport;
    protected readonly shell: ApplicationShell;
    protected readonly textModelService: EditorModelService;
    protected readonly fileService: FileService;
    protected readonly customEditorService: CustomEditorService;
    protected readonly undoRedoService: UndoRedoService;
    protected readonly customEditorRegistry: PluginCustomEditorRegistry;
    protected readonly labelProvider: DefaultUriLabelProviderContribution;
    protected readonly widgetManager: WidgetManager;
    protected readonly editorPreferences: EditorPreferences;
    private readonly proxy: CustomEditorsExt;
    private readonly editorProviders = new Map<string, Disposable>();

    constructor(rpc: RPCProtocol,
        container: interfaces.Container,
        readonly webviewsMain: WebviewsMainImpl,
    ) {
        this.pluginService = container.get(HostedPluginSupport);
        this.shell = container.get(ApplicationShell);
        this.textModelService = container.get(EditorModelService);
        this.fileService = container.get(FileService);
        this.customEditorService = container.get(CustomEditorService);
        this.undoRedoService = container.get(UndoRedoService);
        this.customEditorRegistry = container.get(PluginCustomEditorRegistry);
        this.labelProvider = container.get(DefaultUriLabelProviderContribution);
        this.editorPreferences = container.get(EditorPreferences);
        this.widgetManager = container.get(WidgetManager);
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.CUSTOM_EDITORS_EXT);
    }

    dispose(): void {
        for (const disposable of this.editorProviders.values()) {
            disposable.dispose();
        }
        this.editorProviders.clear();
    }

    $registerTextEditorProvider(
        viewType: string, options: WebviewPanelOptions, capabilities: CustomTextEditorCapabilities): void {
        this.registerEditorProvider(CustomEditorModelType.Text, viewType, options, capabilities, true);
    }

    $registerCustomEditorProvider(viewType: string, options: WebviewPanelOptions, supportsMultipleEditorsPerDocument: boolean): void {
        this.registerEditorProvider(CustomEditorModelType.Custom, viewType, options, {}, supportsMultipleEditorsPerDocument);
    }

    protected async registerEditorProvider(
        modelType: CustomEditorModelType,
        viewType: string,
        options: WebviewPanelOptions,
        capabilities: CustomTextEditorCapabilities,
        supportsMultipleEditorsPerDocument: boolean,
    ): Promise<void> {
        if (this.editorProviders.has(viewType)) {
            throw new Error(`Provider for ${viewType} already registered`);
        }

        const disposables = new DisposableCollection();

        disposables.push(
            this.customEditorRegistry.registerResolver(viewType, async (widget, widgetOpenerOptions) => {
                const { resource, identifier } = widget;
                widget.options = options;

                const cancellationSource = new CancellationTokenSource();
                let modelRef = await this.getOrCreateCustomEditorModel(modelType, resource, viewType, cancellationSource.token);
                widget.modelRef = modelRef;

                widget.onDidDispose(() => {
                    // If the model is still dirty, make sure we have time to save it
                    if (modelRef.object.dirty) {
                        const sub = modelRef.object.onDirtyChanged(() => {
                            if (!modelRef.object.dirty) {
                                sub.dispose();
                                modelRef.dispose();
                            }
                        });
                        return;
                    }

                    modelRef.dispose();
                });

                if (capabilities.supportsMove) {
                    const onMoveCancelTokenSource = new CancellationTokenSource();
                    widget.onMove(async (newResource: TheiaURI) => {
                        const oldModel = modelRef;
                        modelRef = await this.getOrCreateCustomEditorModel(modelType, newResource, viewType, onMoveCancelTokenSource.token);
                        this.proxy.$onMoveCustomEditor(identifier.id, URI.file(newResource.path.toString()), viewType);
                        oldModel.dispose();
                    });
                }

                const _cancellationSource = new CancellationTokenSource();
                await this.proxy.$resolveWebviewEditor(
                    URI.file(resource.path.toString()),
                    identifier.id,
                    viewType,
                    this.labelProvider.getName(resource)!,
                    widgetOpenerOptions,
                    options,
                    _cancellationSource.token
                );
            })
        );

        this.editorProviders.set(viewType, disposables);
    }

    $unregisterEditorProvider(viewType: string): void {
        const provider = this.editorProviders.get(viewType);
        if (!provider) {
            throw new Error(`No provider for ${viewType} registered`);
        }

        provider.dispose();
        this.editorProviders.delete(viewType);

        this.customEditorService.models.disposeAllModelsForView(viewType);
    }

    protected async getOrCreateCustomEditorModel(
        modelType: CustomEditorModelType,
        resource: TheiaURI,
        viewType: string,
        cancellationToken: CancellationToken,
    ): Promise<Reference<CustomEditorModel>> {
        const existingModel = this.customEditorService.models.tryRetain(resource, viewType);
        if (existingModel) {
            return existingModel;
        }

        switch (modelType) {
            case CustomEditorModelType.Text: {
                const model = CustomTextEditorModel.create(viewType, resource, this.textModelService, this.fileService);
                return this.customEditorService.models.add(resource, viewType, model);
            }
            case CustomEditorModelType.Custom: {
                const model = MainCustomEditorModel.create(this.proxy, viewType, resource, this.undoRedoService, this.fileService, this.editorPreferences, cancellationToken);
                return this.customEditorService.models.add(resource, viewType, model);
            }
        }
    }

    protected async getCustomEditorModel(resourceComponents: UriComponents, viewType: string): Promise<MainCustomEditorModel> {
        const resource = URI.revive(resourceComponents);
        const model = await this.customEditorService.models.get(new TheiaURI(resource), viewType);
        if (!model || !(model instanceof MainCustomEditorModel)) {
            throw new Error('Could not find model for custom editor');
        }
        return model;
    }

    async $onDidEdit(resourceComponents: UriComponents, viewType: string, editId: number, label: string | undefined): Promise<void> {
        const model = await this.getCustomEditorModel(resourceComponents, viewType);
        model.pushEdit(editId, label);
    }

    async $onContentChange(resourceComponents: UriComponents, viewType: string): Promise<void> {
        const model = await this.getCustomEditorModel(resourceComponents, viewType);
        model.changeContent();
    }

    async $createCustomEditorPanel(
        panelId: string,
        title: string,
        widgetOpenerOptions: WidgetOpenerOptions | undefined,
        options: WebviewPanelOptions & WebviewOptions
    ): Promise<void> {
        const view = await this.widgetManager.getOrCreateWidget<CustomEditorWidget>(CustomEditorWidget.FACTORY_ID, <WebviewWidgetIdentifier>{ id: panelId });
        this.webviewsMain.hookWebview(view);
        view.title.label = title;
        const { enableFindWidget, retainContextWhenHidden, enableScripts, localResourceRoots, ...contentOptions } = options;
        view.viewColumn = ViewColumn.One; // behaviour might be overridden later using widgetOpenerOptions (if available)
        view.options = { enableFindWidget, retainContextWhenHidden };
        view.setContentOptions({
            allowScripts: enableScripts,
            localResourceRoots: localResourceRoots && localResourceRoots.map(root => root.toString()),
            ...contentOptions,
            ...view.contentOptions
        });
        if (view.isAttached) {
            if (view.isVisible) {
                this.shell.revealWidget(view.id);
            }
            return;
        }
        const showOptions: WebviewPanelShowOptions = {
            preserveFocus: true
        };

        if (widgetOpenerOptions) {
            if (widgetOpenerOptions.mode === 'reveal') {
                showOptions.preserveFocus = false;
            }

            if (widgetOpenerOptions.widgetOptions) {
                let area: WebviewPanelTargetArea;
                switch (widgetOpenerOptions.widgetOptions.area) {
                    case 'main':
                        area = WebviewPanelTargetArea.Main;
                    case 'left':
                        area = WebviewPanelTargetArea.Left;
                    case 'right':
                        area = WebviewPanelTargetArea.Right;
                    case 'bottom':
                        area = WebviewPanelTargetArea.Bottom;
                    default: // includes 'top' and 'secondaryWindow'
                        area = WebviewPanelTargetArea.Main;
                }
                showOptions.area = area;

                if (widgetOpenerOptions.widgetOptions.mode === 'split-right' ||
                    widgetOpenerOptions.widgetOptions.mode === 'open-to-right') {
                    showOptions.viewColumn = ViewColumn.Beside;
                }
            }
        }

        this.webviewsMain.addOrReattachWidget(view, showOptions);
    }
}

export interface CustomEditorModel extends Saveable, Disposable {
    readonly viewType: string;
    readonly resource: URI;
    readonly readonly: boolean;
    readonly dirty: boolean;

    revert(options?: Saveable.RevertOptions): Promise<void>;
    saveCustomEditor(options?: SaveOptions): Promise<void>;
    saveCustomEditorAs(resource: TheiaURI, targetResource: TheiaURI, options?: SaveOptions): Promise<void>;
}

export class MainCustomEditorModel implements CustomEditorModel {
    private currentEditIndex: number = -1;
    private savePoint: number = -1;
    private isDirtyFromContentChange = false;
    private ongoingSave?: CancellationTokenSource;
    private readonly edits: Array<number> = [];
    private readonly toDispose = new DisposableCollection();

    private readonly onDirtyChangedEmitter = new Emitter<void>();
    readonly onDirtyChanged = this.onDirtyChangedEmitter.event;

    autoSave: 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange';
    autoSaveDelay: number;

    static async create(
        proxy: CustomEditorsExt,
        viewType: string,
        resource: TheiaURI,
        undoRedoService: UndoRedoService,
        fileService: FileService,
        editorPreferences: EditorPreferences,
        cancellation: CancellationToken,
    ): Promise<MainCustomEditorModel> {
        const { editable } = await proxy.$createCustomDocument(URI.file(resource.path.toString()), viewType, {}, cancellation);
        return new MainCustomEditorModel(proxy, viewType, resource, editable, undoRedoService, fileService, editorPreferences);
    }

    constructor(
        private proxy: CustomEditorsExt,
        readonly viewType: string,
        private readonly editorResource: TheiaURI,
        private readonly editable: boolean,
        private readonly undoRedoService: UndoRedoService,
        private readonly fileService: FileService,
        private readonly editorPreferences: EditorPreferences
    ) {
        this.autoSave = this.editorPreferences.get('files.autoSave', undefined, editorResource.toString());
        this.autoSaveDelay = this.editorPreferences.get('files.autoSaveDelay', undefined, editorResource.toString());

        this.toDispose.push(
            this.editorPreferences.onPreferenceChanged(event => {
                if (event.preferenceName === 'files.autoSave') {
                    this.autoSave = this.editorPreferences.get('files.autoSave', undefined, editorResource.toString());
                }
                if (event.preferenceName === 'files.autoSaveDelay') {
                    this.autoSaveDelay = this.editorPreferences.get('files.autoSaveDelay', undefined, editorResource.toString());
                }
            })
        );
        this.toDispose.push(this.onDirtyChangedEmitter);
    }

    get resource(): URI {
        return URI.file(this.editorResource.path.toString());
    }

    get dirty(): boolean {
        if (this.isDirtyFromContentChange) {
            return true;
        }
        if (this.edits.length > 0) {
            return this.savePoint !== this.currentEditIndex;
        }
        return false;
    }

    get readonly(): boolean {
        return !this.editable;
    }

    setProxy(proxy: CustomEditorsExt): void {
        this.proxy = proxy;
    }

    dispose(): void {
        if (this.editable) {
            this.undoRedoService.removeElements(this.editorResource);
        }
        this.proxy.$disposeCustomDocument(this.resource, this.viewType);
    }

    changeContent(): void {
        this.change(() => {
            this.isDirtyFromContentChange = true;
        });
    }

    pushEdit(editId: number, label: string | undefined): void {
        if (!this.editable) {
            throw new Error('Document is not editable');
        }

        this.change(() => {
            this.spliceEdits(editId);
            this.currentEditIndex = this.edits.length - 1;
        });

        this.undoRedoService.pushElement(
            this.editorResource,
            () => this.undo(),
            () => this.redo(),
        );
    }

    async revert(options?: Saveable.RevertOptions): Promise<void> {
        if (!this.editable) {
            return;
        }

        if (this.currentEditIndex === this.savePoint && !this.isDirtyFromContentChange) {
            return;
        }

        const cancellationSource = new CancellationTokenSource();
        this.proxy.$revert(this.resource, this.viewType, cancellationSource.token);
        this.change(() => {
            this.isDirtyFromContentChange = false;
            this.currentEditIndex = this.savePoint;
            this.spliceEdits();
        });
    }

    async save(options?: SaveOptions): Promise<void> {
        await this.saveCustomEditor(options);
    }

    async saveCustomEditor(options?: SaveOptions): Promise<void> {
        if (!this.editable) {
            return;
        }

        const cancelable = new CancellationTokenSource();
        const savePromise = this.proxy.$onSave(this.resource, this.viewType, cancelable.token);
        this.ongoingSave?.cancel();
        this.ongoingSave = cancelable;

        try {
            await savePromise;

            if (this.ongoingSave === cancelable) { // Make sure we are still doing the same save
                this.change(() => {
                    this.isDirtyFromContentChange = false;
                    this.savePoint = this.currentEditIndex;
                });
            }
        } finally {
            if (this.ongoingSave === cancelable) { // Make sure we are still doing the same save
                this.ongoingSave = undefined;
            }
        }
    }

    async saveCustomEditorAs(resource: TheiaURI, targetResource: TheiaURI, options?: SaveOptions): Promise<void> {
        if (this.editable) {
            const source = new CancellationTokenSource();
            await this.proxy.$onSaveAs(this.resource, this.viewType, URI.file(targetResource.path.toString()), source.token);
            this.change(() => {
                this.savePoint = this.currentEditIndex;
            });
        } else {
            // Since the editor is readonly, just copy the file over
            await this.fileService.copy(resource, targetResource, { overwrite: false });
        }
    }

    private async undo(): Promise<void> {
        if (!this.editable) {
            return;
        }

        if (this.currentEditIndex < 0) {
            // nothing to undo
            return;
        }

        const undoneEdit = this.edits[this.currentEditIndex];
        this.change(() => {
            --this.currentEditIndex;
        });
        await this.proxy.$undo(this.resource, this.viewType, undoneEdit, this.dirty);
    }

    private async redo(): Promise<void> {
        if (!this.editable) {
            return;
        }

        if (this.currentEditIndex >= this.edits.length - 1) {
            // nothing to redo
            return;
        }

        const redoneEdit = this.edits[this.currentEditIndex + 1];
        this.change(() => {
            ++this.currentEditIndex;
        });
        await this.proxy.$redo(this.resource, this.viewType, redoneEdit, this.dirty);
    }

    private spliceEdits(editToInsert?: number): void {
        const start = this.currentEditIndex + 1;
        const toRemove = this.edits.length - this.currentEditIndex;

        const removedEdits = typeof editToInsert === 'number'
            ? this.edits.splice(start, toRemove, editToInsert)
            : this.edits.splice(start, toRemove);

        if (removedEdits.length) {
            this.proxy.$disposeEdits(this.resource, this.viewType, removedEdits);
        }
    }

    private change(makeEdit: () => void): void {
        const wasDirty = this.dirty;
        makeEdit();

        if (this.dirty !== wasDirty) {
            this.onDirtyChangedEmitter.fire();
        }

        if (this.autoSave !== 'off') {
            const handle = window.setTimeout(() => {
                this.save();
                window.clearTimeout(handle);
            }, this.autoSaveDelay);
        }
    }

}

// copied from https://github.com/microsoft/vscode/blob/53eac52308c4611000a171cc7bf1214293473c78/src/vs/workbench/contrib/customEditor/common/customTextEditorModel.ts
export class CustomTextEditorModel implements CustomEditorModel {
    private readonly toDispose = new DisposableCollection();
    private readonly onDirtyChangedEmitter = new Emitter<void>();
    readonly onDirtyChanged = this.onDirtyChangedEmitter.event;
    readonly autoSave: 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange';

    static async create(
        viewType: string,
        resource: TheiaURI,
        editorModelService: EditorModelService,
        fileService: FileService
    ): Promise<CustomTextEditorModel> {
        const model = await editorModelService.createModelReference(resource);
        model.object.suppressOpenEditorWhenDirty = true;
        return new CustomTextEditorModel(viewType, resource, model, fileService);
    }

    constructor(
        readonly viewType: string,
        readonly editorResource: TheiaURI,
        private readonly model: Reference<MonacoEditorModel>,
        private readonly fileService: FileService
    ) {
        this.toDispose.push(
            this.editorTextModel.onDirtyChanged(e => {
                this.onDirtyChangedEmitter.fire();
            })
        );
        this.toDispose.push(this.onDirtyChangedEmitter);
    }

    dispose(): void {
        this.toDispose.dispose();
        this.model.dispose();
    }

    get resource(): URI {
        return URI.file(this.editorResource.path.toString());
    }

    get dirty(): boolean {
        return this.editorTextModel.dirty;
    };

    get readonly(): boolean {
        return this.editorTextModel.readOnly;
    }

    get editorTextModel(): MonacoEditorModel {
        return this.model.object;
    }

    revert(options?: Saveable.RevertOptions): Promise<void> {
        return this.editorTextModel.revert(options);
    }

    save(options?: SaveOptions): Promise<void> {
        return this.saveCustomEditor(options);
    }

    saveCustomEditor(options?: SaveOptions): Promise<void> {
        return this.editorTextModel.save(options);
    }

    async saveCustomEditorAs(resource: TheiaURI, targetResource: TheiaURI, options?: SaveOptions): Promise<void> {
        await this.saveCustomEditor(options);
        await this.fileService.copy(resource, targetResource, { overwrite: false });
    }
}
