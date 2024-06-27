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
import { TestTree, TestTreeWidget } from './test-tree-widget';
import { TestViewContribution, TEST_VIEW_CONTAINER_ID, TEST_VIEW_CONTAINER_TITLE_OPTIONS, TEST_VIEW_CONTEXT_MENU } from './test-view-contribution';
import { TestService, TestContribution, DefaultTestService } from '../test-service';
import { bindContributionProvider } from '@theia/core';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { TestExecutionStateManager } from './test-execution-state-manager';
import { TestResultWidget } from './test-result-widget';
import { TestOutputWidget } from './test-output-widget';
import { TestOutputViewContribution } from './test-output-view-contribution';
import { TestOutputUIModel } from './test-output-ui-model';
import { TestRunTree, TestRunTreeWidget } from './test-run-widget';
import { TestResultViewContribution } from './test-result-view-contribution';
import { TEST_RUNS_CONTEXT_MENU, TestRunViewContribution } from './test-run-view-contribution';
import { TestContextKeyService } from './test-context-key-service';
import { DefaultTestExecutionProgressService, TestExecutionProgressService } from '../test-execution-progress-service';
import { bindTestPreferences } from '../test-preferences';

export default new ContainerModule(bind => {
    bindTestPreferences(bind);
    bindContributionProvider(bind, TestContribution);
    bind(TestContextKeyService).toSelf().inSingletonScope();
    bind(TestService).to(DefaultTestService).inSingletonScope();

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: TestOutputWidget.ID,
        createWidget: () => container.get<TestOutputWidget>(TestOutputWidget)
    })).inSingletonScope();

    bind(TestOutputWidget).toSelf();

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: TestResultWidget.ID,
        createWidget: () => container.get<TestResultWidget>(TestResultWidget)
    })).inSingletonScope();

    bind(TestResultWidget).toSelf();

    bind(TestTreeWidget).toDynamicValue(({ container }) => {
        const child = createTestTreeContainer(container);
        return child.get(TestTreeWidget);
    });
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: TestTreeWidget.ID,
        createWidget: () => container.get<TestTreeWidget>(TestTreeWidget)
    })).inSingletonScope();

    bind(TestRunTreeWidget).toDynamicValue(({ container }) => {
        const child = createTestRunContainer(container);
        return child.get(TestRunTreeWidget);
    });
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: TestRunTreeWidget.ID,
        createWidget: () => container.get<TestRunTreeWidget>(TestRunTreeWidget)
    })).inSingletonScope();

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: TEST_VIEW_CONTAINER_ID,
        createWidget: async () => {
            const viewContainer = container.get<ViewContainer.Factory>(ViewContainer.Factory)({
                id: TEST_VIEW_CONTAINER_ID,
                progressLocationId: 'test'
            });
            viewContainer.setTitleOptions(TEST_VIEW_CONTAINER_TITLE_OPTIONS);
            let widget = await container.get(WidgetManager).getOrCreateWidget(TestTreeWidget.ID);
            viewContainer.addWidget(widget, {
                canHide: false,
                initiallyCollapsed: false
            });
            widget = await container.get(WidgetManager).getOrCreateWidget(TestRunTreeWidget.ID);
            viewContainer.addWidget(widget, {
                canHide: true,
                initiallyCollapsed: false,
            }); return viewContainer;
        }
    })).inSingletonScope();

    bindViewContribution(bind, TestViewContribution);
    bindViewContribution(bind, TestRunViewContribution);
    bindViewContribution(bind, TestResultViewContribution);
    bindViewContribution(bind, TestOutputViewContribution);
    bind(FrontendApplicationContribution).toService(TestViewContribution);
    bind(TabBarToolbarContribution).toService(TestViewContribution);
    bind(TabBarToolbarContribution).toService(TestRunViewContribution);
    bind(TestExecutionStateManager).toSelf().inSingletonScope();
    bind(TestOutputUIModel).toSelf().inSingletonScope();
    bind(TestExecutionProgressService).to(DefaultTestExecutionProgressService).inSingletonScope();
});

export function createTestTreeContainer(parent: interfaces.Container): Container {
    return createTreeContainer(parent, {
        tree: TestTree,
        props: {
            virtualized: false,
            search: true,
            contextMenuPath: TEST_VIEW_CONTEXT_MENU
        },
        widget: TestTreeWidget,
    });
}

export function createTestRunContainer(parent: interfaces.Container): Container {
    return createTreeContainer(parent, {
        tree: TestRunTree,
        props: {
            virtualized: false,
            search: true,
            multiSelect: false,
            contextMenuPath: TEST_RUNS_CONTEXT_MENU
        },
        widget: TestRunTreeWidget
    });
}
