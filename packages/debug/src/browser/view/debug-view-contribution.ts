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
    AbstractViewContribution,
    SelectableTreeNode,
    CompositeTreeNode,
    ExpandableTreeNode,
    TreeNode,
    TreeModel,
    TreeProps,
    ContextMenuRenderer,
    WidgetFactory,
    Widget
} from "@theia/core/lib/browser";
import { DebugClientManager } from "../debug-client";
import { inject, injectable } from "inversify";
import { Emitter, Event, DisposableCollection} from "@theia/core";
import { Message } from '@phosphor/messaging';

const DEBUG_NAVIGATOR_ID = 'debug-view';

export interface DebugSessionNode extends CompositeTreeNode, SelectableTreeNode, ExpandableTreeNode {
    sessionId: string;
}

export namespace DebugSessionNode {
    export function is(node: TreeNode): node is DebugSessionNode {
        return !!node && SelectableTreeNode.is(node) && 'sessionId' in node;
    }
}

export type DebugTreeWidgetFactory = () => DebugTreeWidget;
export const DebugTreeWidgetFactory = Symbol('DebugTreeWidgetFactory');

/**
 * Debug tree widget.
 */
@injectable()
export class DebugTreeWidget extends TreeWidget {
    readonly onDidChangeOpenStateEmitter = new Emitter<boolean>();

    constructor(
        @inject(TreeModel) model: TreeModel,
        @inject(TreeProps) protected readonly treeProps: TreeProps,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer
    ) {
        super(treeProps, model, contextMenuRenderer);

        this.id = 'debug-view';
        this.title.label = 'Debug';
    }

    public setNodes(nodes: DebugSessionNode[]) {
        this.model.root = <CompositeTreeNode>{
            id: 'debug-view-root',
            name: 'Debug Root',
            visible: false,
            children: nodes,
            parent: undefined
        };
    }

    protected isExpandable(node: TreeNode): node is ExpandableTreeNode {
        return ExpandableTreeNode.is(node) && node.children && node.children.length > 0;
    }

    protected onAfterHide(msg: Message) {
        super.onAfterHide(msg);
        this.onDidChangeOpenStateEmitter.fire(false);
    }

    protected onAfterShow(msg: Message) {
        super.onAfterShow(msg);
        this.onDidChangeOpenStateEmitter.fire(true);
    }
}

@injectable()
export class DebugWidgetFactory implements WidgetFactory {
    id = 'debug-view';

    protected widget?: DebugTreeWidget;
    protected readonly onDidChangeOpenStateEmitter = new Emitter<boolean>();
    protected readonly onDidSelectEmitter = new Emitter<DebugSessionNode>();
    protected readonly onDidOpenEmitter = new Emitter<DebugSessionNode>();

    constructor(@inject(DebugTreeWidgetFactory) protected factory: DebugTreeWidgetFactory) { }

    get onDidSelect(): Event<DebugSessionNode> {
        return this.onDidSelectEmitter.event;
    }

    get onDidOpen(): Event<DebugSessionNode> {
        return this.onDidOpenEmitter.event;
    }

    get onDidChangeOpenState(): Event<boolean> {
        return this.onDidChangeOpenStateEmitter.event;
    }

    get open(): boolean {
        return this.widget !== undefined && this.widget.isVisible;
    }

    setNodes(nodes: DebugSessionNode[]): void {
        if (this.widget) {
            this.widget.setNodes(nodes);
        }
    }

    createWidget(): Promise<Widget> {
        this.widget = this.factory();
        const disposables = new DisposableCollection();
        disposables.push(this.widget.onDidChangeOpenStateEmitter.event(open => this.onDidChangeOpenStateEmitter.fire(open)));
        disposables.push(this.widget.model.onOpenNode(node => this.onDidOpenEmitter.fire(node as DebugSessionNode)));
        disposables.push(this.widget.model.onSelectionChanged(node => this.onDidSelectEmitter.fire(node[0] as DebugSessionNode)));
        this.widget.disposed.connect(() => {
            this.widget = undefined;
            disposables.dispose();
        });
        return Promise.resolve(this.widget);
    }
}

@injectable()
export class DebugViewContribution extends AbstractViewContribution<DebugTreeWidget> {
    constructor(
        @inject(DebugClientManager) protected readonly debugClientManager: DebugClientManager,
        @inject(DebugWidgetFactory) protected readonly debugWidgetFactory: DebugWidgetFactory) {
        super({
            widgetId: DEBUG_NAVIGATOR_ID,
            widgetName: 'Debug',
            defaultWidgetOptions: {
                area: 'left',
                rank: 500
            },
            toggleCommandId: 'debug.view.toggle',
            toggleKeybinding: 'ctrlcmd+alt+d'
        });
    }

    protected onStart(): void {
        this.debugWidgetFactory.onDidChangeOpenState(isOpen => {
            if (isOpen) {
                this.updateDebugSessions();
            }
        });

        this.debugClientManager.onDidCreateDebugClient(debugClient => this.updateDebugSessions());
        this.debugClientManager.onDidDisposeDebugClient(debugClient => this.updateDebugSessions());

        this.debugWidgetFactory.onDidSelect(node => this.debugClientManager.setActiveDebugClient(node.sessionId));
    }

    private updateDebugSessions(): void {
        const nodes = this.debugClientManager.findAll().map(debugClient => {
            return {
                id: debugClient.sessionId,
                sessionId: debugClient.sessionId,
                parent: undefined,
                children: [],
                name: debugClient.configuration.name,
                selected: false,
                expanded: false
            };
        });

        this.debugWidgetFactory.setNodes(nodes);
    }
}
