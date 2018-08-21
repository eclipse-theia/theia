/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import {
    TreeWidget,
    ContextMenuRenderer,
    TreeModel,
    TreeNode,
    NodeProps,
    TreeProps,
    SelectableTreeNode,
    ExpandableTreeNode,
    CompositeTreeNode,
    TreeModelImpl,
    TreeImpl,
} from '@theia/core/lib/browser';
import { injectable, inject, postConstruct } from 'inversify';
import { DebugProtocol } from 'vscode-debugprotocol';
import { MenuModelRegistry } from '@theia/core/lib/common/menu';
import { CommandRegistry } from '@theia/core';
import { DebugSession } from '../debug-model';
import { DebugSelection } from '../view/debug-selection-service';
import { ExtDebugProtocol } from '../../common/debug-common';
import * as React from 'react';
import { Disposable } from '@theia/core';

/**
 * Is it used to display variables.
 */
@injectable()
export class DebugVariablesWidget extends TreeWidget {
    constructor(
        @inject(DebugSession) protected readonly debugSession: DebugSession,
        @inject(DebugSelection) protected readonly debugSelection: DebugSelection,
        @inject(TreeModel) readonly model: TreeModel,
        @inject(TreeProps) readonly treeProps: TreeProps,
        @inject(ContextMenuRenderer) readonly contextMenuRenderer: ContextMenuRenderer,
        @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry,
        @inject(MenuModelRegistry) protected readonly menuModelRegistry: MenuModelRegistry) {
        super(treeProps, model, contextMenuRenderer);

        this.id = `debug-variables-${debugSession.sessionId}`;
        this.title.label = 'Variables';
        this.addClass('theia-debug-entry');
    }

    @postConstruct()
    protected init() {
        super.init();

        this.toDisposeOnDetach.push(Disposable.create(() => this.debugSession.removeListener('variableUpdated', variableUpdateListener)));

        const variableUpdateListener = (event: ExtDebugProtocol.VariableUpdatedEvent) => this.onVariableUpdated(event);
        this.debugSession.on('variableUpdated', variableUpdateListener);
        this.toDisposeOnDetach.push(this.debugSelection.onDidSelectFrame(frame => this.onFrameSelected(frame)));
    }

    protected onFrameSelected(frame: DebugProtocol.StackFrame | undefined) {
        if (frame) {
            this.debugSelection.variable = undefined;
            this.model.root = FrameNode.create(this.debugSession.sessionId, frame.id);
        }
    }

    protected onVariableUpdated(event: ExtDebugProtocol.VariableUpdatedEvent) {
        const id = VariableNode.getId(this.debugSession.sessionId, event.body.name, event.body.parentVariablesReference);
        const variableNode = this.model.getNode(id) as VariableNode;
        Object.assign(variableNode.extVariable, event.body);
        this.model.refresh(variableNode);
    }

    protected renderTree(model: TreeModel): React.ReactNode {
        return <div><div className='theia-debug-header'>Variables</div><div className='theia-debug-variables'>{super.renderTree(model)}</div></div>;
    }

    protected renderCaption(node: TreeNode, props: NodeProps): React.ReactNode {
        if (VariableNode.is(node)) {
            return this.decorateVariableCaption(node);
        } else if (ScopeNode.is(node)) {
            return this.decorateScopeCaption(node);
        }
        return super.renderCaption(node, props);
    }

    protected decorateVariableCaption(node: VariableNode): React.ReactNode {
        return <div>{node.extVariable.name} = {node.extVariable.value}</div>;
    }

    protected decorateScopeCaption(node: ScopeNode): React.ReactNode {
        return <div>{node.scope.name}</div>;
    }
}

@injectable()
export class DebugVariableModel extends TreeModelImpl {
    constructor(@inject(DebugSelection) protected readonly debugSelection: DebugSelection) {
        super();
    }

    @postConstruct()
    protected init() {
        super.init();

        this.selectionService.onSelectionChanged((nodes: SelectableTreeNode[]) => {
            const node = nodes[0];
            if (VariableNode.is(node)) {
                this.debugSelection.variable = node.extVariable;
            } else {
                this.debugSelection.variable = undefined;
            }
        });
    }
}

@injectable()
export class DebugVariablesTree extends TreeImpl {
    constructor(@inject(DebugSession) protected readonly debugSession: DebugSession) {
        super();
    }

    protected resolveChildren(parent: CompositeTreeNode): Promise<TreeNode[]> {
        if (FrameNode.is(parent)) {
            const frameId = parent.frameId;
            if (frameId) {
                return this.debugSession.scopes({ frameId }).then(response => {
                    const scopes = response.body.scopes;
                    return scopes.map(scope => ScopeNode.create(this.debugSession.sessionId, scope, parent));
                });
            } else {
                return Promise.resolve([]);
            }
        }

        if (ScopeNode.is(parent)) {
            const parentVariablesReference = parent.scope.variablesReference;
            const args: DebugProtocol.VariablesArguments = { variablesReference: parentVariablesReference };
            return this.debugSession.variables(args).then(response => {
                const variables = response.body.variables;
                return variables.map(variable => {
                    const extVariable = { ...variable, parentVariablesReference };
                    return VariableNode.create(this.debugSession.sessionId, extVariable, parent);
                });
            });
        }

        if (VariableNode.is(parent)) {
            const parentVariablesReference = parent.extVariable.variablesReference;
            if (parentVariablesReference > 0) {
                const args: DebugProtocol.VariablesArguments = { variablesReference: parentVariablesReference };
                return this.debugSession.variables(args).then(response => {
                    const variables = response.body.variables;
                    return variables.map(variable => {
                        const extVariable = { ...variable, parentVariablesReference };
                        return VariableNode.create(this.debugSession.sessionId, extVariable, parent);
                    });
                });
            } else {
                return Promise.resolve([]);
            }
        }

        return super.resolveChildren(parent);

    }
}

export interface VariableNode extends SelectableTreeNode, ExpandableTreeNode, CompositeTreeNode {
    extVariable: ExtDebugProtocol.Variable;
}

export interface ScopeNode extends SelectableTreeNode, ExpandableTreeNode, CompositeTreeNode {
    scope: DebugProtocol.Scope;
}

export interface FrameNode extends SelectableTreeNode, ExpandableTreeNode, CompositeTreeNode {
    frameId: number | undefined;
}

namespace VariableNode {
    export function is(node: TreeNode | undefined): node is VariableNode {
        return !!node && 'extVariable' in node;
    }

    export function create(sessionId: string, extVariable: ExtDebugProtocol.Variable, parent: CompositeTreeNode | undefined): VariableNode {
        const name = extVariable.name;
        const id = createId(sessionId, extVariable.name, extVariable.parentVariablesReference);
        return {
            id, extVariable, name, parent,
            visible: true,
            expanded: false,
            selected: false,
            children: []
        };
    }

    export function getId(sessionId: string, name: string, parentVariablesReference: number): string {
        return createId(sessionId, name, parentVariablesReference);
    }
}

namespace ScopeNode {
    export function is(node: TreeNode | undefined): node is ScopeNode {
        return !!node && 'scope' in node;
    }

    export function create(sessionId: string, scope: DebugProtocol.Scope, parent: CompositeTreeNode | undefined): ScopeNode {
        const name = scope.name;
        const id = getId(sessionId, scope.name);
        return {
            id, name, parent, scope,
            visible: true,
            expanded: false,
            selected: false,
            children: []
        };
    }

    export function getId(sessionId: string, name: string): string {
        return createId(sessionId, name);
    }
}

namespace FrameNode {
    export function is(node: TreeNode | undefined): node is FrameNode {
        return !!node && 'frameId' in node;
    }

    export function create(sessionId: string, frameId: number): FrameNode {
        const id = createId(sessionId, `frame-${frameId}`);
        return {
            id, frameId,
            parent: undefined,
            name: 'Debug variable',
            visible: false,
            expanded: true,
            selected: false,
            children: []
        };
    }

    export function getId(sessionId: string, frameId: number): string {
        return createId(sessionId, `frame-${frameId}`);
    }
}

function createId(sessionId: string, itemId: string | number, parentId?: string | number): string {
    return `debug-variables-${sessionId}` + (parentId && `-${parentId}`) + `-${itemId}`;
}
