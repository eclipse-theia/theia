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

import debounce = require('lodash.debounce');
import { WebviewsMain, MAIN_RPC_CONTEXT, WebviewsExt, WebviewPanelViewState } from '../../common/plugin-api-rpc';
import { interfaces } from 'inversify';
import { RPCProtocol } from '../../common/rpc-protocol';
import { WebviewOptions, WebviewPanelOptions, WebviewPanelShowOptions } from '@theia/plugin';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { WebviewWidget, WebviewWidgetIdentifier } from './webview/webview';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { ThemeRulesService } from './webview/theme-rules-service';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { ViewColumnService } from './view-column-service';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { JSONExt } from '@phosphor/coreutils/lib/json';
import { Mutable } from '@theia/core/lib/common/types';
import { HostedPluginSupport } from '../../hosted/browser/hosted-plugin';

export class WebviewsMainImpl implements WebviewsMain, Disposable {

    private readonly proxy: WebviewsExt;
    protected readonly shell: ApplicationShell;
    protected readonly widgets: WidgetManager;
    protected readonly pluginService: HostedPluginSupport;
    protected readonly viewColumnService: ViewColumnService;
    protected readonly keybindingRegistry: KeybindingRegistry;
    protected readonly themeService = ThemeService.get();
    protected readonly themeRulesService = ThemeRulesService.get();
    private readonly toDispose = new DisposableCollection();

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.WEBVIEWS_EXT);
        this.shell = container.get(ApplicationShell);
        this.keybindingRegistry = container.get(KeybindingRegistry);
        this.viewColumnService = container.get(ViewColumnService);
        this.widgets = container.get(WidgetManager);
        this.pluginService = container.get(HostedPluginSupport);
        this.toDispose.push(this.shell.onDidChangeActiveWidget(() => this.updateViewStates()));
        this.toDispose.push(this.shell.onDidChangeCurrentWidget(() => this.updateViewStates()));
        this.toDispose.push(this.viewColumnService.onViewColumnChanged(() => this.updateViewStates()));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    async $createWebviewPanel(
        panelId: string,
        viewType: string,
        title: string,
        showOptions: WebviewPanelShowOptions,
        options: WebviewPanelOptions & WebviewOptions
    ): Promise<void> {
        const view = await this.widgets.getOrCreateWidget<WebviewWidget>(WebviewWidget.FACTORY_ID, <WebviewWidgetIdentifier>{ id: panelId });
        this.hookWebview(view);
        view.viewType = viewType;
        view.title.label = title;
        const { enableFindWidget, retainContextWhenHidden, enableScripts, localResourceRoots, ...contentOptions } = options;
        view.options = { enableFindWidget, retainContextWhenHidden };
        view.setContentOptions({
            allowScripts: enableScripts,
            localResourceRoots: localResourceRoots && localResourceRoots.map(root => root.toString()),
            ...contentOptions
        });
        this.addOrReattachWidget(panelId, showOptions);
    }

    protected hookWebview(view: WebviewWidget): void {
        const handle = view.identifier.id;
        const toDisposeOnClose = new DisposableCollection();
        const toDisposeOnLoad = new DisposableCollection();

        view.eventDelegate = {
            // TODO review callbacks
            onMessage: m => {
                this.proxy.$onMessage(handle, m);
            },
            onKeyboardEvent: e => {
                this.keybindingRegistry.run(e);
            },
            onLoad: contentDocument => {
                const styleId = 'webview-widget-theme';
                let styleElement: HTMLStyleElement | null | undefined;
                if (!toDisposeOnLoad.disposed) {
                    // if reload the frame
                    toDisposeOnLoad.dispose();
                    styleElement = <HTMLStyleElement>contentDocument.getElementById(styleId);
                }
                toDisposeOnClose.push(toDisposeOnLoad);
                if (!styleElement) {
                    const parent = contentDocument.head ? contentDocument.head : contentDocument.body;
                    styleElement = this.themeRulesService.createStyleSheet(parent);
                    styleElement.id = styleId;
                    parent.appendChild(styleElement);
                }

                this.themeRulesService.setRules(styleElement, this.themeRulesService.getCurrentThemeRules());
                contentDocument.body.className = `vscode-${ThemeService.get().getCurrentTheme().id}`;
                toDisposeOnLoad.push(this.themeService.onThemeChange(() => {
                    this.themeRulesService.setRules(<HTMLElement>styleElement, this.themeRulesService.getCurrentThemeRules());
                    contentDocument.body.className = `vscode-${ThemeService.get().getCurrentTheme().id}`;
                }));
            }
        };
        this.toDispose.push(Disposable.create(() => view.eventDelegate = {}));

        view.disposed.connect(() => {
            toDisposeOnClose.dispose();
            if (!this.toDispose.disposed) {
                this.proxy.$onDidDisposeWebviewPanel(handle);
            }
        });
        toDisposeOnClose.push(Disposable.create(() => this.themeRulesService.setIconPath(handle, undefined)));
    }

    private async addOrReattachWidget(handle: string, showOptions: WebviewPanelShowOptions): Promise<void> {
        const widget = await this.tryGetWebview(handle);
        if (!widget) {
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
            const ref = this.shell.getWidgets(widgetOptions.area).find(w => !w.isHidden && widgetIds.indexOf(w.id) !== -1);
            if (ref) {
                Object.assign(widgetOptions, { ref, mode });
            }
        }

        this.shell.addWidget(widget, widgetOptions);
        if (showOptions.preserveFocus) {
            this.shell.revealWidget(widget.id);
        } else {
            this.shell.activateWidget(widget.id);
        }
        this.updateViewState(widget, showOptions.viewColumn);
        this.updateViewStates();
    }

    async $disposeWebview(handle: string): Promise<void> {
        const view = await this.tryGetWebview(handle);
        if (view) {
            view.dispose();
        }
    }

    async $reveal(handle: string, showOptions: WebviewPanelShowOptions): Promise<void> {
        const widget = await this.getWebview(handle);
        if (widget.isDisposed) {
            return;
        }
        if ((showOptions.viewColumn !== undefined && showOptions.viewColumn !== widget.viewState.position) || showOptions.area !== undefined) {
            this.viewColumnService.updateViewColumns();
            const columnIds = showOptions.viewColumn ? this.viewColumnService.getViewColumnIds(showOptions.viewColumn) : [];
            const area = this.shell.getAreaFor(widget);
            if (columnIds.indexOf(widget.id) === -1 || area !== showOptions.area) {
                this.addOrReattachWidget(widget.identifier.id, showOptions);
                return;
            }
        }
        if (showOptions.preserveFocus) {
            this.shell.revealWidget(widget.id);
        } else {
            this.shell.activateWidget(widget.id);
        }
    }

    async $setTitle(handle: string, value: string): Promise<void> {
        const webview = await this.getWebview(handle);
        webview.title.label = value;
    }

    async $setIconPath(handle: string, iconPath: { light: string; dark: string; } | string | undefined): Promise<void> {
        const webview = await this.getWebview(handle);
        webview.setIconClass(iconPath ? `webview-icon ${handle}-file-icon` : '');
        this.themeRulesService.setIconPath(handle, iconPath);
    }

    async $setHtml(handle: string, value: string): Promise<void> {
        const webview = await this.getWebview(handle);
        webview.setHTML(value);
    }

    async $setOptions(handle: string, options: WebviewOptions): Promise<void> {
        const webview = await this.getWebview(handle);
        const { enableScripts, localResourceRoots, ...contentOptions } = options;
        webview.setContentOptions({
            allowScripts: enableScripts,
            localResourceRoots: localResourceRoots && localResourceRoots.map(root => root.toString()),
            ...contentOptions
        });
    }

    // tslint:disable-next-line:no-any
    async $postMessage(handle: string, value: any): Promise<boolean> {
        const webview = await this.getWebview(handle);
        webview.sendMessage(value);
        return true;
    }

    $registerSerializer(viewType: string): void {
        this.pluginService.registerWebviewReviver(viewType, widget => this.restoreWidget(widget));
        this.toDispose.push(Disposable.create(() => this.$unregisterSerializer(viewType)));
    }

    $unregisterSerializer(viewType: string): void {
        this.pluginService.unregisterWebviewReviver(viewType);
    }

    protected async restoreWidget(widget: WebviewWidget): Promise<void> {
        this.hookWebview(widget);
        const handle = widget.identifier.id;
        const title = widget.title.label;
        const state = widget.state;
        const options = widget.options;
        this.viewColumnService.updateViewColumns();
        const position = this.viewColumnService.getViewColumn(widget.id) || 0;
        await this.proxy.$deserializeWebviewPanel(handle, widget.viewType, title, state, position, options);
    }

    protected readonly updateViewStates = debounce(() => {
        for (const widget of this.widgets.getWidgets(WebviewWidget.FACTORY_ID)) {
            if (widget instanceof WebviewWidget) {
                this.updateViewState(widget);
            }
        }
    }, 100);

    private async updateViewState(widget: WebviewWidget, viewColumn?: number | undefined): Promise<void> {
        const viewState: Mutable<WebviewPanelViewState> = {
            active: this.shell.activeWidget === widget,
            visible: !widget.isHidden,
            position: viewColumn || 0
        };
        if (typeof viewColumn !== 'number') {
            this.viewColumnService.updateViewColumns();
            viewState.position = this.viewColumnService.getViewColumn(widget.id) || 0;
        }
        // tslint:disable-next-line:no-any
        if (JSONExt.deepEqual(<any>viewState, <any>widget.viewState)) {
            return;
        }
        widget.viewState = viewState;
        this.proxy.$onDidChangeWebviewPanelViewState(widget.identifier.id, widget.viewState);
    }

    private async getWebview(viewId: string): Promise<WebviewWidget> {
        const webview = await this.tryGetWebview(viewId);
        if (!webview) {
            throw new Error(`Unknown Webview: ${viewId}`);
        }
        return webview;
    }

    private async tryGetWebview(id: string): Promise<WebviewWidget | undefined> {
        return this.widgets.getWidget<WebviewWidget>(WebviewWidget.FACTORY_ID, <WebviewWidgetIdentifier>{ id });
    }

}
