/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { interfaces } from '@theia/core/shared/inversify';
import { TerminalSearchWidget, TerminalSearchWidgetFactory } from './terminal-search-widget';
import { Terminal } from 'xterm';

export function bindTerminalSearchWidgetFactory(container: interfaces.Container): void {
    container.bind(TerminalSearchWidget).toSelf().inSingletonScope();
    container.bind(TerminalSearchWidgetFactory).toFactory(DynamicTerminalSearchWidgetFactory);
}

/**
 * `TerminalSearchWidget` must be bound.
 */
export function DynamicTerminalSearchWidgetFactory(ctx: interfaces.Context): TerminalSearchWidgetFactory {
    return terminal => {
        const child = ctx.container.createChild();
        child.bind(Terminal).toConstantValue(terminal);
        return child.get(TerminalSearchWidget);
    };
}
