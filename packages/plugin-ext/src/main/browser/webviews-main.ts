/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { WebviewsMain, WebviewPanelShowOptions, MAIN_RPC_CONTEXT, WebviewsExt } from '../../api/plugin-api';
import { interfaces } from 'inversify';
import { RPCProtocol } from '../../api/rpc-protocol';
import { UriComponents } from '../../common/uri-components';
import { WebviewOptions, WebviewPanelOptions } from '@theia/plugin';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { WebviewWidget } from './webview/webview';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { ThemeRulesService } from './webview/theme-rules-service';
import { DisposableCollection } from '@theia/core';

export class WebviewsMainImpl implements WebviewsMain {
    private readonly proxy: WebviewsExt;
    protected readonly shell: ApplicationShell;
    protected readonly keybindingRegistry: KeybindingRegistry;
    protected readonly themeService = ThemeService.get();
    protected readonly themeRulesService = ThemeRulesService.get();

    private readonly views = new Map<string, WebviewWidget>();

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.WEBVIEWS_EXT);
        this.shell = container.get(ApplicationShell);
        this.keybindingRegistry = container.get(KeybindingRegistry);
    }

    $createWebviewPanel(
        viewId: string,
        viewType: string,
        title: string,
        showOptions: WebviewPanelShowOptions,
        options: (WebviewPanelOptions & WebviewOptions) | undefined,
        extensionLocation: UriComponents
    ): void {
        const toDispose = new DisposableCollection();
        const view = new WebviewWidget(title, {
            allowScripts: options ? options.enableScripts : false
        }, {
            onMessage: m => {
                this.proxy.$onMessage(viewId, m);
            },
            onKeyboardEvent: e => {
                this.keybindingRegistry.run(e);
            },
            onLoad: contentDocument => {
                const styleId = 'webview-widget-theme';
                let styleElement: HTMLStyleElement | null | undefined;
                if (!toDispose.disposed) {
                    // if reload the frame
                    toDispose.dispose();
                    styleElement = <HTMLStyleElement>contentDocument.getElementById(styleId);
                }
                if (!styleElement) {
                    const parent = contentDocument.head ? contentDocument.head : contentDocument.body;
                    styleElement = this.themeRulesService.createStyleSheet(parent);
                    styleElement.id = styleId;
                    parent.appendChild((styleElement));
                }

                this.themeRulesService.setRules(styleElement, this.themeRulesService.getCurrentThemeRules());
                toDispose.push(this.themeService.onThemeChange(() => {
                    this.themeRulesService.setRules(<HTMLElement>styleElement, this.themeRulesService.getCurrentThemeRules());
                }));
            }
        });
        view.disposed.connect(() => {
            toDispose.dispose();
            this.onCloseView(viewId);
        });
        this.views.set(viewId, view);
        this.shell.addWidget(view, { area: 'main' });
        this.shell.activateWidget(view.id);
    }
    $disposeWebview(handle: string): void {
        const view = this.views.get(handle);
        if (view) {
            view.dispose();
        }
    }
    $reveal(handle: string, showOptions: WebviewPanelShowOptions): void {
        throw new Error('Method not implemented.');
    }
    $setTitle(handle: string, value: string): void {
        const webview = this.getWebview(handle);
        webview.title.label = value;
    }
    $setIconPath(handle: string, iconPath: { light: string; dark: string; } | string | undefined): void {
        const webview = this.getWebview(handle);
        webview.setIconClass(iconPath ? `webview-icon ${webview.id}-file-icon` : '');
        this.themeRulesService.setIconPath(webview.id, iconPath);
    }
    $setHtml(handle: string, value: string): void {
        const webview = this.getWebview(handle);
        webview.setHTML(value);
    }
    $setOptions(handle: string, options: WebviewOptions): void {
        const webview = this.getWebview(handle);
        webview.setOptions( { allowScripts: options ? options.enableScripts : false });
    }
    $postMessage(handle: string, value: any): Thenable<boolean> {
        const webview = this.getWebview(handle);
        if (webview) {
            webview.postMessage(value);
        }
        return Promise.resolve(webview !== undefined);
    }
    $registerSerializer(viewType: string): void {
        throw new Error('Method not implemented.');
    }
    $unregisterSerializer(viewType: string): void {
        throw new Error('Method not implemented.');
    }

    private getWebview(viewId: string): WebviewWidget {
        const webview = this.views.get(viewId);
        if (!webview) {
            throw new Error(`Unknown Webview: ${viewId}`);
        }
        return webview;
    }

    private onCloseView(viewId: string) {
        const view = this.views.get(viewId);
        if (view) {
            this.themeRulesService.setIconPath(view.id, undefined);
        }
        const cleanUp = () => {
            this.views.delete(viewId);
        };
        this.proxy.$onDidDisposeWebviewPanel(viewId).then(cleanUp, cleanUp);
    }
}
