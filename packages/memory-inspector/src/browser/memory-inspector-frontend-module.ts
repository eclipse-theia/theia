/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import '../../src/browser/style/index.css';
import '../../src/browser/utils/multi-select-bar.css';
import '../../src/browser/register-widget/register-widget.css';
import { ContainerModule } from '@theia/core/shared/inversify';
import { bindViewContribution, WidgetFactory, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { DefaultMemoryProvider, MemoryProvider } from './memory-provider/memory-provider';
import { MemoryWidgetManager } from './utils/memory-widget-manager';
import { MemoryInspectorFrontendContribution } from './memory-inspector-frontend-contribution';
import { MemoryDiffWidgetData, MemoryWidgetOptions, RegisterWidgetOptions } from './utils/memory-widget-utils';
import { MemoryDiffOptionsWidget } from './diff-widget/memory-diff-options-widget';
import { MemoryDiffSelectWidget } from './diff-widget/memory-diff-select-widget';
import { MemoryDiffWidget, MemoryDiffTableWidget } from './diff-widget/memory-diff-table-widget';
import { EditableMemoryWidget, MemoryEditableTableWidget } from './editable-widget/memory-editable-table-widget';
import { MemoryHoverRendererService } from './utils/memory-hover-renderer';
import { MemoryLayoutWidget } from './wrapper-widgets/memory-layout-widget';
import { RegisterOptionsWidget } from './register-widget/register-options-widget';
import { RegisterWidget } from './register-widget/register-widget-types';
import { RegisterTableWidget } from './register-widget/register-table-widget';
import { MemoryTableWidget } from './memory-widget/memory-table-widget';
import { MemoryOptionsWidget } from './memory-widget/memory-options-widget';
import { MemoryWidget } from './memory-widget/memory-widget';
import { MemoryDockPanel } from './wrapper-widgets/memory-dock-panel';
import { MemoryDockpanelPlaceholder } from './wrapper-widgets/memory-dockpanel-placeholder-widget';
import { MemoryProviderService } from './memory-provider/memory-provider-service';
import { CDTGDBMemoryProvider } from './memory-provider/cdt-gdb-memory-provider';
import { bindContributionProvider } from '@theia/core';

// eslint-disable-next-line max-lines-per-function
export default new ContainerModule(bind => {
    bindViewContribution(bind, MemoryInspectorFrontendContribution);
    bind(ColorContribution).toService(MemoryInspectorFrontendContribution);
    bind(TabBarToolbarContribution).toService(MemoryInspectorFrontendContribution);
    bind(FrontendApplicationContribution).toService(MemoryInspectorFrontendContribution);

    bind(MemoryProviderService).toSelf().inSingletonScope();
    bind(DefaultMemoryProvider).toSelf().inSingletonScope();
    bindContributionProvider(bind, MemoryProvider);
    bind(MemoryProvider).to(CDTGDBMemoryProvider).inSingletonScope();
    bind(MemoryLayoutWidget).toSelf().inSingletonScope();
    bind(MemoryDiffSelectWidget).toSelf().inSingletonScope();
    bind(MemoryDockpanelPlaceholder).toSelf().inSingletonScope();
    bind(MemoryHoverRendererService).toSelf().inSingletonScope();
    bind(MemoryWidgetManager).toSelf().inSingletonScope();

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: MemoryDockPanel.ID,
        createWidget: (): MemoryDockPanel => MemoryDockPanel.createWidget(container),
    }));

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: MemoryLayoutWidget.ID,
        createWidget: (): MemoryLayoutWidget => container.get(MemoryLayoutWidget),
    })).inSingletonScope();

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: MemoryWidget.ID,
        createWidget: (options: MemoryWidgetOptions): MemoryWidget => MemoryWidget.createWidget<MemoryOptionsWidget, MemoryTableWidget>(
            container,
            MemoryOptionsWidget,
            MemoryTableWidget,
            MemoryWidgetOptions,
            options,
        ),
    }));

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: EditableMemoryWidget.ID,
        createWidget: (options: MemoryWidgetOptions): EditableMemoryWidget => MemoryWidget
            .createWidget<MemoryOptionsWidget, MemoryEditableTableWidget>(
                container,
                MemoryOptionsWidget,
                MemoryEditableTableWidget,
                MemoryWidgetOptions,
                options,
            ),
    }));

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: MemoryDiffWidget.ID,
        createWidget: (options: MemoryDiffWidgetData): MemoryDiffWidget => MemoryWidget
            .createWidget<MemoryDiffOptionsWidget, MemoryDiffTableWidget>(
                container,
                MemoryDiffOptionsWidget,
                MemoryDiffTableWidget,
                MemoryDiffWidgetData,
                options,
            ),
    }));

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: RegisterWidget.ID,
        createWidget: (options: RegisterWidgetOptions): RegisterWidget => RegisterWidget
            .createContainer(
                container,
                RegisterOptionsWidget,
                RegisterTableWidget,
                RegisterWidgetOptions,
                options,
            ).get(MemoryWidget),
    }));
});
