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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
// some of the code is copied and modified from https://github.com/microsoft/vscode/blob/e1f0f8f51390dea5df9096718fb6b647ed5a9534/src/vs/workbench/api/common/extHostWebviewView.ts

import { Disposable } from './types-impl';
import { RPCProtocol } from '../common/rpc-protocol';
import { PLUGIN_RPC_CONTEXT, WebviewViewsMain, WebviewViewsExt, Plugin } from '../common/plugin-api-rpc';
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import { WebviewImpl, WebviewsExtImpl } from './webviews';
import { WebviewViewProvider } from '@theia/plugin';
import { Emitter, Event } from '@theia/core/lib/common/event';
import * as theia from '@theia/plugin';
import { hashValue } from '@theia/core/lib/common/uuid';

export class WebviewViewsExtImpl implements WebviewViewsExt {

    private readonly proxy: WebviewViewsMain;

    protected readonly viewProviders = new Map<string, {
        readonly provider: WebviewViewProvider;
        readonly plugin: Plugin;
    }>();
    protected readonly webviewViews = new Map<string, WebviewViewExtImpl>();

    constructor(rpc: RPCProtocol,
        private readonly webviewsExt: WebviewsExtImpl) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.WEBVIEW_VIEWS_MAIN);
    }

    registerWebviewViewProvider(
        viewType: string,
        provider: WebviewViewProvider,
        plugin: Plugin,
        webviewOptions?: {
            retainContextWhenHidden?: boolean
        }
    ): Disposable {
        if (this.viewProviders.has(viewType)) {
            throw new Error(`View provider for '${viewType}' already registered`);
        }

        this.viewProviders.set(viewType, { provider: provider, plugin: plugin });

        this.proxy.$registerWebviewViewProvider(viewType, {
            retainContextWhenHidden: webviewOptions?.retainContextWhenHidden,
            serializeBuffersForPostMessage: false,
        });

        return new Disposable(() => {
            this.viewProviders.delete(viewType);
            this.proxy.$unregisterWebviewViewProvider(viewType);
        });
    }

    async $resolveWebviewView(handle: string,
        viewType: string,
        title: string | undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        state: any,
        cancellation: CancellationToken
    ): Promise<void> {
        const entry = this.viewProviders.get(viewType);
        if (!entry) {
            throw new Error(`No view provider found for '${viewType}'`);
        }

        const { provider, plugin } = entry;

        const webviewNoPanel = this.webviewsExt.createNewWebview({}, plugin, handle, hashValue(viewType));
        const revivedView = new WebviewViewExtImpl(handle, this.proxy, viewType, title, webviewNoPanel, true);
        this.webviewViews.set(handle, revivedView);
        await provider.resolveWebviewView(revivedView, { state }, cancellation);
    }

    async $onDidChangeWebviewViewVisibility(
        handle: string,
        visible: boolean
    ): Promise<void> {
        const webviewView = this.getWebviewView(handle);
        webviewView.setVisible(visible);
        webviewView.onDidChangeVisibilityEmitter.fire();
    }

    async $disposeWebviewView(handle: string): Promise<void> {
        const webviewView = this.getWebviewView(handle);
        this.webviewViews.delete(handle);
        webviewView.dispose();

        this.webviewsExt.deleteWebview(handle);
    }

    protected getWebviewView(handle: string): WebviewViewExtImpl {
        const entry = this.webviewViews.get(handle);
        if (!entry) {
            throw new Error('No webview found');
        }

        return entry;
    }
}

export class WebviewViewExtImpl implements theia.WebviewView {

    readonly onDidChangeVisibilityEmitter = new Emitter<void>();
    readonly onDidChangeVisibility = this.onDidChangeVisibilityEmitter.event;

    readonly onDidDisposeEmitter = new Emitter<void>();
    readonly onDidDispose = this.onDidDisposeEmitter.event;

    readonly handle: string;
    readonly proxy: WebviewViewsMain;

    readonly _viewType: string;
    readonly _webview: WebviewImpl;

    _isDisposed = false;
    _isVisible: boolean;
    _title: string | undefined;
    _description: string | undefined;
    _badge: theia.ViewBadge | undefined;

    constructor(
        handle: string,
        proxy: WebviewViewsMain,
        viewType: string,
        title: string | undefined,
        webview: WebviewImpl,
        isVisible: boolean
    ) {
        this._viewType = viewType;
        this._title = title;
        this.handle = handle;
        this.proxy = proxy;
        this._webview = webview;
        this._isVisible = isVisible;
    }
    onDispose: Event<void>;

    dispose(): void {
        if (this._isDisposed) {
            return;
        }

        this._isDisposed = true;
        this.onDidDisposeEmitter.fire();
    }

    get title(): string | undefined {
        this.assertNotDisposed();
        return this._title;
    }

    set title(value: string | undefined) {
        this.assertNotDisposed();
        if (this._title !== value) {
            this._title = value;
            this.proxy.$setWebviewViewTitle(this.handle, value);
        }
    }

    get description(): string | undefined {
        this.assertNotDisposed();
        return this._description;
    }

    set description(value: string | undefined) {
        this.assertNotDisposed();
        if (this._description !== value) {
            this._description = value;
            this.proxy.$setWebviewViewDescription(this.handle, value);
        }
    }

    get badge(): theia.ViewBadge | undefined {
        this.assertNotDisposed();
        return this._badge;
    }

    set badge(badge: theia.ViewBadge | undefined) {
        this.assertNotDisposed();
        if (this._badge !== badge) {
            this._badge = badge;
            this.proxy.$setBadge(this.handle, badge ? { value: badge.value, tooltip: badge.tooltip } : undefined);
        }
    }

    get visible(): boolean { return this._isVisible; }
    get webview(): WebviewImpl { return this._webview; }
    get viewType(): string { return this._viewType; }

    setVisible(visible: boolean): void {
        if (visible === this._isVisible || this._isDisposed) {
            return;
        }

        this._isVisible = visible;
        this.onDidChangeVisibilityEmitter.fire();
    }

    show(preserveFocus?: boolean): void {
        this.assertNotDisposed();
        this.proxy.$show(this.handle, !!preserveFocus);
    }

    protected assertNotDisposed(): void {
        if (this._isDisposed) {
            throw new Error('Webview is disposed');
        }
    }
}

