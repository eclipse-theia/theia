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
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { Widget } from '@theia/core/lib/browser/widgets/widget';
import { ViewsContainerWidget } from './views-container-widget';

export interface ViewContainerRegistry {
    container: ViewContainer;
    area: ApplicationShell.Area;
    views: View[]
}

@injectable()
export class ViewRegistry {

    @inject(ApplicationShell)
    protected applicationShell: ApplicationShell;

    @inject(FrontendApplicationStateService)
    protected applicationStateService: FrontendApplicationStateService;

    containers: ViewContainerRegistry[] = new Array();

    @postConstruct()
    init() {
        this.applicationStateService.reachedState('ready').then(() => {
            this.showContainers();
        });
    }

    getArea(location: string): ApplicationShell.Area {
        switch (location) {
            case 'right': return'right';
            case 'bottom': return 'bottom';
            case 'top': return 'top';
        }

        return 'left';
    }

    registerViewContainer(location: string, viewContainer: ViewContainer) {
        const registry: ViewContainerRegistry = {
            container: viewContainer,
            area: this.getArea(location),
            views: []
        };
        this.containers.push(registry);
    }

    registerView(location: string, view: View) {
        this.containers.forEach(containerRegistry => {
            if (location === containerRegistry.container.id) {
                containerRegistry.views.push(view);
            }
        });
    }

    private showContainers() {
        // Remember the currently active widget
        const activeWidget: Widget | undefined = this.applicationShell.activeWidget;

        // Show views containers
        this.containers.forEach(registry => {
            const widget = new ViewsContainerWidget(registry.container, registry.views);
            const tabBar = this.applicationShell.getTabBarFor(widget);
            // const area = this.applicationShell.getAreaFor(widget);

            if (!tabBar) {
                const widgetArgs: ApplicationShell.WidgetOptions = {
                    area: registry.area
                };

                this.applicationShell.addWidget(widget, widgetArgs);
            }
        });

        // Restore active widget
        if (activeWidget) {
            this.applicationShell.activateWidget(activeWidget.id);
        }
    }

}
