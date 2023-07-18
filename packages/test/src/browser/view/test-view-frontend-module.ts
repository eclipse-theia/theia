// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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

import '../../../src/browser/style/index.css';

import { interfaces, ContainerModule, Container } from '@theia/core/shared/inversify';
import {
    bindViewContribution, FrontendApplicationContribution,
    WidgetFactory, ViewContainer,
    WidgetManager, createTreeContainer
} from '@theia/core/lib/browser';
import { TestWidget } from './test-widget';
import { TestTreeWidget } from './test-tree-widget';
import { TestViewContribution, TEST_VIEW_CONTAINER_ID, TEST_VIEW_CONTAINER_TITLE_OPTIONS, TEST_WIDGET_FACTORY_ID } from './test-view-contribution';
import { TestService, TestContribution, DefaultTestService } from '../test-service';
import { bindContributionProvider } from '@theia/core';
export default new ContainerModule(bind => {

    bindContributionProvider(bind, TestContribution);
    bind(TestService).to(DefaultTestService).inSingletonScope();

    bind(TestWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: TEST_WIDGET_FACTORY_ID,
        createWidget: () => container.get(TestWidget)
    })).inSingletonScope();

    bind(TestTreeWidget).toDynamicValue(({ container }) => {
        const child = createTestTreeContainer(container);
        return child.get(TestTreeWidget);
    });
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: TestTreeWidget.ID,
        createWidget: () => container.get<TestTreeWidget>(TestTreeWidget)
    })).inSingletonScope();

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: TEST_VIEW_CONTAINER_ID,
        createWidget: async () => {
            const viewContainer = container.get<ViewContainer.Factory>(ViewContainer.Factory)({
                id: TEST_VIEW_CONTAINER_ID,
                progressLocationId: 'test'
            });
            viewContainer.setTitleOptions(TEST_VIEW_CONTAINER_TITLE_OPTIONS);
            const widget = await container.get(WidgetManager).getOrCreateWidget(TEST_WIDGET_FACTORY_ID);
            viewContainer.addWidget(widget, {
                canHide: false,
                initiallyCollapsed: false
            });
            return viewContainer;
        }
    })).inSingletonScope();



    bindViewContribution(bind, TestViewContribution);
    bind(FrontendApplicationContribution).toService(TestViewContribution);

});

export function createTestTreeContainer(parent: interfaces.Container): Container {
    const child = createTreeContainer(parent, {
        props: {
            virtualized: true,
            search: true
        },
        widget: TestTreeWidget,
    });
    return child;
}

export function createTestWidgetContainer(parent: interfaces.Container): Container {
    const child = createTestTreeContainer(parent);
    return child;
}
