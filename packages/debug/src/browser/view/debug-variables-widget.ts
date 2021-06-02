/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject, postConstruct, interfaces, Container } from '@theia/core/shared/inversify';
import { MenuPath } from '@theia/core/lib/common';
import { SourceTreeWidget } from '@theia/core/lib/browser/source-tree';
import { DebugVariablesSource } from './debug-variables-source';
import { DebugViewModel } from './debug-view-model';

@injectable()
export class DebugVariablesWidget extends SourceTreeWidget {

    static CONTEXT_MENU: MenuPath = ['debug-variables-context-menu'];
    static EDIT_MENU: MenuPath = [...DebugVariablesWidget.CONTEXT_MENU, 'a_edit'];
    static WATCH_MENU: MenuPath = [...DebugVariablesWidget.CONTEXT_MENU, 'b_watch'];
    static createContainer(parent: interfaces.Container): Container {
        const child = SourceTreeWidget.createContainer(parent, {
            contextMenuPath: DebugVariablesWidget.CONTEXT_MENU,
            virtualized: false,
            scrollIfActive: true
        });
        child.bind(DebugVariablesSource).toSelf();
        child.unbind(SourceTreeWidget);
        child.bind(DebugVariablesWidget).toSelf();
        return child;
    }
    static createWidget(parent: interfaces.Container): DebugVariablesWidget {
        return DebugVariablesWidget.createContainer(parent).get(DebugVariablesWidget);
    }

    @inject(DebugViewModel)
    protected readonly viewModel: DebugViewModel;

    @inject(DebugVariablesSource)
    protected readonly variables: DebugVariablesSource;

    @postConstruct()
    protected init(): void {
        super.init();
        this.id = 'debug:variables:' + this.viewModel.id;
        this.title.label = 'Variables';
        this.toDispose.push(this.variables);
        this.source = this.variables;
    }

}
