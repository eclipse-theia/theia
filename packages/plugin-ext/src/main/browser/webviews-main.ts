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

import { WebviewsMain, MAIN_RPC_CONTEXT, WebviewsExt } from '../../api/plugin-api';
import { interfaces } from 'inversify';
import { RPCProtocol } from '../../api/rpc-protocol';
import { UriComponents } from '../../common/uri-components';
import { WebviewOptions, WebviewPanelOptions, WebviewPanelShowOptions } from '@theia/plugin';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { WebviewWidget } from './webview/webview';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { ThemeRulesService } from './webview/theme-rules-service';
import { DisposableCollection } from '@theia/core';
import { ViewColumnService } from './view-column-service';

import debounce = require('lodash.debounce');

export class WebviewsMainImpl implements WebviewsMain {
    private readonly revivers = new Set<string>();
    private readonly proxy: WebviewsExt;
    protected readonly shell: ApplicationShell;
    protected readonly viewColumnService: ViewColumnService;
    protected readonly keybindingRegistry: KeybindingRegistry;
    protected readonly themeService = ThemeService.get();
    protected readonly themeRulesService = ThemeRulesService.get();
    protected readonly updateViewOptions: () => void;

    private readonly views = new Map<string, WebviewWidget>();
    private readonly viewsOptions = new Map<string, { panelOptions: WebviewPanelShowOptions; panelId: string; active: boolean; visible: boolean; }>();

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.WEBVIEWS_EXT);
        this.shell = container.get(ApplicationShell);
        this.keybindingRegistry = container.get(KeybindingRegistry);
        this.viewColumnService = container.get(ViewColumnService);
        this.updateViewOptions = debounce<() => void>(() => {
            for (const key of this.viewsOptions.keys()) {
                this.checkViewOptions(key);
            }
        }, 100);
        this.shell.activeChanged.connect(() => this.updateViewOptions());
        this.shell.currentChanged.connect(() => this.updateViewOptions());
        this.viewColumnService.onViewColumnChanged(() => this.updateViewOptions());
    }

    $createWebviewPanel(
        panelId: string,
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
                    this.proxy.$onMessage(panelId, m);
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
                        parent.appendChild(styleElement);
                    }

                    this.themeRulesService.setRules(styleElement, this.themeRulesService.getCurrentThemeRules());
                    toDispose.push(this.themeService.onThemeChange(() => {
                        this.themeRulesService.setRules(<HTMLElement>styleElement, this.themeRulesService.getCurrentThemeRules());
                    }));
                }
            });
        view.disposed.connect(() => {
            toDispose.dispose();
            this.onCloseView(panelId);
        });

        this.views.set(panelId, view);
        this.viewsOptions.set(view.id, { panelOptions: showOptions, panelId, visible: false, active: false });
        this.addOrReattachWidget(panelId, showOptions);
    }
    private addOrReattachWidget(handler: string, showOptions: WebviewPanelShowOptions) {
        const view = this.views.get(handler);
        if (!view) {
            return;
        }
        const widgetOptions: ApplicationShell.WidgetOptions = { area: showOptions.area ? showOptions.area : 'main' };

        let mode = 'open-to-right';
        if (showOptions.viewColumn === -2) {
            const ref = this.shell.currentWidget;
            if (ref && this.shell.getAreaFor(ref) === widgetOptions.area) {
                Object.assign(widgetOptions, { ref, mode });
            }
        } else if (widgetOptions.area === 'main' && showOptions.viewColumn !== undefined) {
            this.viewColumnService.updateViewColumns();
            let widgetIds = this.viewColumnService.getViewColumnIds(showOptions.viewColumn);
            if (widgetIds.length > 0) {
                mode = 'tab-after';
            } else if (showOptions.viewColumn >= 0) {
                const columnsSize = this.viewColumnService.viewColumnsSize();
                if (columnsSize) {
                    showOptions.viewColumn = columnsSize - 1;
                    widgetIds = this.viewColumnService.getViewColumnIds(showOptions.viewColumn);
                }
            }
            const ref = this.shell.getWidgets(widgetOptions.area).find(widget => widget.isVisible && widgetIds.indexOf(widget.id) !== -1);
            if (ref) {
                Object.assign(widgetOptions, { ref, mode });
            }
        }

        this.shell.addWidget(view, widgetOptions);
        const visible = true;
        let active: boolean;
        if (showOptions.preserveFocus) {
            this.shell.revealWidget(view.id);
            active = false;
        } else {
            this.shell.activateWidget(view.id);
            active = true;
        }
        const options = this.viewsOptions.get(view.id);
        if (!options) {
            return;
        }
        options.panelOptions = showOptions;
        options.visible = visible;
        options.active = active;
    }
    $disposeWebview(handle: string): void {
        const view = this.views.get(handle);
        if (view) {
            view.dispose();
        }
    }
    $reveal(handle: string, showOptions: WebviewPanelShowOptions): void {
        const view = this.getWebview(handle);
        if (view.isDisposed) {
            return;
        }
        if (showOptions.viewColumn !== undefined || showOptions.area !== undefined) {
            this.viewColumnService.updateViewColumns();
            const options = this.viewsOptions.get(view.id);
            if (!options) {
                return;
            }
            const columnIds = showOptions.viewColumn ? this.viewColumnService.getViewColumnIds(showOptions.viewColumn) : [];
            if (columnIds.indexOf(view.id) === -1 || options.panelOptions.area !== showOptions.area) {
                this.addOrReattachWidget(options.panelId, showOptions);
                options.panelOptions = showOptions;
                this.checkViewOptions(view.id, options.panelOptions.viewColumn);
                this.updateViewOptions();
                return;
            }
        }
        if (showOptions.preserveFocus) {
            this.shell.revealWidget(view.id);
        } else {
            this.shell.activateWidget(view.id);
        }
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
        webview.setOptions({ allowScripts: options ? options.enableScripts : false });
    }
    // tslint:disable-next-line:no-any
    $postMessage(handle: string, value: any): Thenable<boolean> {
        const webview = this.getWebview(handle);
        if (webview) {
            webview.postMessage(value);
        }
        return Promise.resolve(webview !== undefined);
    }
    $registerSerializer(viewType: string): void {
        this.revivers.add(viewType);
    }
    $unregisterSerializer(viewType: string): void {
        this.revivers.delete(viewType);
    }

    private async checkViewOptions(handler: string, viewColumn?: number | undefined) {
        const options = this.viewsOptions.get(handler);
        if (!options || !options.panelOptions) {
            return;
        }
        const view = this.views.get(options.panelId);
        if (!view) {
            return;
        }
        const active = !!this.shell.activeWidget ? this.shell.activeWidget.id === view!.id : false;
        const visible = view!.isVisible;
        if (viewColumn === undefined) {
            this.viewColumnService.updateViewColumns();
            viewColumn = this.viewColumnService.hasViewColumn(view.id) ? this.viewColumnService.getViewColumn(view.id)! : 0;
            if (options.panelOptions.viewColumn === viewColumn && options.visible === visible && options.active === active) {
                return;
            }
        }
        options.active = active;
        options.visible = visible;
        options.panelOptions.viewColumn = viewColumn;
        this.proxy.$onDidChangeWebviewPanelViewState(options.panelId, { active, visible, position: options.panelOptions.viewColumn! });
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
            this.viewsOptions.delete(viewId);
        };
        this.proxy.$onDidDisposeWebviewPanel(viewId).then(cleanUp, cleanUp);
    }
}
