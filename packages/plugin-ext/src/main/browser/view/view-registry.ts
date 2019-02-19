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

import { injectable, inject } from 'inversify';
import { ViewContainer, View } from '../../../common';
import { ApplicationShell } from '@theia/core/lib/browser';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { ViewsContainerWidget } from './views-container-widget';
import { TreeViewWidget } from './tree-views-main';

@injectable()
export class ViewRegistry {

    @inject(ApplicationShell)
    protected applicationShell: ApplicationShell;

    @inject(FrontendApplicationStateService)
    protected applicationStateService: FrontendApplicationStateService;

    private containersWidgets: Map<string, ViewsContainerWidget> = new Map<string, ViewsContainerWidget>();
    private promiseChain: Promise<void>;

    registerViewContainer(location: string, viewContainer: ViewContainer) {
        const widget = new ViewsContainerWidget(viewContainer);
        this.containersWidgets.set(viewContainer.id, widget);
        this.updatePromiseChain(() => {
            if (widget && !this.applicationShell.getTabBarFor(widget)) {
                this.applicationShell.addWidget(widget, {
                    area: ApplicationShell.isSideArea(location) ? location : 'left'
                });
            }
        });
    }

    registerView(location: string, view: View) {
        const widget = this.containersWidgets.get(location);
        if (widget) {
            widget.addView(view);
        }
    }

    onRegisterTreeView(viewId: string, treeViewWidget: TreeViewWidget) {
        this.containersWidgets.forEach(async (viewsContainerWidget: ViewsContainerWidget) => {
            await this.promiseChain;
            if (viewsContainerWidget.hasView(viewId)) {
                viewsContainerWidget.addWidget(viewId, treeViewWidget);
                this.applicationShell.activateWidget(viewsContainerWidget.id);
            }
        });
    }

    private updatePromiseChain(callback: () => void): void {
        if (!this.promiseChain) {
            this.promiseChain = this.applicationStateService.reachedState('ready');
        }
        this.promiseChain = this.promiseChain.then(callback);
    }
}
