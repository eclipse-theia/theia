/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import {
    TreeWidget,
    TreeImpl,
    ContextMenuRenderer,
    TreeModel,
    CompositeTreeNode,
    SelectableTreeNode,
    ExpandableTreeNode,
    TreeNode,
    NodeProps,
    TreeProps,
    TreeModelImpl
} from "@theia/core/lib/browser";
import { h } from '@phosphor/virtualdom';
import { injectable, inject, postConstruct } from "inversify";
import { DebugProtocol } from "vscode-debugprotocol";
import { MenuModelRegistry } from "@theia/core/lib/common/menu";
import { CommandRegistry } from "@theia/core";
import { DebugSession } from "../debug-session";
import { DebugSelection } from "./debug-selection-service";
import { ExtDebugProtocol } from "../../common/debug-model";

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
        this.addClass(Styles.VARIABLES_CONTAINER);
        this.debugSession.on('variableUpdated', (event: ExtDebugProtocol.ExtVariableUpdatedEvent) => this.onVariableUpdated(event));
        this.debugSelection.onDidSelectFrame(frame => this.onFrameSelected(frame));
    }

    protected onFrameSelected(frame: DebugProtocol.StackFrame | undefined) {
        if (frame) {
            this.debugSelection.variable = undefined;
            this.model.root = FrameNode.create(this.debugSession.sessionId, frame.id);
        }
    }

    protected onVariableUpdated(event: ExtDebugProtocol.ExtVariableUpdatedEvent) {
        const id = VariableNode.getId(this.debugSession.sessionId, event.body.name, event.body.parentVariablesReference);
        const variableNode = this.model.getNode(id) as VariableNode;
        Object.assign(variableNode.extVariable, event.body);
        this.model.refresh(variableNode);
    }

    protected render(): h.Child {
        const header = h.div({ className: "theia-header" }, "Variables");
        return h.div(header, super.render());
    }

    protected renderCaption(node: TreeNode, props: NodeProps): h.Child {
        if (VariableNode.is(node)) {
            return this.decorateVariableCaption(node.extVariable);
        } else if (ScopeNode.is(node)) {
            return this.decorateScopeCaption(node.scope);
        }
        return super.renderCaption(node, props);
    }

    protected decorateVariableCaption(variable: DebugProtocol.Variable): h.Child {
        return h.div(`${variable.name} = ${variable.value}`);
    }

    protected decorateScopeCaption(scope: DebugProtocol.Scope): h.Child {
        return h.div(scope.name);
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
                return this.debugSession.scopes(frameId).then(response => {
                    const scopes = response.body.scopes;
                    return scopes.map(scope => ScopeNode.create(this.debugSession.sessionId, scope, parent));
                });
            } else {
                return Promise.resolve([]);
            }
        }

        if (ScopeNode.is(parent)) {
            const parentVariablesReference = parent.scope.variablesReference;
            return this.debugSession.variables(parentVariablesReference).then(response => {
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
                return this.debugSession.variables(parentVariablesReference).then(response => {
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
    extVariable: ExtDebugProtocol.ExtVariable;
}

export interface ScopeNode extends SelectableTreeNode, ExpandableTreeNode, CompositeTreeNode {
    scope: DebugProtocol.Scope;
}

export interface FrameNode extends ExpandableTreeNode, CompositeTreeNode {
    frameId: number | undefined;
}

namespace VariableNode {
    export function is(node: TreeNode | undefined): node is VariableNode {
        return !!node && 'extVariable' in node;
    }

    export function create(sessionId: string, extVariable: ExtDebugProtocol.ExtVariable, parent?: TreeNode): VariableNode {
        const name = extVariable.name;
        const id = createId(sessionId, extVariable.name, extVariable.parentVariablesReference);
        return <VariableNode>{
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

    export function create(sessionId: string, scope: DebugProtocol.Scope, parent?: TreeNode): ScopeNode {
        const name = scope.name;
        const id = getId(sessionId, scope.name);
        return <ScopeNode>{
            id, scope, name, parent,
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

    export function create(sessionId: string, frameId: number, parent?: TreeNode): FrameNode {
        const id = createId(sessionId, `frame-${frameId}`);
        return <FrameNode>{
            id, frameId, parent,
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

namespace Styles {
    export const VARIABLES_CONTAINER = 'theia-debug-variables-container';
}
