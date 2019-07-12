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
import { ApplicationShell, ViewContainer as ViewContainerWidget, WidgetManager, ViewContainerIdentifier, ViewContainerTitleOptions } from '@theia/core/lib/browser';
import { ViewContainer, View } from '../../../common';
import { PluginSharedStyle } from '../plugin-shared-style';
import { DebugWidget } from '@theia/debug/lib/browser/view/debug-widget';
import { PluginViewWidget, PluginViewWidgetIdentifier } from './plugin-view-widget';
import { SCM_VIEW_CONTAINER_ID, ScmContribution } from '@theia/scm/lib/browser/scm-contribution';
import { EXPLORER_VIEW_CONTAINER_ID } from '@theia/navigator/lib/browser';
import { FileNavigatorContribution } from '@theia/navigator/lib/browser/navigator-contribution';
import { DebugFrontendApplicationContribution } from '@theia/debug/lib/browser/debug-frontend-application-contribution';

export const PLUGIN_VIEW_FACTORY_ID = 'plugin-view';
export const PLUGIN_VIEW_CONTAINER_FACTORY_ID = 'plugin-view-container';

@injectable()
export class ViewRegistry {

    @inject(ApplicationShell)
    protected readonly applicationShell: ApplicationShell;

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

    private readonly views = new Map<string, [string, View]>();
    private readonly viewContainers = new Map<string, [string, ViewContainerTitleOptions]>();
    private readonly containerViews = new Map<string, string[]>();

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
        this.viewContainers.set('test', ['left', {
            label: 'Test',
            iconClass: 'theia-plugin-test-tab-icon',
            closeable: true
        }]);
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
        this.viewContainers.set(viewContainer.id, [location, {
            label: viewContainer.title,
            iconClass,
            closeable: true
        }]);
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

    protected prepareView(widget: PluginViewWidget): void {
        const data = this.views.get(widget.options.viewId);
        if (!data) {
            return;
        }
        const [, view] = data;
        widget.title.label = view.name;
    }

    async openViewContainer(containerId: string): Promise<void> {
        if (containerId === 'exporer') {
            await this.explorer.openView();
            return;
        }
        if (containerId === 'scm') {
            await this.scm.openView();
            return;
        }
        if (containerId === 'debug') {
            await this.debug.openView();
            return;
        }
        const data = this.viewContainers.get(containerId);
        if (!data) {
            return;
        }
        const [location] = data;
        const identifier = this.toViewContainerIdentifier(containerId);
        const containerWidget = await this.widgetManager.getOrCreateWidget<ViewContainerWidget>(PLUGIN_VIEW_CONTAINER_FACTORY_ID, identifier);
        if (!containerWidget.isAttached) {
            this.applicationShell.addWidget(containerWidget, {
                area: ApplicationShell.isSideArea(location) ? location : 'left',
                rank: Number.MAX_SAFE_INTEGER
            });
        }
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
                    initiallyCollapsed: !containerWidget.getTrackableWidgets().length
                });
            }
        }
    }

    async initWidgets(): Promise<void> {
        const promises: Promise<void>[] = [];
        for (const id of this.viewContainers.keys()) {
            promises.push((async () => {
                const identifier = this.toViewContainerIdentifier(id);
                if (!await this.widgetManager.getWidget(PLUGIN_VIEW_CONTAINER_FACTORY_ID, identifier)) {
                    await this.openViewContainer(id);
                    const viewContainer = await this.widgetManager.getWidget<ViewContainerWidget>(PLUGIN_VIEW_CONTAINER_FACTORY_ID, identifier);
                    if (viewContainer && !viewContainer.getTrackableWidgets().length) {
                        // close empty view containers
                        viewContainer.dispose();
                    }
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
                await this.prepareViewContainer('explorer', scm);
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

}
