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
import { TreeWidget, TreeModel, TreeProps, CompositeTreeNode, TreeNode, TreeImpl, NodeProps, SelectableTreeNode } from '@theia/core/lib/browser/tree';
import { ContextMenuRenderer, codicon } from '@theia/core/lib/browser';
import { IconThemeService } from '@theia/core/lib/browser/icon-theme-service';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { TestController, TestExecutionState, TestFailure, TestItem, TestMessage, TestOutputItem, TestRun, TestService } from '../test-service';
import * as React from '@theia/core/shared/react';
import { Disposable, DisposableCollection, Event, nls } from '@theia/core';
import { TestExecutionStateManager } from './test-execution-state-manager';
import { TestOutputUIModel } from './test-output-ui-model';

class TestRunNode implements TreeNode, SelectableTreeNode {
    constructor(readonly counter: number, readonly id: string, readonly run: TestRun, readonly parent: CompositeTreeNode) { }

    get name(): string {
        return this.run.name || nls.localize('theia/test/testRunDefaultName', '{0} run {1}', this.run.controller.label, this.counter);
    };

    expanded?: boolean;
    selected: boolean = false;
    children: TestItemNode[] = [];
}

class TestItemNode implements TreeNode, SelectableTreeNode {
    constructor(readonly id: string, readonly item: TestItem, readonly parent: TestRunNode) { }
    selected: boolean = false;

    get name(): string {
        return this.item.label;
    }
}

interface RunInfo {
    node: TestRunNode;
    disposable: Disposable;
    tests: Map<TestItem, TestItemNode>;
}

@injectable()
export class TestRunTree extends TreeImpl {
    private ROOT: CompositeTreeNode = {
        id: 'TestResults',
        name: 'Test Results',
        parent: undefined,
        children: [],
        visible: false
    };

    @inject(TestService) protected readonly testService: TestService;

    private controllerListeners = new Map<string, Disposable>();

    private runs = new Map<TestRun, RunInfo>();
    private nextId = 0;

    @postConstruct()
    init(): void {
        this.root = this.ROOT;
        this.testService.getControllers().forEach(controller => {
            this.addController(controller);
        });

        this.testService.onControllersChanged(controllerDelta => {
            controllerDelta.removed?.forEach(controller => {
                this.controllerListeners.get(controller)?.dispose();
            });

            controllerDelta.added?.forEach(controller => this.addController(controller));
        });
    }

    private addController(controller: TestController): void {
        controller.testRuns.forEach(run => this.addRun(run));
        const listeners = new DisposableCollection();
        this.controllerListeners.set(controller.id, listeners);

        listeners.push(controller.onRunsChanged(runDelta => {
            runDelta.removed?.forEach(run => {
                this.runs.get(run)?.disposable.dispose();
                this.runs.delete(run);
                this.refresh(this.ROOT);
            });
            runDelta.added?.forEach(run => {
                this.addRun(run);
                this.refresh(this.ROOT);
            });
        }));
    }

    private addRun(run: TestRun): void {
        const newNode = this.createRunNode(run);
        const affected: TestItemNode[] = [];

        const disposables = new DisposableCollection();

        disposables.push(run.onDidChangeTestState(deltas => {
            let needsRefresh = false;
            deltas.forEach(delta => {
                if (delta.newState) {
                    if (delta.newState.state > TestExecutionState.Queued) {
                        const testNode = info.tests.get(delta.test);
                        if (!testNode) {
                            if (info.tests.size === 0) {
                                newNode.expanded = true;
                            }
                            info.tests.set(delta.test, this.createTestItemNode(newNode, delta.test));
                            needsRefresh = true;
                        } else {
                            affected.push(testNode);
                        }
                    }
                } else {
                    info.tests.delete(delta.test);
                    needsRefresh = true;
                }
            });
            if (needsRefresh) {
                this.refresh(newNode);
            } else {
                this.onDidUpdateEmitter.fire(affected);
            }
        }));
        disposables.push(run.onDidChangeProperty(() => this.onDidUpdateEmitter.fire([])));
        const info = {
            node: newNode,
            disposable: disposables,

            tests: new Map(run.items.filter(item => (run.getTestState(item)?.state || 0) > TestExecutionState.Queued).map(item => [item, this.createTestItemNode(newNode, item)]))
        };
        this.runs.set(run, info);
    }

    protected createRunNode(run: TestRun): TestRunNode {
        return new TestRunNode(this.nextId, `id-${this.nextId++}`, run, this.ROOT);
    }

    createTestItemNode(parent: TestRunNode, item: TestItem): TestItemNode {
        return new TestItemNode(`testitem-${this.nextId++}`, item, parent);
    }

    protected override async resolveChildren(parent: CompositeTreeNode): Promise<TreeNode[]> {
        if (parent === this.ROOT) {
            return Promise.resolve([...this.runs.values()].reverse().map(info => info.node));
        } else if (parent instanceof TestRunNode) {
            const runInfo = this.runs.get(parent.run);
            if (runInfo) {
                return Promise.resolve([...runInfo.tests.values()]);
            } else {
                return Promise.resolve([]);
            }
        } else {
            return Promise.resolve([]);
        }
    }
}

@injectable()
export class TestRunTreeWidget extends TreeWidget {

    static ID = 'test-run-widget';

    @inject(IconThemeService) protected readonly iconThemeService: IconThemeService;
    @inject(ContextKeyService) protected readonly contextKeys: ContextKeyService;
    @inject(ThemeService) protected readonly themeService: ThemeService;
    @inject(TestExecutionStateManager) protected readonly stateManager: TestExecutionStateManager;
    @inject(TestOutputUIModel) protected readonly uiModel: TestOutputUIModel;

    constructor(
        @inject(TreeProps) props: TreeProps,
        @inject(TreeModel) model: TreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer,
    ) {
        super(props, model, contextMenuRenderer);
        this.id = TestRunTreeWidget.ID;
        this.title.label = nls.localize('theia/test/testRuns', 'Test Runs');
        this.title.caption = nls.localize('theia/test/testRuns', 'Test Runs');
        this.title.iconClass = codicon('run');
        this.title.closable = true;
    }

    @postConstruct()
    protected override init(): void {
        super.init();
        this.addClass('theia-test-run-view');
        this.model.onSelectionChanged(() => {
            const node = this.model.selectedNodes[0];
            if (node instanceof TestRunNode) {
                this.uiModel.selectedOutputSource = {
                    get output(): readonly TestOutputItem[] {
                        return node.run.getOutput();
                    },
                    onDidAddTestOutput: Event.map(node.run.onDidChangeTestOutput, evt => evt.map(item => item[1]))
                };
            } else if (node instanceof TestItemNode) {
                this.uiModel.selectedOutputSource = {
                    get output(): readonly TestOutputItem[] {
                        return node.parent.run.getOutput(node.item);
                    },
                    onDidAddTestOutput: Event.map(node.parent.run.onDidChangeTestOutput, evt => evt.filter(item => item[0] === node.item).map(item => item[1]))
                };
                this.uiModel.selectedTestState = node.parent.run.getTestState(node.item);
            }
        });
    }

    protected override renderTree(model: TreeModel): React.ReactNode {
        if (CompositeTreeNode.is(this.model.root) && this.model.root.children.length > 0) {
            return super.renderTree(model);
        }
        return <div className='theia-widget-noInfo noMarkers'>{nls.localizeByDefault('No tests have been found in this workspace yet.')}</div>;
    }

    protected getTestStateClass(state: TestExecutionState | undefined): string {
        switch (state) {
            case TestExecutionState.Queued: return `${codicon('history')} queued`;
            case TestExecutionState.Running: return `${codicon('sync')} codicon-modifier-spin running`;
            case TestExecutionState.Skipped: return `${codicon('debug-step-over')} skipped`;
            case TestExecutionState.Failed: return `${codicon('error')} failed`;
            case TestExecutionState.Errored: return `${codicon('issues')} errored`;
            case TestExecutionState.Passed: return `${codicon('pass')} passed`;
            default: return codicon('circle');
        }
    }

    protected override renderIcon(node: TreeNode, props: NodeProps): React.ReactNode {
        if (node instanceof TestItemNode) {
            const state = node.parent.run.getTestState(node.item)?.state;
            return <div className={this.getTestStateClass(state)}></div >;
        } else if (node instanceof TestRunNode) {
            const icon = node.run.isRunning ? `${codicon('sync')} codicon-modifier-spin running` : codicon('circle');
            return <div className={icon}></div >;
        } else {
            return super.renderIcon(node, props);
        }
    }

    protected override toContextMenuArgs(node: SelectableTreeNode): (TestRun | TestItem | TestMessage[])[] {
        if (node instanceof TestRunNode) {
            return [node.run];
        } else if (node instanceof TestItemNode) {
            const item = node.item;
            const executionState = node.parent.run.getTestState(node.item);
            if (TestFailure.is(executionState)) {
                return [item, executionState.messages];
            }
            return [item];
        }
        return [];
    }

    override storeState(): object {
        return {}; // don't store any state for now
    }
}
