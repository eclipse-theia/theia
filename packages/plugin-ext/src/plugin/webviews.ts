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

import { WebviewsExt, WebviewPanelViewState, WebviewsMain, PLUGIN_RPC_CONTEXT, /* WebviewsMain, PLUGIN_RPC_CONTEXT  */ } from '../api/plugin-api';
import * as theia from '@theia/plugin';
import { RPCProtocol } from '../api/rpc-protocol';
import URI from 'vscode-uri/lib/umd';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { fromViewColumn, toViewColumn, toWebviewPanelShowOptions } from './type-converters';
import { IdGenerator } from '../common/id-generator';
import { Disposable, WebviewPanelTargetArea } from './types-impl';

export class WebviewsExtImpl implements WebviewsExt {
    private readonly proxy: WebviewsMain;
    private readonly idGenerator = new IdGenerator('v');
    private readonly webviewPanels = new Map<string, WebviewPanelImpl>();
    private readonly serializers = new Map<string, theia.WebviewPanelSerializer>();

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.WEBVIEWS_MAIN);
    }

    // tslint:disable-next-line:no-any
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
        // tslint:disable-next-line:no-any
        state: any,
        position: number,
        options: theia.WebviewOptions & theia.WebviewPanelOptions): PromiseLike<void> {
        const serializer = this.serializers.get(viewType);
        if (!serializer) {
            return Promise.reject(new Error(`No serializer found for '${viewType}'`));
        }

        const webview = new WebviewImpl(viewId, this.proxy, options);
        const revivedPanel = new WebviewPanelImpl(viewId, this.proxy, viewType, title, toViewColumn(position)!, options, webview);
        this.webviewPanels.set(viewId, revivedPanel);
        return serializer.deserializeWebviewPanel(revivedPanel, state);
    }

    createWebview(viewType: string,
        title: string,
        showOptions: theia.ViewColumn | theia.WebviewPanelShowOptions,
        options: (theia.WebviewPanelOptions & theia.WebviewOptions) | undefined,
        extensionLocation: URI): theia.WebviewPanel {

        const webviewShowOptions = toWebviewPanelShowOptions(showOptions);
        const viewId = this.idGenerator.nextId();
        this.proxy.$createWebviewPanel(viewId, viewType, title, webviewShowOptions, options, extensionLocation);

        const webview = new WebviewImpl(viewId, this.proxy, options);
        const panel = new WebviewPanelImpl(viewId, this.proxy, viewType, title, webviewShowOptions, options, webview);
        this.webviewPanels.set(viewId, panel);
        return panel;

    }

    registerWebviewPanelSerializer(
        viewType: string,
        serializer: theia.WebviewPanelSerializer
    ): theia.Disposable {
        if (this.serializers.has(viewType)) {
            throw new Error(`Serializer for '${viewType}' already registered`);
        }

        this.serializers.set(viewType, serializer);
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

    // tslint:disable-next-line:no-any
    public readonly onMessageEmitter = new Emitter<any>();

    // tslint:disable-next-line:no-any
    public readonly onDidReceiveMessage: Event<any> = this.onMessageEmitter.event;

    constructor(private readonly viewId: string,
        private readonly proxy: WebviewsMain,
        options: theia.WebviewOptions | undefined) {
        this._options = options!;
    }

    dispose() {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;
        this.onMessageEmitter.dispose();
    }

    // tslint:disable-next-line:no-any
    postMessage(message: any): PromiseLike<boolean> {
        this.checkIsDisposed();
        return this.proxy.$postMessage(this.viewId, message);
    }

    get options(): theia.WebviewOptions {
        this.checkIsDisposed();
        return this._options;
    }

    set options(newOptions: theia.WebviewOptions) {
        this.checkIsDisposed();
        this.proxy.$setOptions(this.viewId, newOptions);
        this._options = newOptions;
    }

    get html(): string {
        this.checkIsDisposed();
        return this._html;
    }

    set html(html: string) {
        const newHtml = html.replace(new RegExp('theia-resource:/', 'g'), '/webview/');
        this.checkIsDisposed();
        if (this._html !== newHtml) {
            this._html = newHtml;
            this.proxy.$setHtml(this.viewId, newHtml);
        }
    }

    private checkIsDisposed() {
        if (this.isDisposed) {
            throw new Error('This Webview is disposed!');
        }
    }
}

export class WebviewPanelImpl implements theia.WebviewPanel {

    private isDisposed = false;
    private _active = true;
    private _visible = true;
    private _showOptions: theia.WebviewPanelShowOptions;

    readonly onDisposeEmitter = new Emitter<void>();
    public readonly onDidDispose: Event<void> = this.onDisposeEmitter.event;

    readonly onDidChangeViewStateEmitter = new Emitter<theia.WebviewPanelOnDidChangeViewStateEvent>();
    public readonly onDidChangeViewState: Event<theia.WebviewPanelOnDidChangeViewStateEvent> = this.onDidChangeViewStateEmitter.event;

    constructor(private readonly viewId: string,
        private readonly proxy: WebviewsMain,
        private readonly _viewType: string,
        private _title: string,
        showOptions: theia.ViewColumn | theia.WebviewPanelShowOptions,
        private readonly _options: theia.WebviewPanelOptions | undefined,
        private readonly _webview: WebviewImpl
    ) {
        this._showOptions = typeof showOptions === 'object' ? showOptions : { viewColumn: showOptions as theia.ViewColumn };
    }

    dispose() {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.onDisposeEmitter.fire(void 0);

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

    set iconPath(iconPath: theia.Uri | { light: theia.Uri; dark: theia.Uri }) {
        this.checkIsDisposed();
        if (URI.isUri(iconPath)) {
            this.proxy.$setIconPath(this.viewId, (<theia.Uri>iconPath).path);
        } else {
            this.proxy.$setIconPath(this.viewId, {
                light: (<{ light: theia.Uri; dark: theia.Uri }>iconPath).light.path,
                dark: (<{ light: theia.Uri; dark: theia.Uri }>iconPath).dark.path
            });
        }
    }

    get webview() {
        this.checkIsDisposed();
        return this._webview;
    }

    get options(): theia.WebviewPanelOptions {
        this.checkIsDisposed();
        return this._options!;
    }

    get viewColumn(): theia.ViewColumn | undefined {
        this.checkIsDisposed();
        return this._showOptions.viewColumn;
    }

    setViewColumn(value: theia.ViewColumn) {
        this.checkIsDisposed();
        this._showOptions.viewColumn = value;
    }

    get showOptions(): theia.WebviewPanelShowOptions {
        this.checkIsDisposed();
        return this._showOptions;
    }

    setShowOptions(value: theia.WebviewPanelShowOptions) {
        this.checkIsDisposed();
        this._showOptions = value;
    }

    get active(): boolean {
        this.checkIsDisposed();
        return this._active;
    }

    setActive(value: boolean) {
        this.checkIsDisposed();
        this._active = value;
    }

    get visible(): boolean {
        this.checkIsDisposed();
        return this._visible;
    }

    setVisible(value: boolean) {
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

    // tslint:disable-next-line:no-any
    postMessage(message: any): PromiseLike<boolean> {
        this.checkIsDisposed();
        return this.proxy.$postMessage(this.viewId, message);
    }

    private checkIsDisposed() {
        if (this.isDisposed) {
            throw new Error('This WebviewPanel is disposed!');
        }
    }
}
