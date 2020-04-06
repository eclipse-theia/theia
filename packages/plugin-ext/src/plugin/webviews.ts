/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc.
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

import { v4 } from 'uuid';
import { WebviewsExt, WebviewPanelViewState, WebviewsMain, PLUGIN_RPC_CONTEXT, WebviewInitData, /* WebviewsMain, PLUGIN_RPC_CONTEXT  */ } from '../common/plugin-api-rpc';
import * as theia from '@theia/plugin';
import { RPCProtocol } from '../common/rpc-protocol';
import { Plugin } from '../common/plugin-api-rpc';
import { URI } from 'vscode-uri';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { fromViewColumn, toViewColumn, toWebviewPanelShowOptions } from './type-converters';
import { Disposable, WebviewPanelTargetArea } from './types-impl';
import { WorkspaceExtImpl } from './workspace';
import { PluginIconPath } from './plugin-icon-path';

export class WebviewsExtImpl implements WebviewsExt {
    private readonly proxy: WebviewsMain;
    private readonly webviewPanels = new Map<string, WebviewPanelImpl>();
    private readonly serializers = new Map<string, {
        serializer: theia.WebviewPanelSerializer,
        plugin: Plugin
    }>();
    private initData: WebviewInitData | undefined;

    constructor(
        rpc: RPCProtocol,
        private readonly workspace: WorkspaceExtImpl,
    ) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.WEBVIEWS_MAIN);
    }

    init(initData: WebviewInitData): void {
        this.initData = initData;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $onMessage(handle: string, message: any): void {
        const panel = this.getWebviewPanel(handle);
        if (panel) {
            panel.webview.onMessageEmitter.fire(message);
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

        const webview = new WebviewImpl(viewId, this.proxy, options, this.initData, this.workspace, plugin);
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
        if (!this.initData) {
            throw new Error('Webviews are not initialized');
        }
        const webviewShowOptions = toWebviewPanelShowOptions(showOptions);
        const viewId = v4();
        this.proxy.$createWebviewPanel(viewId, viewType, title, webviewShowOptions, WebviewImpl.toWebviewOptions(options, this.workspace, plugin));

        const webview = new WebviewImpl(viewId, this.proxy, options, this.initData, this.workspace, plugin);
        const panel = new WebviewPanelImpl(viewId, this.proxy, viewType, title, webviewShowOptions, options, webview);
        this.webviewPanels.set(viewId, panel);
        return panel;
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

    private getWebviewPanel(viewId: string): WebviewPanelImpl | undefined {
        if (this.webviewPanels.has(viewId)) {
            return this.webviewPanels.get(viewId);
        }
        return undefined;
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
        readonly plugin: Plugin
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
            // Make sure we preserve the scheme of the resource but convert it into a normal path segment
            // The scheme is important as we need to know if we are requesting a local or a remote resource.
            .replace('{{resource}}', resource.scheme + resource.toString().replace(/^\S+?:/, ''))
            .replace('{{uuid}}', this.viewId);
        return URI.parse(uri);
    }

    get cspSource(): string {
        return this.initData.webviewCspSource.replace('{{uuid}}', this.viewId);
    }

    get html(): string {
        this.checkIsDisposed();
        return this._html;
    }

    set html(value: string) {
        this.checkIsDisposed();
        if (this._html !== value) {
            this._html = value;
            this.proxy.$setHtml(this.viewId, value);
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
