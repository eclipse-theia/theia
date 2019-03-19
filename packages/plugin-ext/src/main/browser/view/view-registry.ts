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
import { ViewContainer, View } from '../../../common';
import { ApplicationShell } from '@theia/core/lib/browser';
import {
    FrontendApplicationState,
    FrontendApplicationStateService
} from '@theia/core/lib/browser/frontend-application-state';
import { ViewsContainerWidget } from './views-container-widget';
import { TreeViewWidget } from './tree-views-main';
import { PluginSharedStyle } from '../plugin-shared-style';

const READY: FrontendApplicationState = 'ready';
const DEFAULT_LOCATION: ApplicationShell.Area = 'left';

@injectable()
export class ViewRegistry {

    @inject(ApplicationShell)
    protected applicationShell: ApplicationShell;

    @inject(FrontendApplicationStateService)
    protected applicationStateService: FrontendApplicationStateService;

    @inject(PluginSharedStyle)
    protected readonly style: PluginSharedStyle;

    private treeViewWidgets: Map<string, TreeViewWidget> = new Map();
    private containerWidgets: Map<string, ViewsContainerWidget> = new Map();
    private updateContainerOnApplicationReady: Promise<void>;

    @postConstruct()
    init() {
        this.updateContainerOnApplicationReady = this.applicationStateService.reachedState(READY);
    }

    registerViewContainer(location: string, viewsContainer: ViewContainer, containerViews: View[]): void {
        if (this.containerWidgets.has(viewsContainer.id)) {
            return;
        }
        const iconClass = 'plugin-view-container-icon-' + viewsContainer.id;
        this.style.insertRule('.' + iconClass, () => `
            mask: : url('${viewsContainer.iconUrl}') no-repeat 50% 50%;
            -webkit-mask: url('${viewsContainer.iconUrl}') no-repeat 50% 50%;
        `);

        const containerWidget = new ViewsContainerWidget(viewsContainer, containerViews);
        containerWidget.title.iconClass = iconClass;
        this.containerWidgets.set(viewsContainer.id, containerWidget);

        // add to the promise chain
        this.updateContainerOnApplicationReady = this.updateContainerOnApplicationReady.then(() => {
            if (this.applicationShell.getTabBarFor(containerWidget)) {
                return;
            }
            this.applicationShell.addWidget(containerWidget, {
                area: ApplicationShell.isSideArea(location) ? location : DEFAULT_LOCATION
            });

            // update container
            this.treeViewWidgets.forEach((treeViewWidget: TreeViewWidget, viewId: string) => {
                this.addTreeViewWidget(viewsContainer.id, viewId, treeViewWidget);
            });
        });
    }

    registerTreeView(viewId: string, treeViewWidget: TreeViewWidget): void {
        this.treeViewWidgets.set(viewId, treeViewWidget);

        if (this.applicationStateService.state !== READY) {
            return;
        }
        // update containers
        this.containerWidgets.forEach((containerWidget: ViewsContainerWidget, viewsContainerId: string) => {
            this.addTreeViewWidget(viewsContainerId, viewId, treeViewWidget);
        });
    }

    private addTreeViewWidget(viewsContainerId: string, viewId: string, treeViewWidget: TreeViewWidget) {
        const containerWidget = this.containerWidgets.get(viewsContainerId);
        if (containerWidget && containerWidget.hasView(viewId)) {
            containerWidget.addWidget(viewId, treeViewWidget);
        }
    }
}
