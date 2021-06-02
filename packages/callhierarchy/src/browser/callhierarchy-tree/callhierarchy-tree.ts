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

import { injectable } from '@theia/core/shared/inversify';
import { TreeNode, CompositeTreeNode, SelectableTreeNode, ExpandableTreeNode, TreeImpl } from '@theia/core/lib/browser';

import { Definition, Caller } from '../callhierarchy';
import { CallHierarchyService } from '../callhierarchy-service';

import { Md5 } from 'ts-md5/dist/md5';
import { CancellationTokenSource } from '@theia/core/lib/common/cancellation';

@injectable()
export class CallHierarchyTree extends TreeImpl {

    protected _callHierarchyService: CallHierarchyService | undefined;

    set callHierarchyService(callHierarchyService: CallHierarchyService | undefined) {
        this._callHierarchyService = callHierarchyService;
    }

    get callHierarchyService(): CallHierarchyService | undefined {
        return this._callHierarchyService;
    }

    async resolveChildren(parent: CompositeTreeNode): Promise<TreeNode[]> {
        if (!this.callHierarchyService) {
            return Promise.resolve([]);
        }
        if (parent.children.length > 0) {
            return Promise.resolve([...parent.children]);
        }
        let definition: Definition | undefined;
        if (DefinitionNode.is(parent)) {
            definition = parent.definition;
        } else if (CallerNode.is(parent)) {
            definition = parent.caller.callerDefinition;
        }
        if (definition) {
            const cancellationSource = new CancellationTokenSource();
            const callers = await this.callHierarchyService.getCallers(definition, cancellationSource.token);
            if (!callers) {
                return Promise.resolve([]);
            }
            return this.toNodes(callers, parent);
        }
        return Promise.resolve([]);
    }

    protected toNodes(callers: Caller[], parent: CompositeTreeNode): TreeNode[] {
        return callers.map(caller => this.toNode(caller, parent));
    }

    protected toNode(caller: Caller, parent: CompositeTreeNode | undefined): TreeNode {
        return CallerNode.create(caller, parent as TreeNode);
    }
}

export interface DefinitionNode extends SelectableTreeNode, ExpandableTreeNode {
    definition: Definition;
}

export namespace DefinitionNode {
    export function is(node: TreeNode | undefined): node is DefinitionNode {
        return !!node && 'definition' in node;
    }

    export function create(definition: Definition, parent: TreeNode | undefined): DefinitionNode {
        const name = definition.symbolName;
        const id = createId(definition, parent);
        return <DefinitionNode>{
            id, definition, name, parent,
            visible: true,
            children: [],
            expanded: false,
            selected: false,
        };
    }
}

export interface CallerNode extends SelectableTreeNode, ExpandableTreeNode {
    caller: Caller;
}

export namespace CallerNode {
    export function is(node: TreeNode | undefined): node is CallerNode {
        return !!node && 'caller' in node;
    }

    export function create(caller: Caller, parent: TreeNode | undefined): CallerNode {
        const callerDefinition = caller.callerDefinition;
        const name = callerDefinition.symbolName;
        const id = createId(callerDefinition, parent);
        return <CallerNode>{
            id, caller, name, parent,
            visible: true,
            children: [],
            expanded: false,
            selected: false,
        };
    }
}

function createId(definition: Definition, parent: TreeNode | undefined): string {
    const idPrefix = (parent) ? parent.id + '/' : '';
    const id = idPrefix + Md5.hashStr(JSON.stringify(definition));
    return id;
}
