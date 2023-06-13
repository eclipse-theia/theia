// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { OutlineViewService } from './outline-view-service';
import { OutlineViewContribution } from './outline-view-contribution';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import {
    FrontendApplicationContribution,
    createTreeContainer,
    bindViewContribution,
    TreeProps,
    defaultTreeProps,
    BreadcrumbsContribution
} from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { OutlineViewWidgetFactory, OutlineViewWidget } from './outline-view-widget';
import '../../src/browser/styles/index.css';
import { bindContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { OutlineDecoratorService, OutlineTreeDecorator } from './outline-decorator-service';
import { OutlineViewTreeModel } from './outline-view-tree-model';
import { BreadcrumbPopupOutlineView, BreadcrumbPopupOutlineViewFactory, OutlineBreadcrumbsContribution } from './outline-breadcrumbs-contribution';

export default new ContainerModule(bind => {
    bind(OutlineViewWidgetFactory).toFactory(ctx =>
        () => createOutlineViewWidget(ctx.container)
    );

    bind(BreadcrumbPopupOutlineViewFactory).toFactory(({ container }) => () => {
        const child = createOutlineViewWidgetContainer(container);
        child.rebind(OutlineViewWidget).to(BreadcrumbPopupOutlineView);
        child.rebind(TreeProps).toConstantValue({ ...defaultTreeProps, expandOnlyOnExpansionToggleClick: true, search: false, virtualized: false });
        return child.get(OutlineViewWidget);
    });

    bind(OutlineViewService).toSelf().inSingletonScope();
    bind(WidgetFactory).toService(OutlineViewService);

    bindViewContribution(bind, OutlineViewContribution);
    bind(FrontendApplicationContribution).toService(OutlineViewContribution);
    bind(TabBarToolbarContribution).toService(OutlineViewContribution);

    bind(OutlineBreadcrumbsContribution).toSelf().inSingletonScope();
    bind(BreadcrumbsContribution).toService(OutlineBreadcrumbsContribution);
});

function createOutlineViewWidgetContainer(parent: interfaces.Container): interfaces.Container {
    const child = createTreeContainer(parent, {
        props: { expandOnlyOnExpansionToggleClick: true, search: true },
        widget: OutlineViewWidget,
        model: OutlineViewTreeModel,
        decoratorService: OutlineDecoratorService,
    });
    bindContributionProvider(child, OutlineTreeDecorator);
    return child;
}

/**
 * Create an `OutlineViewWidget`.
 * - The creation of the `OutlineViewWidget` includes:
 *  - The creation of the tree widget itself with it's own customized props.
 *  - The binding of necessary components into the container.
 * @param parent the Inversify container.
 *
 * @returns the `OutlineViewWidget`.
 */
function createOutlineViewWidget(parent: interfaces.Container): OutlineViewWidget {
    const child = createOutlineViewWidgetContainer(parent);

    return child.get(OutlineViewWidget);
}
