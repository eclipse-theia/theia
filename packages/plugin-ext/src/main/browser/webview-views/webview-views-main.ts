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
// some code copied and modified from https://github.com/microsoft/vscode/blob/e1f0f8f51390dea5df9096718fb6b647ed5a9534/src/vs/workbench/api/browser/mainThreadWebviewViews.ts

import { inject, interfaces } from '@theia/core/shared/inversify';
import { WebviewViewsMain, MAIN_RPC_CONTEXT, WebviewViewsExt } from '../../../common/plugin-api-rpc';
import { RPCProtocol } from '../../../common/rpc-protocol';
import { Disposable, DisposableCollection, ILogger } from '@theia/core';
import { WebviewView } from './webview-views';
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import { WebviewsMainImpl } from '../webviews-main';
import { Widget, WidgetManager } from '@theia/core/lib/browser';
import { PluginViewRegistry } from '../view/plugin-view-registry';
import { ViewBadge } from '@theia/plugin';

export class WebviewViewsMainImpl implements WebviewViewsMain, Disposable {

    protected readonly proxy: WebviewViewsExt;
    protected readonly toDispose = new DisposableCollection(
        Disposable.create(() => { /* mark as not disposed */ })
    );

    protected readonly webviewViews = new Map<string, WebviewView>();
    protected readonly webviewViewProviders = new Map<string, Disposable>();
    protected readonly widgetManager: WidgetManager;
    protected readonly pluginViewRegistry: PluginViewRegistry;

    @inject(ILogger)
    protected readonly logger: ILogger;

    constructor(rpc: RPCProtocol,
        container: interfaces.Container,
        readonly webviewsMain: WebviewsMainImpl
    ) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.WEBVIEW_VIEWS_EXT);
        this.widgetManager = container.get(WidgetManager);
        this.pluginViewRegistry = container.get(PluginViewRegistry);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    async $registerWebviewViewProvider(viewType: string, options: { retainContextWhenHidden?: boolean, serializeBuffersForPostMessage: boolean }): Promise<void> {

        if (this.webviewViewProviders.has(viewType)) {
            throw new Error(`View provider for ${viewType} already registered`);
        }

        const registration = await this.pluginViewRegistry.registerWebviewView(viewType, {
            resolve: async (webviewView: WebviewView, cancellation: CancellationToken) => {
                const handle = webviewView.webview.identifier.id;
                this.webviewViews.set(handle, webviewView);
                this.webviewsMain.hookWebview(webviewView.webview);

                let state: string | undefined;
                if (webviewView.webview.state) {
                    try {
                        state = JSON.parse(webviewView.webview.state);
                        console.log(state);
                    } catch (e) {
                        console.error('Could not load webview state', e, webviewView.webview.state);
                    }
                }
                if (options) {
                    webviewView.webview.options = options;
                }

                webviewView.onDidChangeVisibility(async visible => {
                    if (visible) {
                        await webviewView.resolve();
                    }
                    this.proxy.$onDidChangeWebviewViewVisibility(handle, visible);
                });

                webviewView.onDidDispose(() => {
                    this.proxy.$disposeWebviewView(handle);
                    this.webviewViews.delete(handle);
                });

                try {
                    await this.proxy.$resolveWebviewView(handle, viewType, webviewView.title, state, cancellation);
                } catch (error) {
                    this.logger.error(`Error resolving webview view '${viewType}': ${error}`);
                    webviewView.webview.setHTML('failed to load plugin webview view');
                }
            }
        });

        this.webviewViewProviders.set(viewType, registration);
    }

    protected getWebview(handle: string): Widget | undefined {
        return this.widgetManager.tryGetWidget(handle);
    }

    $unregisterWebviewViewProvider(viewType: string): void {
        const provider = this.webviewViewProviders.get(viewType);
        if (!provider) {
            throw new Error(`No view provider for ${viewType} registered`);
        }
        provider.dispose();
        this.webviewViewProviders.delete(viewType);
    }

    $setWebviewViewTitle(handle: string, value: string | undefined): void {
        const webviewView = this.getWebviewView(handle);
        webviewView.title = value;
    }

    $setWebviewViewDescription(handle: string, value: string | undefined): void {
        const webviewView = this.getWebviewView(handle);
        webviewView.description = value;
    }

    async $setBadge(handle: string, badge: ViewBadge | undefined): Promise<void> {
        const webviewView = this.getWebviewView(handle);
        if (webviewView) {
            webviewView.badge = badge?.value;
            webviewView.badgeTooltip = badge?.tooltip;
        }
    }

    $show(handle: string, preserveFocus: boolean): void {
        const webviewView = this.getWebviewView(handle);
        webviewView.show(preserveFocus);
    }

    protected getWebviewView(handle: string): WebviewView {
        const webviewView = this.webviewViews.get(handle);
        if (!webviewView) {
            throw new Error(`No webview view registered for handle '${handle}'`);
        }
        return webviewView;
    }

}
