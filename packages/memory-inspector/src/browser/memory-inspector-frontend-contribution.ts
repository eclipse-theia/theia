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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import { AbstractViewContribution, FrontendApplicationContribution, Widget } from '@theia/core/lib/browser';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { Command, CommandRegistry, MenuModelRegistry } from '@theia/core/lib/common';
import { Color } from '@theia/core/lib/common/color';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { DebugScope, DebugVariable } from '@theia/debug/lib/browser/console/debug-console-items';
import { DebugFrontendApplicationContribution } from '@theia/debug/lib/browser/debug-frontend-application-contribution';
import { DebugVariablesWidget } from '@theia/debug/lib/browser/view/debug-variables-widget';
import * as Long from 'long';
import { MemoryEditableTableWidget } from './editable-widget/memory-editable-table-widget';
import { MemoryProviderService } from './memory-provider/memory-provider-service';
import { MemoryTableWidget } from './memory-widget/memory-table-widget';
import { MemoryWidget } from './memory-widget/memory-widget';
import { RegisterTableWidget } from './register-widget/register-table-widget';
import { RegisterWidget } from './register-widget/register-widget-types';
import {
    CreateNewMemoryViewCommand, CreateNewRegisterViewCommand, FollowPointerDebugCommand, FollowPointerTableCommand, MemoryCommand,
    RegisterSetVariableCommand, ResetModifiedCellCommand, ToggleDiffSelectWidgetVisibilityCommand, ViewVariableInMemoryCommand, ViewVariableInRegisterViewCommand
} from './utils/memory-commands';
import { MemoryWidgetManager } from './utils/memory-widget-manager';
import { VariableRange } from './utils/memory-widget-variable-utils';
import { MemoryDockPanel } from './wrapper-widgets/memory-dock-panel';
import { MemoryLayoutWidget } from './wrapper-widgets/memory-layout-widget';
import { nls } from '@theia/core/lib/common/nls';

const ONE_HALF_OPACITY = 0.5;

@injectable()
export class DebugFrontendContribution extends AbstractViewContribution<MemoryLayoutWidget>
    implements FrontendApplicationContribution,
    TabBarToolbarContribution,
    ColorContribution {
    @inject(DebugFrontendApplicationContribution) protected readonly debugContribution: DebugFrontendApplicationContribution;
    @inject(MemoryWidgetManager) protected readonly memoryWidgetManager: MemoryWidgetManager;
    @inject(FrontendApplicationStateService) protected readonly stateService: FrontendApplicationStateService;
    @inject(MemoryProviderService) protected readonly memoryProvider: MemoryProviderService;

    constructor() {
        super({
            widgetId: MemoryLayoutWidget.ID,
            widgetName: MemoryLayoutWidget.LABEL,
            defaultWidgetOptions: {
                area: 'right',
            },
            toggleCommandId: MemoryCommand.id,
        });
    }

    @postConstruct()
    init(): void {
        this.stateService.reachedState('initialized_layout').then(() => {
            // Close leftover widgets from previous sessions.
            this.memoryWidgetManager.availableWidgets.forEach(widget => {
                if (!(widget.parent instanceof MemoryDockPanel)) {
                    widget.close();
                }
            });
        });
    }

    async initializeLayout(): Promise<void> {
        await this.openView({ activate: false });
    }

    override registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);
        registry.registerCommand(ViewVariableInMemoryCommand, {
            execute: async () => {
                const { selectedVariable } = this.debugContribution;
                const referenceText = this.memoryProvider.formatVariableReference(selectedVariable);
                if (referenceText) {
                    await this.openMemoryWidgetAt(referenceText);
                }
            },
            isVisible: () => {
                const { selectedVariable } = this.debugContribution;
                return Boolean(this.memoryProvider.supportsVariableReferenceSyntax(selectedVariable) && this.memoryProvider.formatVariableReference(selectedVariable));
            },
        });
        registry.registerCommand(ViewVariableInRegisterViewCommand, {
            execute: async () => {
                const name = this.debugContribution.selectedVariable?.name;
                if (name) {
                    await this.openRegisterWidgetWithReg(name);
                }
            },
            isVisible: () => {
                let { selectedVariable: currentLevel } = this.debugContribution;
                if (!currentLevel) {
                    return false;
                }
                // Make sure it looks like it has a numerical value.
                try { BigInt(currentLevel.value); } catch { return false; }
                while (currentLevel.parent instanceof DebugVariable) {
                    currentLevel = currentLevel.parent;
                }
                return currentLevel.parent instanceof DebugScope && currentLevel.parent?.['raw']?.name === 'Registers';
            },
        });
        registry.registerCommand(FollowPointerDebugCommand, {
            isVisible: () => !!this.isPointer(this.debugContribution.selectedVariable?.type),
            isEnabled: () => !!this.isPointer(this.debugContribution.selectedVariable?.type),
            execute: async () => {
                const name = this.debugContribution.selectedVariable?.name;
                if (name) {
                    await this.openMemoryWidgetAt(name);
                }
            },
        });
        registry.registerCommand(ResetModifiedCellCommand, {
            isEnabled: (widgetToActOn, address: Long) => Long.isLong(address) && widgetToActOn instanceof MemoryEditableTableWidget,
            isVisible: (widgetToActOn, address: Long) => Long.isLong(address) && widgetToActOn instanceof MemoryEditableTableWidget,
            execute: (widgetToActOn: MemoryEditableTableWidget, address: Long) => widgetToActOn.resetModifiedValue(address),
        });
        registry.registerCommand(FollowPointerTableCommand, {
            isEnabled: (widgetToActOn, address, variable?: VariableRange) => widgetToActOn instanceof MemoryTableWidget &&
                this.isPointer(variable?.type),
            isVisible: (widgetToActOn, address, variable?: VariableRange) => widgetToActOn instanceof MemoryTableWidget &&
                this.isPointer(variable?.type),
            execute: (widgetToActOn: MemoryTableWidget, address, variable: VariableRange) => {
                if (variable?.name) {
                    widgetToActOn.optionsWidget.setAddressAndGo(variable.name);
                }
            },
        });
        registry.registerCommand(CreateNewMemoryViewCommand, {
            isEnabled: w => this.withWidget(() => true, w),
            isVisible: w => this.withWidget(() => true, w),
            execute: () => this.memoryWidgetManager.createNewMemoryWidget(),
        });
        registry.registerCommand(CreateNewRegisterViewCommand, {
            isEnabled: w => this.withWidget(() => true, w),
            isVisible: w => this.withWidget(() => true, w),
            execute: () => this.memoryWidgetManager.createNewMemoryWidget('register'),
        });
        registry.registerCommand(RegisterSetVariableCommand, {
            isEnabled: (widgetToActOn, dVar: DebugVariable) => widgetToActOn instanceof RegisterTableWidget &&
                dVar && dVar.supportSetVariable,
            isVisible: (widgetToActOn, dVar: DebugVariable) => widgetToActOn instanceof RegisterTableWidget &&
                dVar && dVar.supportSetVariable,
            execute: (widgetToActOn: RegisterTableWidget, dVar: DebugVariable) => dVar && widgetToActOn.handleSetValue(dVar),
        });
        registry.registerCommand(ToggleDiffSelectWidgetVisibilityCommand, {
            isVisible: widget => this.withWidget(() => this.memoryWidgetManager.canCompare, widget),
            execute: (widget: MemoryLayoutWidget) => {
                widget.toggleComparisonVisibility();
            },
        });
    }

    protected isPointer(type?: string): boolean {
        return !!type?.includes('*');
    }

    /**
     * @param {string} addressReference Should be the exact string to be used in the address bar. I.e. it must resolve to an address value.
     */
    protected async openMemoryWidgetAt(addressReference: string): Promise<MemoryWidget> {
        await this.openView({ activate: false });
        const newWidget = await this.memoryWidgetManager.createNewMemoryWidget();
        await this.shell.activateWidget(newWidget.id);
        if (newWidget) {
            newWidget.optionsWidget.setAddressAndGo(addressReference);
        }
        return newWidget;
    }

    protected async openRegisterWidgetWithReg(name: string): Promise<MemoryWidget> {
        await this.openView({ activate: false });
        const newWidget = await this.memoryWidgetManager.createNewMemoryWidget<RegisterWidget>('register');
        await this.shell.activateWidget(newWidget.id);
        if (newWidget) {
            newWidget.optionsWidget.setRegAndUpdate(name);
        }
        return newWidget;
    }

    protected withWidget(fn: (widget: MemoryLayoutWidget) => boolean, widget: Widget | undefined = this.tryGetWidget()): boolean {
        if (widget instanceof MemoryLayoutWidget && widget.id === MemoryLayoutWidget.ID) {
            return fn(widget);
        }
        return false;
    }

    override registerMenus(registry: MenuModelRegistry): void {
        super.registerMenus(registry);
        const registerMenuActions = (menuPath: string[], ...commands: Command[]): void => {
            for (const [index, command] of commands.entries()) {
                registry.registerMenuAction(menuPath, {
                    commandId: command.id,
                    label: command.label,
                    icon: command.iconClass,
                    order: String.fromCharCode('a'.charCodeAt(0) + index),
                });
            }
        };

        registry.registerMenuAction(
            DebugVariablesWidget.WATCH_MENU,
            { commandId: ViewVariableInMemoryCommand.id, label: ViewVariableInMemoryCommand.label },
        );
        registry.registerMenuAction(
            DebugVariablesWidget.WATCH_MENU,
            { commandId: FollowPointerDebugCommand.id, label: FollowPointerDebugCommand.label },
        );
        registry.registerMenuAction(
            DebugVariablesWidget.WATCH_MENU,
            { commandId: ViewVariableInRegisterViewCommand.id, label: ViewVariableInRegisterViewCommand.label },
        );
        registry.registerMenuAction(
            MemoryEditableTableWidget.CONTEXT_MENU,
            { commandId: ResetModifiedCellCommand.id, label: ResetModifiedCellCommand.label },
        );
        registry.registerMenuAction(
            MemoryTableWidget.CONTEXT_MENU,
            { commandId: FollowPointerTableCommand.id, label: FollowPointerTableCommand.label },
        );
        registerMenuActions(
            RegisterTableWidget.CONTEXT_MENU,
            RegisterSetVariableCommand,
        );
    }

    registerToolbarItems(toolbarRegistry: TabBarToolbarRegistry): void {
        toolbarRegistry.registerItem({
            id: CreateNewMemoryViewCommand.id,
            command: CreateNewMemoryViewCommand.id,
            tooltip: CreateNewMemoryViewCommand.label,
            priority: -2,
        });
        toolbarRegistry.registerItem({
            id: CreateNewRegisterViewCommand.id,
            command: CreateNewRegisterViewCommand.id,
            tooltip: CreateNewRegisterViewCommand.label,
            priority: -1,
        });
        toolbarRegistry.registerItem({
            id: ToggleDiffSelectWidgetVisibilityCommand.id,
            command: ToggleDiffSelectWidgetVisibilityCommand.id,
            tooltip: nls.localize('theia/memory-inspector/toggleComparisonWidgetVisibility', 'Toggle Comparison Widget Visibility'),
            priority: -3,
            onDidChange: this.memoryWidgetManager.onChanged,
        });
    }

    registerColors(colorRegistry: ColorRegistry): void {
        colorRegistry.register(
            {
                id: 'memoryDiff.removedTextBackground',
                defaults: {
                    dark: Color.transparent('diffEditor.removedTextBackground', ONE_HALF_OPACITY),
                    light: Color.transparent('diffEditor.removedTextBackground', ONE_HALF_OPACITY),
                },
                description: 'A less opaque diff color for use in the Memory Inspector where various overlays may me in place at once.',
            },
            {
                id: 'memoryDiff.insertedTextBackground',
                defaults: {
                    dark: Color.transparent('diffEditor.insertedTextBackground', ONE_HALF_OPACITY),
                    light: Color.transparent('diffEditor.insertedTextBackground', ONE_HALF_OPACITY),
                },
                description: 'A less opaque diff color for use in the Memory Inspector where various overlays may me in place at once.',
            },
            {
                id: 'memoryInspector.focusBorder',
                defaults: {
                    dark: Color.transparent('focusBorder', ONE_HALF_OPACITY),
                    light: Color.transparent('focusBorder', ONE_HALF_OPACITY),
                },
                description: 'A less opaque focus border color for use in the Memory Inspector where several overlays may be in place at once.',
            },
            {
                id: 'memoryInspector.foreground',
                defaults: {
                    dark: Color.transparent('editor.foreground', ONE_HALF_OPACITY),
                    light: Color.transparent('editor.foreground', ONE_HALF_OPACITY),
                },
                description: 'A less opaque foreground text style for use in the Memory Inspector',
            },
        );
    }
}
