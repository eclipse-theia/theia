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
    AbstractViewContribution,
    SelectableTreeNode,
    CompositeTreeNode,
    ExpandableTreeNode,
    TreeNode,
    VirtualWidget
} from "@theia/core/lib/browser";
import { DebugSessionManager } from "../debug-session";
import { inject, injectable } from "inversify";
import { h } from '@phosphor/virtualdom';

export const DEBUG_FACTORY_ID = 'debug';

export interface DebugSessionNode extends CompositeTreeNode, SelectableTreeNode, ExpandableTreeNode {
    sessionId: string;
}

export namespace DebugSessionNode {
    export function is(node: TreeNode): node is DebugSessionNode {
        return !!node && SelectableTreeNode.is(node) && 'sessionId' in node;
    }
}

@injectable()
export class DebugWidget extends VirtualWidget {
    constructor() {
        super();
        this.id = DEBUG_FACTORY_ID;
        this.title.label = 'Debug';
    }

    protected render(): h.Child {
        return null;
    }
}

@injectable()
export class DebugViewContribution extends AbstractViewContribution<DebugWidget> {
    constructor(
        @inject(DebugSessionManager) protected readonly debugSessionManager: DebugSessionManager) {
        super({
            widgetId: DEBUG_FACTORY_ID,
            widgetName: 'Debug',
            defaultWidgetOptions: {
                area: 'bottom',
                rank: 500
            },
            toggleCommandId: 'debug.view.toggle',
            toggleKeybinding: 'ctrlcmd+alt+d'
        });
    }

    protected onStart(): void {
        this.debugSessionManager.onDidChangeActiveDebugSession(debugSession => { });
        this.debugSessionManager.onDidStartDebugSession(debugSession => { });
        this.debugSessionManager.onDidTerminateDebugSession(debugSession => { });
    }
}
