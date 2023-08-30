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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import { nls } from '@theia/core';
import { BaseWidget, PanelLayout } from '@theia/core/lib/browser';
import { Container, inject, injectable, interfaces, postConstruct } from '@theia/core/shared/inversify';
import { MemoryWidgetOptions } from '../utils/memory-widget-utils';
import { MemoryOptionsWidget } from './memory-options-widget';
import { MemoryTableWidget } from './memory-table-widget';

@injectable()
export class MemoryWidget<
    O extends MemoryOptionsWidget = MemoryOptionsWidget,
    T extends MemoryTableWidget = MemoryTableWidget
>
    extends BaseWidget {
    static readonly ID = 'memory-view-wrapper';
    static readonly LABEL = nls.localize('theia/memory-inspector/memoryTitle', 'Memory');

    @inject(MemoryWidgetOptions) protected readonly memoryWidgetOptions: MemoryWidgetOptions;
    @inject(MemoryOptionsWidget) readonly optionsWidget: O;
    @inject(MemoryTableWidget) readonly tableWidget: T;

    static createWidget<
        Options extends MemoryOptionsWidget = MemoryOptionsWidget,
        Table extends MemoryTableWidget = MemoryTableWidget
    >(
        parent: interfaces.Container,
        optionsWidget: interfaces.ServiceIdentifier<Options>,
        tableWidget: interfaces.ServiceIdentifier<Table>,
        optionSymbol: interfaces.ServiceIdentifier<MemoryWidgetOptions> = MemoryWidgetOptions,
        options?: MemoryWidgetOptions,
    ): MemoryWidget<Options, Table> {
        const child = MemoryWidget.createContainer(parent, optionsWidget, tableWidget, optionSymbol, options);
        return child.get(MemoryWidget);
    }

    static createContainer(
        parent: interfaces.Container,
        optionsWidget: interfaces.ServiceIdentifier<MemoryOptionsWidget>,
        tableWidget: interfaces.ServiceIdentifier<MemoryTableWidget>,
        optionSymbol: interfaces.ServiceIdentifier<MemoryWidgetOptions | undefined> = MemoryWidgetOptions,
        options?: MemoryWidgetOptions,
    ): interfaces.Container {
        const child = new Container({ defaultScope: 'Singleton' });
        child.parent = parent;
        child.bind(optionsWidget).toSelf();
        child.bind(tableWidget).toSelf();
        child.bind(MemoryWidgetOptions).toConstantValue(options);
        if (optionsWidget !== MemoryOptionsWidget) {
            child.bind(MemoryOptionsWidget).toService(optionsWidget);
        }
        if (tableWidget !== MemoryTableWidget) {
            child.bind(MemoryTableWidget).toService(tableWidget);
        }
        if (optionSymbol !== MemoryWidgetOptions) {
            child.bind(optionSymbol).toConstantValue(options);
        }
        child.bind(MemoryWidget).toSelf();
        return child;
    }

    static getIdentifier(optionsWidgetID: string): string {
        return `${MemoryWidget.ID}-${optionsWidgetID}`;
    }

    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        this.id = MemoryWidget.getIdentifier(this.memoryWidgetOptions.identifier.toString());
        this.addClass(MemoryWidget.ID);

        this.title.label = this.optionsWidget.title.label;
        this.title.caption = this.optionsWidget.title.caption;
        this.title.iconClass = this.optionsWidget.title.iconClass;
        this.title.closable = this.optionsWidget.title.closable;

        const layout = this.layout = new PanelLayout();
        layout.addWidget(this.optionsWidget);
        layout.addWidget(this.tableWidget);

        this.toDispose.pushAll([
            this.layout,
            this.optionsWidget,
            this.tableWidget,
        ]);

        this.optionsWidget.title.changed.connect(title => {
            this.title.label = title.label;
            this.title.caption = title.caption;
            this.title.iconClass = title.iconClass;
        });
    }

    protected override onActivateRequest(): void {
        this.optionsWidget.activate();
    }
}
