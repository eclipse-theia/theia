/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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
import { Disposable, DisposableCollection, Emitter, MessageService } from '@theia/core';
import { ApplicationShell, OpenViewArguments, WidgetManager } from '@theia/core/lib/browser';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { MemoryDiffTableWidget, MemoryDiffWidget } from '../diff-widget/memory-diff-table-widget';
import { MemoryWidget } from '../memory-widget/memory-widget';
import { RegisterWidget } from '../register-widget/register-widget-types';
import { MemoryDiffWidgetData, MemoryWidgetOptions } from './memory-widget-utils';

@injectable()
export class MemoryWidgetManager implements Disposable {
    protected createdWidgetCount = 0;
    protected widgetDisplayId = 0;
    protected readonly toDispose = new DisposableCollection();

    @inject(WidgetManager) protected readonly widgetManager: WidgetManager;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(MessageService) protected readonly messageService: MessageService;

    protected readonly onNewWidgetCreated = new Emitter<MemoryWidget>();
    readonly onDidCreateNewWidget = this.onNewWidgetCreated.event;

    protected readonly onSelectedWidgetChanged = new Emitter<MemoryWidget | undefined>();
    readonly onDidChangeSelectedWidget = this.onSelectedWidgetChanged.event;

    protected readonly onChangedEmitter = new Emitter<void>();
    readonly onChanged = this.onChangedEmitter.event;

    protected readonly _availableWidgets = new Map<string, MemoryWidget>();
    protected _focusedWidget: MemoryWidget | undefined;
    protected _canCompare = false;

    get availableWidgets(): MemoryWidget[] {
        return Array.from(this._availableWidgets.values());
    }

    get canCompare(): boolean {
        return this._canCompare;
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.pushAll([
            this.shell.onDidChangeActiveWidget(({ newValue }) => {
                if (newValue instanceof MemoryWidget) {
                    this._focusedWidget = newValue;
                }
            }),
            this.widgetManager.onDidCreateWidget(e => {
                const { widget } = e;
                if (widget instanceof MemoryWidget) {
                    this._availableWidgets.set(widget.id, widget);
                    this.toDispose.push(widget.onDidDispose(() => {
                        this._availableWidgets.delete(widget.id);
                        if (widget === this._focusedWidget) {
                            this.focusedWidget = undefined;
                        }
                        this.onChangedEmitter.fire();
                    }));
                }
            }),
            this.onChanged(() => this.setCanCompare()),
            this.onNewWidgetCreated,
            this.onChangedEmitter,
            this.onSelectedWidgetChanged,
        ]);
    }

    get focusedWidget(): MemoryWidget | undefined {
        return this._focusedWidget ?? this._availableWidgets.values().next().value;
    }

    set focusedWidget(title: MemoryWidget | undefined) {
        this._focusedWidget = title;
        this.onSelectedWidgetChanged.fire(title);
    }

    protected setCanCompare(): void {
        this._canCompare = this.availableWidgets.filter(widget => !RegisterWidget.is(widget) && !MemoryDiffWidget.is(widget)).length > 1;
    }

    async createNewMemoryWidget<T extends MemoryWidget>(kind: 'register' | 'memory' = 'memory'): Promise<T> {
        this.widgetDisplayId = this._availableWidgets.size !== 0 ? this.widgetDisplayId + 1 : 1;
        const options: MemoryWidgetOptions = { identifier: this.createdWidgetCount += 1, displayId: this.widgetDisplayId };
        const widgetId = kind === 'memory'
            ? MemoryWidget.ID
            : RegisterWidget.ID;
        const widget = await this.widgetManager.getOrCreateWidget<T>(widgetId, options);
        this._availableWidgets.set(widget.id, widget);
        widget.title.changed.connect(() => this.onChangedEmitter.fire());
        widget.activate();
        this.fireNewWidget(widget);
        return widget;
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected fireNewWidget(widget: MemoryWidget): void {
        this.onNewWidgetCreated.fire(widget);
        this.onChangedEmitter.fire();
    }

    async doDiff(options: Omit<MemoryDiffWidgetData, 'dynamic' | 'identifier'>): Promise<MemoryDiffWidget | undefined> {
        if (options.beforeBytes.length === 0) {
            this.messageService.warn(
                `You must load memory in both widgets you would like to compare. ${options.titles[0]} has no memory loaded.`,
            );
            return undefined;
        } else if (options.afterBytes.length === 0) {
            this.messageService.warn(
                `You must load memory in both widgets you would like to compare. ${options.titles[1]} has no memory loaded.`,
            );
            return undefined;
        }

        const fullOptions: MemoryDiffWidgetData = { ...options, dynamic: false, identifier: options.titles.join('-') };

        const existingWidget = this._availableWidgets.get(MemoryWidget.getIdentifier(fullOptions.identifier.toString())) as MemoryDiffWidget;

        if (existingWidget && existingWidget.tableWidget instanceof MemoryDiffTableWidget) {
            existingWidget.tableWidget.updateDiffData(options);
        }

        const widget = existingWidget ?? await this.widgetManager
            .getOrCreateWidget<MemoryDiffWidget>(
                MemoryDiffWidget.ID,
                { ...options, dynamic: false, identifier: options.titles.join('-') },
            );

        const tabBar = this.shell.getTabBarFor(widget);
        if (!tabBar) {
            // The widget is not attached yet, so add it to the shell
            const widgetArgs: OpenViewArguments = {
                area: 'main',
            };
            await this.shell.addWidget(widget, widgetArgs);
        }
        await this.shell.activateWidget(widget.id);

        return widget;
    }
}
