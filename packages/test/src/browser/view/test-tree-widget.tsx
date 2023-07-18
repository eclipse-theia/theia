// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { TreeWidget, TreeModel, TreeProps, CompositeTreeNode, ExpandableTreeNode, TreeNode, NodeProps } from '@theia/core/lib/browser/tree';
import { ContextMenuRenderer } from '@theia/core/lib/browser';
import { IconThemeService } from '@theia/core/lib/browser/icon-theme-service';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { TestController, TestService } from '../test-service';
import { Emitter, Event } from '@theia/core';
import * as React from '@theia/core/shared/react';

const ROOT_ID = 'TestTree';

export interface TestRoot extends CompositeTreeNode {
    children: TestControllerNode[];
}
export namespace TestRoot {
    export function is(node: unknown): node is TestRoot {
        return CompositeTreeNode.is(node) && node.id === ROOT_ID;
    }
}
export interface TestControllerNode extends ExpandableTreeNode {
    children: TestItemNode[];
    parent: TestRoot;
    name: string;
    controllerId: string;
}

export namespace TestControllerNode {
    export function is(node: unknown): node is TestControllerNode {
        return ExpandableTreeNode.is(node) && 'controllerId' in node;
    }
}

export interface TestItemNode extends ExpandableTreeNode {
    name?: undefined
    icon?: undefined;
    parent: TestItemNode | TestControllerNode;
}

@injectable()
export class TestTreeWidget extends TreeWidget {

    static ID = 'test-tree-widget';

    static TEST_CONTEXT_MENU = ['RESOURCE_CONTEXT_MENU'];

    @inject(IconThemeService) protected readonly iconThemeService: IconThemeService;
    @inject(ContextKeyService) protected readonly contextKeys: ContextKeyService;
    @inject(ThemeService) protected readonly themeService: ThemeService;
    @inject(TestService) protected readonly testService: TestService;

    protected controllersTree: Map<string, TestControllerNode>;
    protected changeEmitter = new Emitter<Map<string, TestControllerNode>>();

    protected onExpansionChangedEmitter = new Emitter();
    readonly onExpansionChanged: Event<void> = this.onExpansionChangedEmitter.event;

    constructor(
        @inject(TreeProps) props: TreeProps,
        @inject(TreeModel) model: TreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer,
    ) {
        super(props, model, contextMenuRenderer);

        this.id = TestTreeWidget.ID;
        model.root = {
            id: ROOT_ID,
            parent: undefined,
            visible: false,
            children: []
        } as TestRoot;

        this.controllersTree = new Map<string, TestControllerNode>();

        this.toDispose.push(model.onChanged(() => {
            this.changeEmitter.fire(this.controllersTree);
        }));
        this.toDispose.push(model.onNodeRefreshed(() => {
            this.changeEmitter.fire(this.controllersTree);
        }));
    }

    @postConstruct()
    protected override init(): void {
        super.init();
        this.addClass('testContainer');
        this.toDispose.push(this.changeEmitter);
    }

    get onChange(): Event<Map<string, TestControllerNode>> {
        return this.changeEmitter.event;
    }

    protected appendToTestTree(controller: TestController) {
        // look if it exists. if not, create
        const tree = this.controllersTree;
        let rootControllerNode = tree.get(controller.id);
        if (!rootControllerNode) {
            rootControllerNode = this.createControllerNode(controller);
            tree.set(controller.id, rootControllerNode);
        }
    }

    async populateTests() {
        this.controllersTree.clear();
        // init with existing controllers, and should react to controllers addition/deletions
        for (const controller of this.testService.getControllers()) {
            this.appendToTestTree(controller);
        }
        this.refreshModelChildren();
    }

    protected async refreshModelChildren(): Promise<void> {
        if (TestRoot.is(this.model.root)) {
            this.model.root.children = Array.from(this.controllersTree.values());
            this.model.refresh();
        }
    }

    protected createControllerNode(controller: TestController): TestControllerNode {
        return {
            name: controller.label,
            children: [],
            visible: true, // TODO should be false, no need to see test controller
            parent: this.model.root as TestRoot,
            id: controller.id,
            controllerId: controller.id,
            expanded: true
        }
    }

    protected override renderTree(model: TreeModel): React.ReactNode {
        if (TestRoot.is(model.root) && model.root.children.length > 0) {
            return super.renderTree(model);
        }
        return <div className='theia-widget-noInfo noMarkers'>No tests found in the workspace so far.</div>;
    }

    protected override renderCaption(node: TreeNode, props: NodeProps): React.ReactNode {
        if (TestControllerNode.is(node)) {
            return this.renderControllerNode(node);
        }
        return '';
    }

    protected renderControllerNode(node: TestControllerNode): React.ReactNode {
        return <div className='controller'>
            <div className='controller-head'>
                <div className={`controller-head-info noWrapInfo noselect`}>
                    <span className={`beaker-icon`}></span>
                    <div className='noWrapInfo'>
                        <span className={'controller-name'}>
                            {node.name}
                        </span>
                    </div>
                </div>
            </div>
        </div>;
    }

}
