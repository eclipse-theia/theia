// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { injectable, interfaces } from '@theia/core/shared/inversify';
import { AbstractViewContribution, bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { Command, CommandRegistry } from '@theia/core/lib/common';
import { codicon, Widget, WidgetFactory } from '@theia/core/lib/browser';
import { SampleExtractableView } from './sample-extractable-view';

export const SampleToggleColorsCommand: Command = {
    id: 'sample.extractable.toggleColors',
    iconClass: codicon('symbol-color'),
    category: 'API Samples',
    label: 'Toggle Extractable View Colors'
};

@injectable()
export class SampleExtractableViewContribution extends AbstractViewContribution<SampleExtractableView> implements TabBarToolbarContribution {

    static readonly TOGGLE_COMMAND_ID = 'sampleExtractableView:toggle';

    constructor() {
        super({
            widgetId: SampleExtractableView.ID,
            widgetName: 'Sample Extractable View',
            toggleCommandId: SampleExtractableViewContribution.TOGGLE_COMMAND_ID,
            defaultWidgetOptions: {
                area: 'main'
            }
        });
    }

    override registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);
        registry.registerCommand(SampleToggleColorsCommand, {
            execute: async () => {
                const widget = await this.openView({ activate: true });
                widget.toggleColors();
            },
            isEnabled: widget => this.withWidget(widget, () => true),
            isVisible: widget => this.withWidget(widget, () => true)
        });
    }

    async registerToolbarItems(toolbarRegistry: TabBarToolbarRegistry): Promise<void> {
        toolbarRegistry.registerItem({
            id: SampleToggleColorsCommand.id,
            command: SampleToggleColorsCommand.id,
            tooltip: 'Toggle Colors',
            priority: 0
        });
    }

    protected withWidget<T>(widget: Widget | undefined = this.tryGetWidget(), cb: (sampleView: SampleExtractableView) => T): T | false {
        if (widget instanceof SampleExtractableView && widget.id === SampleExtractableView.ID) {
            return cb(widget);
        }
        return false;
    }
}

export const bindSampleExtractableView = (bind: interfaces.Bind): void => {
    bindViewContribution(bind, SampleExtractableViewContribution);
    bind(TabBarToolbarContribution).to(SampleExtractableViewContribution).inSingletonScope();
    bind(SampleExtractableView).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SampleExtractableView.ID,
        createWidget: () => ctx.container.get<SampleExtractableView>(SampleExtractableView)
    }));
};
