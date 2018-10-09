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

import { interfaces, Container, injectable } from 'inversify';
import { MenuPath, MessageType } from '@theia/core';
import { TreeProps } from '@theia/core/lib/browser/tree';
import { SourceTreeWidget, TreeElementNode } from '@theia/core/lib/browser/source-tree';
import { ConsoleItem } from './console-session';

@injectable()
export class ConsoleContentWidget extends SourceTreeWidget {

    static CONTEXT_MENU: MenuPath = ['console-context-menu'];

    static createContainer(parent: interfaces.Container, props?: Partial<TreeProps>): Container {
        const child = SourceTreeWidget.createContainer(parent, {
            contextMenuPath: ConsoleContentWidget.CONTEXT_MENU,
            ...props
        });
        child.unbind(SourceTreeWidget);
        child.bind(ConsoleContentWidget).toSelf();
        return child;
    }

    protected createTreeElementNodeClassNames(node: TreeElementNode): string[] {
        const classNames = super.createTreeElementNodeClassNames(node);
        if (node.element) {
            const className = this.toClassName((node.element as ConsoleItem));
            if (className) {
                classNames.push(className);
            }
        }
        return classNames;
    }
    protected toClassName(item: ConsoleItem): string | undefined {
        if (item.severity === MessageType.Error) {
            return ConsoleItem.errorClassName;
        }
        if (item.severity === MessageType.Warning) {
            return ConsoleItem.warningClassName;
        }
        if (item.severity === MessageType.Info) {
            return ConsoleItem.infoClassName;
        }
        if (item.severity === MessageType.Log) {
            return ConsoleItem.logClassName;
        }
        return undefined;
    }

}
