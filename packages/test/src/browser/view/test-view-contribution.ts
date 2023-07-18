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

import { AbstractViewContribution, FrontendApplicationContribution, LabelProvider, ViewContainerTitleOptions, codicon } from '@theia/core/lib/browser';
import { TestWidget } from './test-widget';
import { DisposableCollection, nls } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { TestService } from '../test-service';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';

export const TEST_WIDGET_FACTORY_ID = TestWidget.ID;
export const TEST_VIEW_CONTAINER_ID = 'test-view-container';
export const TEST_VIEW_CONTAINER_TITLE_OPTIONS: ViewContainerTitleOptions = {
    label: nls.localizeByDefault('Testing'),
    iconClass: codicon('beaker'),
    closeable: true
};

@injectable()
export class TestViewContribution extends AbstractViewContribution<TestWidget> implements
    FrontendApplicationContribution {

    @inject(TestService) protected readonly testService: TestService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(ContextKeyService) protected readonly contextKeys: ContextKeyService;

    constructor() {
        super({
            viewContainerId: TEST_VIEW_CONTAINER_ID,
            widgetId: TEST_WIDGET_FACTORY_ID,
            widgetName: TEST_VIEW_CONTAINER_TITLE_OPTIONS.label,
            defaultWidgetOptions: {
                area: 'left',
                rank: 600,

            }
        });
    }

    async initializeLayout(): Promise<void> {
        await this.openView({ activate: false });
    }

    onStart(): void {
        this.updateStatusBar();
        this.testService.onControllersChanged(() => this.updateStatusBar());
        this.labelProvider.onDidChange(() => this.updateStatusBar());
    }

    protected readonly statusBarDisposable = new DisposableCollection();
    protected updateStatusBar(): void {
        this.statusBarDisposable.dispose();
        // does something when controllers or tests have changed?

    }
}
