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
import { TreeNode, NodeProps } from '@theia/core/lib/browser';
import { SourceTreeWidget } from '@theia/core/lib/browser/source-tree';
import { DebugBreakpointsSource } from './debug-breakpoints-source';
import { BreakpointManager } from '../breakpoint/breakpoint-manager';
import { DebugViewModel } from './debug-view-model';

@injectable()
export class DebugBreakpointsWidget extends SourceTreeWidget {

    static CONTEXT_MENU: MenuPath = ['debug-breakpoints-context-menu'];
    static EDIT_MENU = [...DebugBreakpointsWidget.CONTEXT_MENU, 'a_edit'];
    static REMOVE_MENU = [...DebugBreakpointsWidget.CONTEXT_MENU, 'b_remove'];
    static ENABLE_MENU = [...DebugBreakpointsWidget.CONTEXT_MENU, 'c_enable'];
    static createContainer(parent: interfaces.Container): Container {
        const child = SourceTreeWidget.createContainer(parent, {
            contextMenuPath: DebugBreakpointsWidget.CONTEXT_MENU,
            virtualized: false,
            scrollIfActive: true
        });
        child.bind(DebugBreakpointsSource).toSelf();
        child.unbind(SourceTreeWidget);
        child.bind(DebugBreakpointsWidget).toSelf();
        return child;
    }
    static createWidget(parent: interfaces.Container): DebugBreakpointsWidget {
        return DebugBreakpointsWidget.createContainer(parent).get(DebugBreakpointsWidget);
    }

    @inject(DebugViewModel)
    protected readonly viewModel: DebugViewModel;

    @inject(BreakpointManager)
    protected readonly breakpoints: BreakpointManager;

    @inject(DebugBreakpointsSource)
    protected readonly breakpointsSource: DebugBreakpointsSource;

    @postConstruct()
    protected init(): void {
        super.init();
        this.id = 'debug:breakpoints:' + this.viewModel.id;
        this.title.label = 'Breakpoints';
        this.toDispose.push(this.breakpointsSource);
        this.source = this.breakpointsSource;
    }

    protected getDefaultNodeStyle(node: TreeNode, props: NodeProps): React.CSSProperties | undefined {
        return undefined;
    }

}
