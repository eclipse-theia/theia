// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc.
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

import { generateUuid, hashValue } from '@theia/core/lib/common/uuid';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Plugin, WebviewsExt, WebviewPanelViewState, WebviewsMain, PLUGIN_RPC_CONTEXT, WebviewInitData, /* WebviewsMain, PLUGIN_RPC_CONTEXT  */ } from '../common/plugin-api-rpc';
import * as theia from '@theia/plugin';
import { RPCProtocol } from '../common/rpc-protocol';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { fromViewColumn, toViewColumn, toWebviewPanelShowOptions } from './type-converters';
import { Disposable, WebviewPanelTargetArea, URI } from './types-impl';
import { WorkspaceExtImpl } from './workspace';
import { PluginIconPath } from './plugin-icon-path';
import { PluginModel, PluginPackage } from '../common';

@injectable()
export class WebviewsExtImpl implements WebviewsExt {
    @inject(RPCProtocol)
    protected readonly rpc: RPCProtocol;

    @inject(WorkspaceExtImpl)
    protected readonly workspace: WorkspaceExtImpl;

    private proxy: WebviewsMain;
    private readonly webviewPanels = new Map<string, WebviewPanelImpl>();
    private readonly webviews = new Map<string, WebviewImpl>();
    private readonly serializers = new Map<string, {
        serializer: theia.WebviewPanelSerializer,
        plugin: Plugin
    }>();
    private initData: WebviewInitData | undefined;

    readonly onDidDisposeEmitter = new Emitter<void>();
    readonly onDidDispose: Event<void> = this.onDidDisposeEmitter.event;

    @postConstruct()
    initialize(): void {
        this.proxy = this.rpc.getProxy(PLUGIN_RPC_CONTEXT.WEBVIEWS_MAIN);
    }

    init(initData: WebviewInitData): void {
        this.initData = initData;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $onMessage(handle: string, message: any): void {
        const panel = this.getWebviewPanel(handle);
        if (panel) {
            panel.webview.onMessageEmitter.fire(message);
        } else {
            const webview = this.getWebview(handle);
            if (webview) {
                webview.onMessageEmitter.fire(message);
            }
        }
    }
    $onDidChangeWebviewPanelViewState(handle: string, newState: WebviewPanelViewState): void {
        const panel = this.getWebviewPanel(handle);
        if (panel) {
            const viewColumn = toViewColumn(newState.position);
            if (panel.active !== newState.active || panel.visible !== newState.visible || panel.viewColumn !== viewColumn) {
                panel.setActive(newState.active);
                panel.setVisible(newState.visible);
                panel.setViewColumn(viewColumn!);
                panel.onDidChangeViewStateEmitter.fire({ webviewPanel: panel });
            }
        }
    }
    $onDidDisposeWebviewPanel(handle: string): PromiseLike<void> {
        const panel = this.getWebviewPanel(handle);
        if (panel) {
            panel.dispose();
            this.webviewPanels.delete(handle);
        }
        return Promise.resolve();
    }
    $deserializeWebviewPanel(viewId: string,
        viewType: string,
        title: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        state: any,
        viewState: WebviewPanelViewState,
        options: theia.WebviewOptions & theia.WebviewPanelOptions): PromiseLike<void> {
        if (!this.initData) {
            return Promise.reject(new Error('Webviews are not initialized'));
        }
        const entry = this.serializers.get(viewType);
        if (!entry) {
            return Promise.reject(new Error(`No serializer found for '${viewType}'`));
        }
        const { serializer, plugin } = entry;

        const webview = new WebviewImpl(viewId, this.proxy, options, this.initData, this.workspace, plugin, hashValue(viewType));
        const revivedPanel = new WebviewPanelImpl(viewId, this.proxy, viewType, title, toViewColumn(viewState.position)!, options, webview);
        revivedPanel.setActive(viewState.active);
        revivedPanel.setVisible(viewState.visible);
        this.webviewPanels.set(viewId, revivedPanel);
        return serializer.deserializeWebviewPanel(revivedPanel, state);
    }

    createWebview(
        viewType: string,
        title: string,
        showOptions: theia.ViewColumn | theia.WebviewPanelShowOptions,
        options: theia.WebviewPanelOptions & theia.WebviewOptions,
        plugin: Plugin
    ): theia.WebviewPanel {
        const viewId = generateUuid();
        const webviewShowOptions = toWebviewPanelShowOptions(showOptions);
        const webviewOptions = WebviewImpl.toWebviewOptions(options, this.workspace, plugin);
        this.proxy.$createWebviewPanel(viewId, viewType, title, webviewShowOptions, webviewOptions);
        const panel = this.createWebviewPanel(viewType, title, showOptions, options, plugin, viewId);
        return panel;
    }

    /**
     * Creates a new webview panel.
     *
     * @param viewType Identifies the type of the webview panel.
     * @param title Title of the panel.
     * @param showOptions Where webview panel will be reside.
     * @param options Settings for the new panel.
     * @param plugin The plugin contributing the webview.
     * @param viewId The identifier of the webview instance.
     * @param originBasedOnType true if a stable origin based on the viewType shall be used, false if the viewId should be used.
     * @returns The new webview panel.
     */
    createWebviewPanel(
        viewType: string,
        title: string,
        showOptions: theia.ViewColumn | theia.WebviewPanelShowOptions,
        options: theia.WebviewPanelOptions & theia.WebviewOptions,
        plugin: Plugin,
        viewId: string,
        originBasedOnType = true
    ): WebviewPanelImpl {
        if (!this.initData) {
            throw new Error('Webviews are not initialized');
        }
        const webviewShowOptions = toWebviewPanelShowOptions(showOptions);
        const origin = originBasedOnType ? hashValue(viewType) : undefined;
        const webview = new WebviewImpl(viewId, this.proxy, options, this.initData, this.workspace, plugin, origin);
        const panel = new WebviewPanelImpl(viewId, this.proxy, viewType, title, webviewShowOptions, options, webview);
        this.webviewPanels.set(viewId, panel);
        return panel;
    }

    createNewWebview(
        options: theia.WebviewPanelOptions & theia.WebviewOptions,
        plugin: Plugin,
        viewId: string,
        origin?: string
    ): WebviewImpl {
        if (!this.initData) {
            throw new Error('Webviews are not initialized');
        }
        const webview = new WebviewImpl(viewId, this.proxy, options, this.initData, this.workspace, plugin, origin);
        this.webviews.set(viewId, webview);
        return webview;
    }

    registerWebviewPanelSerializer(
        viewType: string,
        serializer: theia.WebviewPanelSerializer,
        plugin: Plugin
    ): theia.Disposable {
        if (this.serializers.has(viewType)) {
            throw new Error(`Serializer for '${viewType}' already registered`);
        }

        this.serializers.set(viewType, { serializer, plugin });
        this.proxy.$registerSerializer(viewType);

        return new Disposable(() => {
            this.serializers.delete(viewType);
            this.proxy.$unregisterSerializer(viewType);
        });
    }

    getWebviewPanel(viewId: string): WebviewPanelImpl | undefined {
        if (this.webviewPanels.has(viewId)) {
            return this.webviewPanels.get(viewId);
        }
        return undefined;
    }

    toGeneralWebviewResource(extension: PluginModel, resource: theia.Uri): theia.Uri {
        const extensionUri = URI.parse(extension.packageUri);
        const relativeResourcePath = resource.path.replace(extensionUri.path, '');
        const basePath = PluginPackage.toPluginUrl(extension, '') + relativeResourcePath;

        return URI.parse(this.initData!.webviewResourceRoot.replace('{{uuid}}', 'webviewUUID')).with({ path: basePath });
    }

    public deleteWebview(handle: string): void {
        this.webviews.delete(handle);
    }

    public getWebview(handle: string): WebviewImpl | undefined {
        return this.webviews.get(handle);
    }

    public getResourceRoot(): string | undefined {
        return this.initData?.webviewResourceRoot;
    }
}

export class WebviewImpl implements theia.Webview {
    private isDisposed = false;
    private _html: string;
    private _options: theia.WebviewOptions;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public readonly onMessageEmitter = new Emitter<any>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public readonly onDidReceiveMessage: Event<any> = this.onMessageEmitter.event;

    constructor(
        private readonly viewId: string,
        private readonly proxy: WebviewsMain,
        options: theia.WebviewOptions,
        private readonly initData: WebviewInitData,
        private readonly workspace: WorkspaceExtImpl,
        readonly plugin: Plugin,
        private readonly origin?: string
    ) {
        this._options = options;
    }

    dispose(): void {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;
        this.onMessageEmitter.dispose();
    }

    asWebviewUri(resource: theia.Uri): theia.Uri {
        const uri = this.initData.webviewResourceRoot
            .replace('{{scheme}}', resource.scheme)
            .replace('{{authority}}', resource.authority)
            .replace('{{path}}', resource.path.replace(/^\//, ''))
            .replace('{{uuid}}', this.origin ?? this.viewId);
        return URI.parse(uri).with({ query: resource.query });
    }

    get cspSource(): string {
        return this.initData.webviewCspSource.replace('{{uuid}}', this.origin ?? this.viewId);
    }

    get html(): string {
        this.checkIsDisposed();
        return this._html;
    }

    set html(value: string) {
        this.checkIsDisposed();
        if (this._html !== value) {
            this._html = value;
            this.proxy.$setHtml(this.viewId, this._html);
        }
    }

    get options(): theia.WebviewOptions {
        this.checkIsDisposed();
        return this._options;
    }

    set options(newOptions: theia.WebviewOptions) {
        this.checkIsDisposed();
        this.proxy.$setOptions(this.viewId, WebviewImpl.toWebviewOptions(newOptions, this.workspace, this.plugin));
        this._options = newOptions;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    postMessage(message: any): PromiseLike<boolean> {
        this.checkIsDisposed();
        return this.proxy.$postMessage(this.viewId, message);
    }

    private checkIsDisposed(): void {
        if (this.isDisposed) {
            throw new Error('This Webview is disposed!');
        }
    }

    static toWebviewOptions(options: theia.WebviewOptions, workspace: WorkspaceExtImpl, plugin: Plugin): theia.WebviewOptions {
        return {
            ...options,
            localResourceRoots: options.localResourceRoots || [
                ...(workspace.workspaceFolders || []).map(x => x.uri),
                URI.file(plugin.pluginFolder)
            ]
        };
    }
}

export class WebviewPanelImpl implements theia.WebviewPanel {

    private isDisposed = false;
    private _active = true;
    private _visible = true;
    private _showOptions: theia.WebviewPanelShowOptions;
    private _iconPath: theia.Uri | { light: theia.Uri; dark: theia.Uri } | undefined;

    readonly onDisposeEmitter = new Emitter<void>();
    public readonly onDidDispose: Event<void> = this.onDisposeEmitter.event;

    readonly onDidChangeViewStateEmitter = new Emitter<theia.WebviewPanelOnDidChangeViewStateEvent>();
    public readonly onDidChangeViewState: Event<theia.WebviewPanelOnDidChangeViewStateEvent> = this.onDidChangeViewStateEmitter.event;

    constructor(private readonly viewId: string,
        private readonly proxy: WebviewsMain,
        private readonly _viewType: string,
        private _title: string,
        showOptions: theia.ViewColumn | theia.WebviewPanelShowOptions,
        private readonly _options: theia.WebviewPanelOptions,
        private readonly _webview: WebviewImpl
    ) {
        this._showOptions = typeof showOptions === 'object' ? showOptions : { viewColumn: showOptions as theia.ViewColumn };
    }

    dispose(): void {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.onDisposeEmitter.fire(undefined);

        this.proxy.$disposeWebview(this.viewId);
        this._webview.dispose();

        this.onDisposeEmitter.dispose();
        this.onDidChangeViewStateEmitter.dispose();
    }

    get viewType(): string {
        this.checkIsDisposed();
        return this._viewType;
    }

    get title(): string {
        this.checkIsDisposed();
        return this._title;
    }

    set title(newTitle: string) {
        this.checkIsDisposed();
        if (this._title !== newTitle) {
            this._title = newTitle;
            this.proxy.$setTitle(this.viewId, newTitle);
        }
    }

    get iconPath(): theia.Uri | { light: theia.Uri; dark: theia.Uri } | undefined {
        return this._iconPath;
    }

    set iconPath(iconPath: theia.Uri | { light: theia.Uri; dark: theia.Uri } | undefined) {
        this.checkIsDisposed();
        if (this._iconPath !== iconPath) {
            this._iconPath = iconPath;
            this.proxy.$setIconPath(this.viewId, PluginIconPath.toUrl(iconPath, this._webview.plugin));
        }
    }

    get webview(): WebviewImpl {
        this.checkIsDisposed();
        return this._webview;
    }

    get options(): theia.WebviewPanelOptions {
        this.checkIsDisposed();
        return this._options;
    }

    get viewColumn(): theia.ViewColumn | undefined {
        this.checkIsDisposed();
        return this._showOptions.viewColumn;
    }

    setViewColumn(value: theia.ViewColumn | undefined): void {
        this.checkIsDisposed();
        this._showOptions.viewColumn = value;
    }

    get showOptions(): theia.WebviewPanelShowOptions {
        this.checkIsDisposed();
        return this._showOptions;
    }

    setShowOptions(value: theia.WebviewPanelShowOptions): void {
        this.checkIsDisposed();
        this._showOptions = value;
    }

    get active(): boolean {
        this.checkIsDisposed();
        return this._active;
    }

    setActive(value: boolean): void {
        this.checkIsDisposed();
        this._active = value;
    }

    get visible(): boolean {
        this.checkIsDisposed();
        return this._visible;
    }

    setVisible(value: boolean): void {
        this.checkIsDisposed();
        this._visible = value;
    }

    reveal(arg0?: theia.ViewColumn | WebviewPanelTargetArea, arg1?: theia.ViewColumn | boolean, arg2?: boolean): void {
        let area: WebviewPanelTargetArea | undefined = undefined;
        let viewColumn: theia.ViewColumn | undefined = undefined;
        let preserveFocus: boolean | undefined = undefined;
        if (typeof arg0 === 'number') {
            viewColumn = arg0;
        } else {
            area = arg0;
        }
        if (typeof arg1 === 'number') {
            viewColumn = arg1;
        } else {
            preserveFocus = arg1;
        }
        if (typeof arg2 === 'boolean') {
            preserveFocus = arg2;
        }
        this.checkIsDisposed();
        this.proxy.$reveal(this.viewId, {
            area,
            viewColumn: viewColumn ? fromViewColumn(viewColumn) : undefined,
            preserveFocus
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    postMessage(message: any): PromiseLike<boolean> {
        this.checkIsDisposed();
        return this.proxy.$postMessage(this.viewId, message);
    }

    private checkIsDisposed(): void {
        if (this.isDisposed) {
            throw new Error('This WebviewPanel is disposed!');
        }
    }
}
