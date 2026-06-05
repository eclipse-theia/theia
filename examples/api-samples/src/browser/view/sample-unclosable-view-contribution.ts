// *****************************************************************************
// Copyright (C) 2020 TORO Limited and others.
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

import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { AbstractViewContribution, bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { Command, CommandRegistry, MessageService } from '@theia/core/lib/common';
import { ApplicationShell, codicon, DockLayout, ShellLayoutTransformer, Widget, WidgetFactory } from '@theia/core/lib/browser';
import { SampleViewUnclosableView } from './sample-unclosable-view';

export const SampleToolBarCommand: Command = {
    id: 'sample.toggle.toolbarCommand',
    iconClass: codicon('add'),
    category: 'API Samples'
};

@injectable()
export class SampleUnclosableViewContribution extends AbstractViewContribution<SampleViewUnclosableView> implements TabBarToolbarContribution, ShellLayoutTransformer {

    static readonly SAMPLE_UNCLOSABLE_VIEW_TOGGLE_COMMAND_ID = 'sampleUnclosableView:toggle';

    protected toolbarItemState = false;

    @inject(MessageService) protected readonly messageService: MessageService;

    constructor() {
        super({
            widgetId: SampleViewUnclosableView.ID,
            widgetName: 'Sample Unclosable View',
            toggleCommandId: SampleUnclosableViewContribution.SAMPLE_UNCLOSABLE_VIEW_TOGGLE_COMMAND_ID,
            defaultWidgetOptions: {
                area: 'main'
            }
        });
    }

    override registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);
        registry.registerCommand(SampleToolBarCommand, {
            execute: () => {
                this.toolbarItemState = !this.toolbarItemState;
                this.messageService.info(`Sample Toolbar Command is toggled = ${this.toolbarItemState}`);
            },
            isEnabled: widget => this.withWidget(widget, () => true),
            isVisible: widget => this.withWidget(widget, () => true),
            isToggled: () => this.toolbarItemState
        });
    }

    async registerToolbarItems(toolbarRegistry: TabBarToolbarRegistry): Promise<void> {
        toolbarRegistry.registerItem({
            id: SampleToolBarCommand.id,
            command: SampleToolBarCommand.id,
            tooltip: 'API Samples: Click to Toggle Toolbar Item',
            priority: 0
        });
    }

    protected withWidget<T>(widget: Widget | undefined = this.tryGetWidget(), cb: (sampleView: SampleViewUnclosableView) => T): T | false {
        if (widget instanceof SampleViewUnclosableView && widget.id === SampleViewUnclosableView.ID) {
            return cb(widget);
        }
        return false;
    }

    // Makes sure the 'Sample Unclosable View' view is never restored after app restarts.
    transformLayoutOnRestore(layoutData: ApplicationShell.LayoutData): void {
        this.pruneConfig(layoutData.mainPanel?.main);
    }

    protected pruneConfig(area: DockLayout.AreaConfig | null | undefined): void {
        if (area?.type === 'tab-area') {
            this.pruneTabConfig(area);
        } else if (area?.type === 'split-area') {
            this.pruneSplitConfig(area);
        }
    }

    protected pruneTabConfig(area: DockLayout.AreaConfig): void {
        if (area.type === 'tab-area') {
            const newwidgets = area.widgets.filter(widget => {
                if (widget.id.startsWith(SampleViewUnclosableView.ID)) {
                    return false;
                }
                return true;
            });
            area.widgets = newwidgets;
        }
    }

    protected pruneSplitConfig(area: DockLayout.AreaConfig): void {
        if (area.type === 'split-area') {
            area.children.forEach(c => this.pruneConfig(c));
        }
    }
}

export const bindSampleUnclosableView = (bind: interfaces.Bind) => {
    bindViewContribution(bind, SampleUnclosableViewContribution);
    bind(TabBarToolbarContribution).to(SampleUnclosableViewContribution).inSingletonScope();
    bind(SampleViewUnclosableView).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SampleViewUnclosableView.ID,
        createWidget: () => ctx.container.get<SampleViewUnclosableView>(SampleViewUnclosableView)
    }));
    bind(ShellLayoutTransformer).toService(SampleUnclosableViewContribution);
};
