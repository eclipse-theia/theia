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

import { injectable, inject, postConstruct } from 'inversify';
import {
    ApplicationShell, ViewContainer as ViewContainerWidget, WidgetManager,
    ViewContainerIdentifier, ViewContainerTitleOptions, Widget, FrontendApplicationContribution,
    StatefulWidget, CommonMenus
} from '@theia/core/lib/browser';
import { ViewContainer, View } from '../../../common';
import { PluginSharedStyle } from '../plugin-shared-style';
import { DebugWidget } from '@theia/debug/lib/browser/view/debug-widget';
import { PluginViewWidget, PluginViewWidgetIdentifier } from './plugin-view-widget';
import { SCM_VIEW_CONTAINER_ID, ScmContribution } from '@theia/scm/lib/browser/scm-contribution';
import { EXPLORER_VIEW_CONTAINER_ID } from '@theia/navigator/lib/browser';
import { FileNavigatorContribution } from '@theia/navigator/lib/browser/navigator-contribution';
import { DebugFrontendApplicationContribution } from '@theia/debug/lib/browser/debug-frontend-application-contribution';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { MenuModelRegistry } from '@theia/core/lib/common/menu';
import { QuickViewService } from '@theia/core/lib/browser/quick-view-service';
import { Emitter } from '@theia/core/lib/common/event';

export const PLUGIN_VIEW_FACTORY_ID = 'plugin-view';
export const PLUGIN_VIEW_CONTAINER_FACTORY_ID = 'plugin-view-container';
export const PLUGIN_VIEW_DATA_FACTORY_ID = 'plugin-view-data';

@injectable()
export class PluginViewRegistry implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(PluginSharedStyle)
    protected readonly style: PluginSharedStyle;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ScmContribution)
    protected readonly scm: ScmContribution;

    @inject(FileNavigatorContribution)
    protected readonly explorer: FileNavigatorContribution;

    @inject(DebugFrontendApplicationContribution)
    protected readonly debug: DebugFrontendApplicationContribution;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(MenuModelRegistry)
    protected readonly menus: MenuModelRegistry;

    @inject(QuickViewService)
    protected readonly quickView: QuickViewService;

    protected readonly onDidExpandViewEmitter = new Emitter<string>();
    readonly onDidExpandView = this.onDidExpandViewEmitter.event;

    private readonly views = new Map<string, [string, View]>();
    private readonly viewContainers = new Map<string, [string, ViewContainerTitleOptions]>();
    private readonly containerViews = new Map<string, string[]>();

    private readonly viewDataProviders = new Map<string, (state?: object) => Promise<Widget>>();
    private readonly viewDataState = new Map<string, object>();

    @postConstruct()
    protected init(): void {
        this.widgetManager.onDidCreateWidget(({ factoryId, widget }) => {
            if (factoryId === EXPLORER_VIEW_CONTAINER_ID && widget instanceof ViewContainerWidget) {
                this.prepareViewContainer('explorer', widget);
            }
            if (factoryId === SCM_VIEW_CONTAINER_ID && widget instanceof ViewContainerWidget) {
                this.prepareViewContainer('scm', widget);
            }
            if (factoryId === DebugWidget.ID && widget instanceof DebugWidget) {
                const viewContainer = widget['sessionWidget']['viewContainer'];
                this.prepareViewContainer('debug', viewContainer);
            }
            if (factoryId === PLUGIN_VIEW_CONTAINER_FACTORY_ID && widget instanceof ViewContainerWidget) {
                this.prepareViewContainer(this.toViewContainerId(widget.options), widget);
            }
            if (factoryId === PLUGIN_VIEW_FACTORY_ID && widget instanceof PluginViewWidget) {
                this.prepareView(widget);
            }
        });
        this.doRegisterViewContainer('test', 'left', {
            label: 'Test',
            iconClass: 'theia-plugin-test-tab-icon',
            closeable: true
        });
    }

    registerViewContainer(location: string, viewContainer: ViewContainer): void {
        if (this.viewContainers.has(viewContainer.id)) {
            console.warn('view container such id alredy registered: ', JSON.stringify(viewContainer));
            return;
        }
        const iconClass = 'plugin-view-container-icon-' + viewContainer.id;
        this.style.insertRule('.' + iconClass, () => `
                mask: url('${viewContainer.iconUrl}') no-repeat 50% 50%;
                -webkit-mask: url('${viewContainer.iconUrl}') no-repeat 50% 50%;
            `);
        this.doRegisterViewContainer(viewContainer.id, location, {
            label: viewContainer.title,
            iconClass,
            closeable: true
        });
    }

    protected doRegisterViewContainer(id: string, location: string, options: ViewContainerTitleOptions): void {
        this.viewContainers.set(id, [location, options]);
        const toggleCommandId = `plugin.view-container.${id}.toggle`;
        this.commands.registerCommand({
            id: toggleCommandId,
            label: 'Toggle ' + options.label + ' View'
        }, {
                execute: async () => {
                    let widget = await this.getPluginViewContainer(id);
                    if (widget) {
                        widget.dispose();
                    } else {
                        widget = await this.openViewContainer(id);
                        if (widget) {
                            this.shell.activateWidget(widget.id);
                        }
                    }
                }
            });
        this.menus.registerMenuAction(CommonMenus.VIEW_VIEWS, {
            commandId: toggleCommandId,
            label: options.label
        });
    }

    registerView(viewContainerId: string, view: View): void {
        if (this.views.has(view.id)) {
            console.warn('view with such id alredy registered: ', JSON.stringify(view));
            return;
        }
        this.views.set(view.id, [viewContainerId, view]);
        const containerViews = this.containerViews.get(viewContainerId) || [];
        containerViews.push(view.id);
        this.containerViews.set(viewContainerId, containerViews);
        this.quickView.registerItem({
            label: view.name,
            open: async () => {
                const widget = await this.openView(view.id);
                if (widget) {
                    this.shell.activateWidget(widget.id);
                }
            }
        });
    }

    async getView(viewId: string): Promise<PluginViewWidget | undefined> {
        if (!this.views.has(viewId)) {
            return undefined;
        }
        return this.widgetManager.getWidget<PluginViewWidget>(PLUGIN_VIEW_FACTORY_ID, this.toPluginViewWidgetIdentifier(viewId));
    }

    async openView(viewId: string): Promise<PluginViewWidget | undefined> {
        const widget = await this.getView(viewId);
        if (widget) {
            return widget;
        }
        const data = this.views.get(viewId);
        if (!data) {
            return undefined;
        }
        const [containerId] = data;
        await this.openViewContainer(containerId);
        return this.getView(viewId);
    }

    protected async prepareView(widget: PluginViewWidget): Promise<void> {
        const data = this.views.get(widget.options.viewId);
        if (!data) {
            return;
        }
        const [, view] = data;
        widget.title.label = view.name;
        const currentDataWidget = widget.widgets[0];
        const viewDataWidget = await this.createViewDataWidget(view.id);
        if (currentDataWidget !== viewDataWidget) {
            if (currentDataWidget) {
                currentDataWidget.dispose();
            }
            if (viewDataWidget) {
                widget.addWidget(viewDataWidget);
            }
        }
    }

    async openViewContainer(containerId: string): Promise<ViewContainerWidget | undefined> {
        if (containerId === 'exporer') {
            const widget = await this.explorer.openView();
            if (widget.parent instanceof ViewContainerWidget) {
                return widget.parent;
            }
            return undefined;
        }
        if (containerId === 'scm') {
            const widget = await this.scm.openView();
            if (widget.parent instanceof ViewContainerWidget) {
                return widget.parent;
            }
            return undefined;
        }
        if (containerId === 'debug') {
            const widget = await this.debug.openView();
            return widget['sessionWidget']['viewContainer'];
        }
        const data = this.viewContainers.get(containerId);
        if (!data) {
            return undefined;
        }
        const [location] = data;
        const identifier = this.toViewContainerIdentifier(containerId);
        const containerWidget = await this.widgetManager.getOrCreateWidget<ViewContainerWidget>(PLUGIN_VIEW_CONTAINER_FACTORY_ID, identifier);
        if (!containerWidget.isAttached) {
            await this.shell.addWidget(containerWidget, {
                area: ApplicationShell.isSideArea(location) ? location : 'left',
                rank: Number.MAX_SAFE_INTEGER
            });
        }
        return containerWidget;
    }

    protected async prepareViewContainer(viewContainerId: string, containerWidget: ViewContainerWidget): Promise<void> {
        const data = this.viewContainers.get(viewContainerId);
        if (data) {
            const [, options] = data;
            containerWidget.setTitleOptions(options);
        }
        for (const viewId of this.containerViews.get(viewContainerId) || []) {
            const identifier = this.toPluginViewWidgetIdentifier(viewId);
            const widget = await this.widgetManager.getOrCreateWidget<PluginViewWidget>(PLUGIN_VIEW_FACTORY_ID, identifier);
            if (containerWidget.getTrackableWidgets().indexOf(widget) === -1) {
                containerWidget.addWidget(widget, {
                    initiallyCollapsed: !!containerWidget.getParts().length
                });
            }
            const part = containerWidget.getPartFor(widget);
            if (part) {
                const tryFireOnDidExpandView = () => {
                    if (!part.collapsed && !part.isHidden) {
                        toFire.dispose();
                    }
                };
                const toFire = new DisposableCollection(
                    Disposable.create(() => this.onDidExpandViewEmitter.fire(viewId)),
                    part.onCollapsed(tryFireOnDidExpandView),
                    part.onVisibilityChanged(tryFireOnDidExpandView)
                );
                tryFireOnDidExpandView();
            }
        }
    }

    protected getPluginViewContainer(viewContainerId: string): Promise<ViewContainerWidget | undefined> {
        const identifier = this.toViewContainerIdentifier(viewContainerId);
        return this.widgetManager.getWidget(PLUGIN_VIEW_CONTAINER_FACTORY_ID, identifier);
    }

    async initWidgets(): Promise<void> {
        const promises: Promise<void>[] = [];
        for (const id of this.viewContainers.keys()) {
            promises.push((async () => {
                let viewContainer = await this.getPluginViewContainer(id);
                if (!viewContainer) {
                    viewContainer = await this.openViewContainer(id);
                    if (viewContainer && !viewContainer.getTrackableWidgets().length) {
                        // close empty view containers
                        viewContainer.dispose();
                    }
                } else {
                    await this.prepareViewContainer(this.toViewContainerId(viewContainer.options), viewContainer);
                }
            })().catch(console.error));
        }
        promises.push((async () => {
            const explorer = await this.widgetManager.getWidget(EXPLORER_VIEW_CONTAINER_ID);
            if (explorer instanceof ViewContainerWidget) {
                await this.prepareViewContainer('explorer', explorer);
            }
        })().catch(console.error));
        promises.push((async () => {
            const scm = await this.widgetManager.getWidget(SCM_VIEW_CONTAINER_ID);
            if (scm instanceof ViewContainerWidget) {
                await this.prepareViewContainer('scm', scm);
            }
        })().catch(console.error));
        promises.push((async () => {
            const debug = await this.widgetManager.getWidget(DebugWidget.ID);
            if (debug instanceof DebugWidget) {
                const viewContainer = debug['sessionWidget']['viewContainer'];
                await this.prepareViewContainer('debug', viewContainer);
            }
        })().catch(console.error));
        await Promise.all(promises);
    }

    async removeStaleWidgets(): Promise<void> {
        const views = this.widgetManager.getWidgets(PLUGIN_VIEW_FACTORY_ID);
        for (const view of views) {
            if (view instanceof PluginViewWidget) {
                const id = this.toViewId(view.options);
                if (!this.views.has(id)) {
                    view.dispose();
                }
            }
        }
        const viewContainers = this.widgetManager.getWidgets(PLUGIN_VIEW_CONTAINER_FACTORY_ID);
        for (const viewContainer of viewContainers) {
            if (viewContainer instanceof ViewContainerWidget) {
                const id = this.toViewContainerId(viewContainer.options);
                if (!this.viewContainers.has(id)) {
                    viewContainer.dispose();
                }
            }
        }
    }

    protected toViewContainerIdentifier(viewContainerId: string): ViewContainerIdentifier {
        return { id: PLUGIN_VIEW_CONTAINER_FACTORY_ID + ':' + viewContainerId };
    }
    protected toViewContainerId(identifier: ViewContainerIdentifier): string {
        return identifier.id.substr(PLUGIN_VIEW_CONTAINER_FACTORY_ID.length + 1);
    }

    protected toPluginViewWidgetIdentifier(viewId: string): PluginViewWidgetIdentifier {
        return { id: PLUGIN_VIEW_FACTORY_ID + ':' + viewId, viewId };
    }
    protected toViewId(identifier: PluginViewWidgetIdentifier): string {
        return identifier.viewId;
    }

    /**
     * retrieve restored layout state from previous user session but close widgets
     * widgets should be opened only when view data providers are registered
     */
    onDidInitializeLayout(): void {
        const widgets = this.widgetManager.getWidgets(PLUGIN_VIEW_DATA_FACTORY_ID);
        for (const widget of widgets) {
            if (StatefulWidget.is(widget)) {
                this.viewDataState.set(widget.id, widget.storeState());
            }
            widget.dispose();
        }
    }

    registerViewDataProvider(viewId: string, provider: (state?: object) => Promise<Widget>): Disposable {
        if (this.viewDataProviders.has(viewId)) {
            console.error(`data provider for '${viewId}' view is already registrered`);
            return Disposable.NULL;
        }
        (async () => {
            const view = await this.getView(viewId);
            if (view) {
                await this.prepareView(view);
            }
        })();
        this.viewDataProviders.set(viewId, provider);
        return Disposable.create(() => {
            this.viewDataProviders.delete(viewId);
            this.viewDataState.delete(viewId);
        });
    }

    protected async createViewDataWidget(viewId: string): Promise<Widget | undefined> {
        const provider = this.viewDataProviders.get(viewId);
        if (!provider) {
            return undefined;
        }
        const state = this.viewDataState.get(viewId);
        const widget = await provider(state);
        if (StatefulWidget.is(widget)) {
            const dispose = widget.dispose.bind(widget);
            widget.dispose = () => {
                this.viewDataState.set(viewId, widget.storeState());
                dispose();
            };
        } else {
            this.viewDataState.delete(viewId);
        }
        return widget;
    }

}
