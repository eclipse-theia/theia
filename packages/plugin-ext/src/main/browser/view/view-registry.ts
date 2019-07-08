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
import { ApplicationShell, ViewContainer as ViewContainerWidget, Panel } from '@theia/core/lib/browser';
import { ViewContainer, View } from '../../../common';
import { PluginSharedStyle } from '../plugin-shared-style';

@injectable()
export class ViewRegistry {

    @inject(ApplicationShell)
    protected readonly applicationShell: ApplicationShell;

    @inject(PluginSharedStyle)
    protected readonly style: PluginSharedStyle;

    @inject(ViewContainerWidget.Factory)
    protected readonly viewContainerFactory: ViewContainerWidget.Factory;

    private readonly views = new Map<string, Panel>();
    private readonly viewContainers = new Map<string, ViewContainerWidget>();

    registerViewContainer(location: string, viewContainer: ViewContainer): void {
        if (this.viewContainers.has(viewContainer.id)) {
            return;
        }
        const iconClass = 'plugin-view-container-icon-' + viewContainer.id;
        this.style.insertRule('.' + iconClass, () => `
            mask: url('${viewContainer.iconUrl}') no-repeat 50% 50%;
            -webkit-mask: url('${viewContainer.iconUrl}') no-repeat 50% 50%;
        `);

        const containerWidget = this.viewContainerFactory();
        containerWidget.id = 'plugin-view-container:' + viewContainer.id;
        containerWidget.title.label = viewContainer.title;
        containerWidget.title.caption = viewContainer.title;
        containerWidget.title.iconClass = iconClass;
        this.viewContainers.set(viewContainer.id, containerWidget);

        this.applicationShell.addWidget(containerWidget, {
            area: ApplicationShell.isSideArea(location) ? location : 'left'
        });
    }

    registerView(viewContainerId: string, view: View): void {
        if (this.views.has(view.id)) {
            console.warn('view with such id alredy registered: ', JSON.stringify(view));
            return;
        }
        const viewContainer = this.viewContainers.get(viewContainerId);
        if (viewContainer) {
            const panel = new Panel();
            panel.id = view.id;
            panel.title.label = view.name;
            panel.node.style.height = '100%';
            viewContainer.addWidget(panel);
            this.views.set(view.id, panel);
        }
    }

    getView(viewId: string): Panel | undefined {
        return this.views.get(viewId);
    }
}
