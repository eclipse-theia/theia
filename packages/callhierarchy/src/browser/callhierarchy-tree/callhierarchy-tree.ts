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

import { injectable } from 'inversify';
import { TreeNode, CompositeTreeNode, SelectableTreeNode, ExpandableTreeNode, TreeImpl } from '@theia/core/lib/browser';

import { CallHierarchyService } from '../callhierarchy-service';

import { Md5 } from 'ts-md5/dist/md5';
import { DefinitionSymbol, Call, CallDirection } from '@theia/languages/lib/browser/calls/calls-protocol.proposed';

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
        if (!CallHierarchyTree.Node.is(parent)) {
            return [];
        }
        if (parent.resolved) {
            return parent.children.slice();
        }
        if (!this.callHierarchyService) {
            return [];
        }
        let definition: DefinitionSymbol | undefined;
        if (CallHierarchyTree.RootCallNode.is(parent)) {
            definition = parent.definition;
        } else if (CallHierarchyTree.CallNode.is(parent)) {
            definition = parent.call.symbol;
        }
        if (definition) {
            const direction = CallHierarchyTree.getDirection(parent);
            const result = await this.callHierarchyService.getCalls({
                position: definition.location.range.start,
                textDocument: { uri: definition.location.uri },
                direction
            });
            const { symbol, calls } = result;
            if (!symbol) {
                return [];
            }
            parent.resolved = true;
            if (calls.length === 0) {
                delete parent.expanded;
            }
            return this.toNodes(calls, parent);
        }
        return [];
    }

    protected toNodes(calls: Call[], parent: CompositeTreeNode): TreeNode[] {
        return calls.map(call => this.toNode(call, parent));
    }

    protected toNode(caller: Call, parent: CompositeTreeNode | undefined): TreeNode {
        return CallHierarchyTree.CallNode.create(caller, parent as TreeNode);
    }
}

export namespace CallHierarchyTree {
    export function getDirection(node?: TreeNode): CallDirection {
        return RootCallNode.is(node) || CallNode.is(node) ? node.direction : CallDirection.Incoming;
    }
    export interface Node extends SelectableTreeNode, ExpandableTreeNode {
        resolved: boolean;
        direction: CallDirection;
    }
    export namespace Node {
        export function is(node: TreeNode | undefined): node is Node {
            // tslint:disable-next-line:no-any
            return !!node && 'direction' in node && typeof (node as any).resolved === 'boolean';
        }
        export function create(definition: DefinitionSymbol, direction: CallDirection, idObject: object, parent: TreeNode | undefined): Node {
            const name = definition.name;
            const id = createId(idObject, parent);
            return <Node>{
                id, direction, name, parent,
                visible: true,
                children: [],
                expanded: false,
                selected: false,
                resolved: false
            };
        }
    }
    export interface RootCallNode extends Node {
        definition: DefinitionSymbol;
    }

    export namespace RootCallNode {
        export function is(node: TreeNode | undefined): node is RootCallNode {
            return Node.is(node) && 'definition' in node;
        }
        export function create(definition: DefinitionSymbol, direction: CallDirection, parent: TreeNode | undefined): RootCallNode {
            return <RootCallNode>{
                ...Node.create(definition, direction, { definition }, parent),
                definition
            };
        }
    }

    export interface CallNode extends Node {
        call: Call;
        direction: CallDirection;
    }

    export namespace CallNode {
        export function is(node: TreeNode | undefined): node is CallNode {
            return Node.is(node) && 'call' in node;
        }
        export function create(call: Call, parent: TreeNode | undefined): CallNode {
            const direction = getDirection(parent);
            return <CallNode>{
                ...Node.create(call.symbol, direction, { call }, parent),
                call
            };
        }
    }

    function createId(o: object, parent: TreeNode | undefined): string {
        const idPrefix = (parent) ? parent.id + '/' : '';
        const id = idPrefix + Md5.hashStr(JSON.stringify(o));
        return id;
    }
}
