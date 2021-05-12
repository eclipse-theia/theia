/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { FileNode, FileStatNode, FileTreeModel } from '@theia/filesystem/lib/browser';
import { ApplicationShell, CompositeTreeNode, open, NavigatableWidget, OpenerService, SelectableTreeNode, TreeNode, Widget } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import debounce = require('@theia/core/shared/lodash.debounce');
import { DisposableCollection } from '@theia/core/lib/common';

export interface OpenEditorNode extends FileStatNode {
    widget: Widget;
};

export namespace OpenEditorNode {
    export function is(node: object | undefined): node is OpenEditorNode {
        return FileStatNode.is(node) && 'widget' in node;
    }
}

@injectable()
export class OpenEditorsModel extends FileTreeModel {
    @inject(ApplicationShell) protected readonly applicationShell: ApplicationShell;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(OpenerService) protected readonly openerService: OpenerService;

    protected toDisposeOnPreviewWidgetReplaced = new DisposableCollection();
    protected _editorWidgets: NavigatableWidget[];
    get editorWidgets(): NavigatableWidget[] {
        return this._editorWidgets;
    }

    @postConstruct()
    protected init(): void {
        super.init();
        this.initializeRoot();
    }

    protected async initializeRoot(): Promise<void> {
        this.toDispose.push(this.selectionService.onSelectionChanged(selection => {
            const { widget } = (selection[0] as OpenEditorNode);
            this.applicationShell.activateWidget(widget.id);
        }));
        this.toDispose.push(this.applicationShell.onDidChangeCurrentWidget(async ({ newValue }) => {
            const nodeToSelect = this.tree.getNode(newValue?.id) as SelectableTreeNode;
            if (nodeToSelect) {
                this.selectNode(nodeToSelect);
            }
        }));
        this.toDispose.push(this.workspaceService.onWorkspaceChanged(() => this.updateOpenWidgets()));
        this.toDispose.push(this.workspaceService.onWorkspaceLocationChanged(() => this.updateOpenWidgets()));
        this.toDispose.push(this.applicationShell.onDidAddWidget(widget => {
            if (ApplicationShell.TrackableWidgetProvider.is(widget) && widget.onDidChangeTrackableWidgets) {
                this.toDisposeOnPreviewWidgetReplaced.dispose();
                this.toDisposeOnPreviewWidgetReplaced.push(widget.onDidChangeTrackableWidgets(() => this.updateOpenWidgets()));
            }
            this.updateOpenWidgets();
        }));
        this.toDispose.push(this.applicationShell.onDidRemoveWidget(() => this.updateOpenWidgets()));
        await this.updateOpenWidgets();
        this.fireChanged();
    }

    protected updateOpenWidgets = debounce(this.doUpdateOpenWidgets, 250);

    protected async doUpdateOpenWidgets(): Promise<void> {
        this._editorWidgets = this.applicationShell.widgets.filter((widget): widget is NavigatableWidget => (
            NavigatableWidget.is(widget) && !ApplicationShell.TrackableWidgetProvider.is(widget) // exclude preview widget
        ));
        this.root = await this.buildRootFromOpenedWidgets(this._editorWidgets);
    }

    protected async buildRootFromOpenedWidgets(openWidgets: NavigatableWidget[]): Promise<CompositeTreeNode> {
        const newRoot: CompositeTreeNode = {
            id: 'open-editors:root',
            parent: undefined,
            visible: false,
            children: []
        };
        for (const widget of openWidgets) {
            const uri = widget.getResourceUri();
            if (uri) {
                const fileStat = await this.fileService.resolve(uri);
                const openEditorNode: OpenEditorNode = {
                    id: widget.id,
                    fileStat,
                    uri,
                    selected: false,
                    parent: undefined,
                    name: widget.title.label,
                    icon: widget.title.iconClass,
                    widget
                };
                CompositeTreeNode.addChild(newRoot, openEditorNode);
            }
        }
        return newRoot;
    }

    protected doOpenNode(node: TreeNode): void {
        if (node.visible === false) {
            return;
        } else if (FileNode.is(node)) {
            open(this.openerService, node.uri);
        } else {
            super.doOpenNode(node);
        }
    }
}
