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
    TreeProps
} from "@theia/core/lib/browser";
import { h } from '@phosphor/virtualdom';
import { injectable, inject } from "inversify";
import { DebugSession } from "../debug-session";
import { DebugProtocol } from "vscode-debugprotocol/lib/debugProtocol";
import { Md5 } from "ts-md5";

/**
 * Is it used to display variables.
 */
@injectable()
export class DebugVariablesWidget extends TreeWidget {
    private _frameId: number | undefined;

    constructor(
        @inject(DebugSession) protected readonly debugSession: DebugSession,
        @inject(TreeModel) readonly model: TreeModel,
        @inject(TreeProps) readonly treeProps: TreeProps,
        @inject(ContextMenuRenderer) readonly contextMenuRenderer: ContextMenuRenderer) {
        super(treeProps, model, contextMenuRenderer);

        this.id = `debug-variables-${debugSession.sessionId}`;
        this.title.label = 'Variables';
        this.addClass(Styles.VARIABLES_CONTAINER);
    }

    get frameId(): number | undefined {
        return this._frameId;
    }

    set frameId(frameId: number | undefined) {
        if (this._frameId === frameId) {
            return;
        }

        this._frameId = frameId;
        this.model.root = FrameNode.create(this.debugSession.sessionId, frameId);
    }

    protected render(): h.Child {
        const header = h.div({ className: "theia-header" }, "Variables");
        return h.div(header, super.render());
    }

    protected renderCaption(node: TreeNode, props: NodeProps): h.Child {
        if (VariableNode.is(node)) {
            return this.decorateVariableCaption(node.variable);
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
                    return scopes.map(scope => ScopeNode.create(scope, parent));
                });
            } else {
                return Promise.resolve([]);
            }
        }

        if (ScopeNode.is(parent)) {
            return this.debugSession.variables(parent.scope.variablesReference).then(response => {
                const variables = response.body.variables;
                return variables.map(variable => VariableNode.create(variable, parent));
            });
        }

        if (VariableNode.is(parent)) {
            const variablesReference = parent.variable.variablesReference;
            if (variablesReference > 0) {
                return this.debugSession.variables(parent.variable.variablesReference).then(response => {
                    const variables = response.body.variables;
                    return variables.map(variable => VariableNode.create(variable, parent));
                });
            } else {
                return Promise.resolve([]);
            }
        }

        return super.resolveChildren(parent);
    }
}

export interface VariableNode extends SelectableTreeNode, ExpandableTreeNode, CompositeTreeNode {
    variable: DebugProtocol.Variable;
}

export interface ScopeNode extends SelectableTreeNode, ExpandableTreeNode, CompositeTreeNode {
    scope: DebugProtocol.Scope;
}

export interface FrameNode extends ExpandableTreeNode, CompositeTreeNode {
    frameId: number | undefined;
}

namespace VariableNode {
    export function is(node: TreeNode | undefined): node is VariableNode {
        return !!node && 'variable' in node;
    }

    export function create(variable: DebugProtocol.Variable, parent?: TreeNode): VariableNode {
        const name = variable.name;
        const id = createId(variable, parent);
        return <VariableNode>{
            id, variable, name, parent,
            visible: true,
            expanded: false,
            selected: false,
            children: []
        };
    }
}

namespace ScopeNode {
    export function is(node: TreeNode | undefined): node is ScopeNode {
        return !!node && 'scope' in node;
    }

    export function create(scope: DebugProtocol.Scope, parent?: TreeNode): ScopeNode {
        const name = scope.name;
        const id = createId(scope);
        return <ScopeNode>{
            id, scope, name, parent,
            visible: true,
            expanded: false,
            selected: false,
            children: []
        };
    }
}

namespace FrameNode {
    export function is(node: TreeNode | undefined): node is FrameNode {
        return !!node && 'frameId' in node;
    }

    export function create(sessionId: string, frameId: number | undefined, parent?: TreeNode): FrameNode {
        return <FrameNode>{
            frameId, parent,
            id: `debug-variables-root-${sessionId}`,
            name: 'Debug variable',
            visible: false,
            expanded: true,
            selected: false,
            children: []
        };
    }
}

function createId(object: Object, parent?: TreeNode): string {
    const idPrefix = parent ? parent.id + '-' : '';
    const id = idPrefix + Md5.hashStr(JSON.stringify(object));
    return id;
}

namespace Styles {
    export const VARIABLES_CONTAINER = 'theia-debug-variables-container';
}
