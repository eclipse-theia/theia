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
import { ApplicationShell, ViewContainer as ViewContainerWidget, Panel, WidgetManager, ViewContainerIdentifier } from '@theia/core/lib/browser';
import { ViewContainer, View } from '../../../common';
import { PluginSharedStyle } from '../plugin-shared-style';
import { DebugWidget } from '@theia/debug/lib/browser/view/debug-widget';
import { PluginViewWidget, PluginViewWidgetIdentifier } from './plugin-view-widget';
import { SCM_VIEW_CONTAINER_ID } from '@theia/scm/lib/browser/scm-contribution';
import { EXPLORER_VIEW_CONTAINER_ID } from '@theia/navigator/lib/browser';

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

    private readonly views = new Map<string, PluginViewWidget | undefined>();
    private readonly viewsByContainer = new Map<string, PluginViewWidget[]>();
    private readonly viewContainers = new Map<string, ViewContainerWidget | undefined>();

    @postConstruct()
    protected init(): void {
        this.widgetManager.onDidCreateWidget(({ factoryId, widget }) => {
            if (factoryId === DebugWidget.ID && widget instanceof DebugWidget) {
                const viewContainer = widget['sessionWidget']['viewContainer'];
                this.setViewContainer('debug', viewContainer);
                widget.disposed.connect(() => this.viewContainers.delete('debug'));
            }
            if (factoryId === SCM_VIEW_CONTAINER_ID && widget instanceof ViewContainerWidget) {
                this.setViewContainer('scm', widget);
                widget.disposed.connect(() => this.viewContainers.delete('scm'));
            }
            if (factoryId === EXPLORER_VIEW_CONTAINER_ID && widget instanceof ViewContainerWidget) {
                this.setViewContainer('explorer', widget);
                widget.disposed.connect(() => this.viewContainers.delete('explorer'));
            }
        });
    }

    async registerViewContainer(location: string, viewContainer: ViewContainer): Promise<void> {
        if (this.viewContainers.has(viewContainer.id)) {
            console.warn('view container such id alredy registered: ', JSON.stringify(viewContainer));
            return;
        }
        this.viewContainers.set(viewContainer.id, undefined);

        const identifier = this.toViewContainerIdentifier(viewContainer.id);
        const containerWidget = await this.widgetManager.getOrCreateWidget<ViewContainerWidget>(PLUGIN_VIEW_CONTAINER_FACTORY_ID, identifier);
        const iconClass = 'plugin-view-container-icon-' + viewContainer.id;
        this.style.insertRule('.' + iconClass, () => `
            mask: url('${viewContainer.iconUrl}') no-repeat 50% 50%;
            -webkit-mask: url('${viewContainer.iconUrl}') no-repeat 50% 50%;
        `);
        containerWidget.setTitleOptions({
            label: viewContainer.title,
            iconClass,
            closeable: true
        });
        this.setViewContainer(viewContainer.id, containerWidget);

        this.applicationShell.addWidget(containerWidget, {
            area: ApplicationShell.isSideArea(location) ? location : 'left',
            rank: Number.MAX_SAFE_INTEGER
        });
    }

    async registerView(viewContainerId: string, view: View): Promise<void> {
        if (this.views.has(view.id)) {
            console.warn('view with such id alredy registered: ', JSON.stringify(view));
            return;
        }
        this.views.set(view.id, undefined);

        const identifier = this.toPluginViewWidgetIdentifier(view.id);
        const widget = await this.widgetManager.getOrCreateWidget<PluginViewWidget>(PLUGIN_VIEW_FACTORY_ID, identifier);
        widget.title.label = view.name;

        const views = this.viewsByContainer.get(viewContainerId) || [];
        views.push(widget);
        this.views.set(view.id, widget);
        this.viewsByContainer.set(viewContainerId, views);

        const viewContainer = this.viewContainers.get(viewContainerId);
        if (viewContainer) {
            this.addViewWidget(viewContainer, widget);
        }
    }

    getView(viewId: string): Promise<PluginViewWidget | undefined> {
        return this.widgetManager.getWidget(PLUGIN_VIEW_FACTORY_ID, this.toPluginViewWidgetIdentifier(viewId));
    }

    protected setViewContainer(id: string, viewContainer: ViewContainerWidget): void {
        this.viewContainers.set(id, viewContainer);
        const views = this.viewsByContainer.get(id);
        if (views) {
            for (const view of views) {
                this.addViewWidget(viewContainer, view);
            }
        }
    }

    protected addViewWidget(viewContainer: ViewContainerWidget, view: Panel): void {
        viewContainer.addWidget(view, {
            initiallyCollapsed: !!viewContainer.children().next()
        });

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
