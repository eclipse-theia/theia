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

import { AbstractViewContribution, Widget } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { TestRun, TestService } from '../test-service';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { TestRunTreeWidget } from './test-run-widget';
import { TEST_VIEW_CONTAINER_ID, TestViewCommands } from './test-view-contribution';
import { CommandRegistry, MenuModelRegistry, nls } from '@theia/core';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';

export const TEST_RUNS_CONTEXT_MENU = ['test-runs-context-menu'];
export const TEST_RUNS_INLINE_MENU = [...TEST_RUNS_CONTEXT_MENU, 'inline'];

@injectable()
export class TestRunViewContribution extends AbstractViewContribution<TestRunTreeWidget> implements TabBarToolbarContribution {

    @inject(TestService) protected readonly testService: TestService;
    @inject(ContextKeyService) protected readonly contextKeys: ContextKeyService;

    constructor() {
        super({
            viewContainerId: TEST_VIEW_CONTAINER_ID,
            widgetId: TestRunTreeWidget.ID,
            widgetName: nls.localize('theia/test/testRuns', 'Test Runs'),
            defaultWidgetOptions: {
                area: 'left',
                rank: 200,
            }
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: TestViewCommands.CLEAR_ALL_RESULTS.id,
            command: TestViewCommands.CLEAR_ALL_RESULTS.id,
            priority: 1
        });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        menus.registerMenuAction(TEST_RUNS_CONTEXT_MENU, {
            commandId: TestViewCommands.CANCEL_RUN.id
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(TestViewCommands.CANCEL_RUN, {
            isEnabled: t => TestRun.is(t) && t.isRunning,
            isVisible: t => TestRun.is(t),
            execute: t => {
                if (TestRun.is(t)) {
                    t.cancel();
                }
            }
        });

        commands.registerCommand(TestViewCommands.CLEAR_ALL_RESULTS, {
            isEnabled: w => this.withWidget(w, () => true),
            isVisible: w => this.withWidget(w, () => true),
            execute: () => {
                this.testService.clearResults();
            }
        });
    }

    protected withWidget<T>(widget: Widget | undefined = this.tryGetWidget(), cb: (widget: TestRunTreeWidget) => T): T | false {
        if (widget instanceof TestRunTreeWidget && widget.id === TestRunTreeWidget.ID) {
            return cb(widget);
        }
        return false;
    }
}
