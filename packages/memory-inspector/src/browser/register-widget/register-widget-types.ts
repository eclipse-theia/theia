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
import { interfaces } from '@theia/core/shared/inversify';
import { MemoryOptionsWidget } from '../memory-widget/memory-options-widget';
import { MemoryTableWidget } from '../memory-widget/memory-table-widget';
import { MemoryWidget } from '../memory-widget/memory-widget';
import { MemoryWidgetOptions } from '../utils/memory-widget-utils';
import { RegisterFilterService, RegisterFilterServiceImpl, RegisterFilterServiceOptions } from './register-filter-service';
import { RegisterOptionsWidget } from './register-options-widget';
import { RegisterTableWidget } from './register-table-widget';

export type RegisterWidget = MemoryWidget<RegisterOptionsWidget, RegisterTableWidget>;
export namespace RegisterWidget {
    export const ID = 'register-view-options-widget';
    export const LABEL = nls.localize('theia/memory-inspector/register', 'Register');
    export const is = (widget: MemoryWidget): boolean => widget.optionsWidget instanceof RegisterOptionsWidget;

    export const createContainer = (
        parent: interfaces.Container,
        optionsWidget: interfaces.ServiceIdentifier<MemoryOptionsWidget>,
        tableWidget: interfaces.ServiceIdentifier<MemoryTableWidget>,
        optionSymbol: interfaces.ServiceIdentifier<MemoryWidgetOptions | undefined> = MemoryWidgetOptions,
        options?: MemoryWidgetOptions,
    ): interfaces.Container => {
        const child = MemoryWidget.createContainer(parent, optionsWidget, tableWidget, optionSymbol, options);
        child.bind(RegisterFilterService).to(RegisterFilterServiceImpl).inSingletonScope();
        child.bind(RegisterFilterServiceOptions).toConstantValue({});
        return child;
    };
}
