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

import { injectable, inject } from 'inversify';
import {
    ContextMenuRenderer, TreeWidget, NodeProps, TreeProps, TreeNode,
    TreeModel, DockPanel
} from '@theia/core/lib/browser';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { CallHierarchyTree } from './callhierarchy-tree';
import { CallHierarchyTreeModel } from './callhierarchy-tree-model';
import { CALLHIERARCHY_ID } from '../callhierarchy';
import URI from '@theia/core/lib/common/uri';
import { Location, Range, SymbolKind } from 'vscode-languageserver-types';
import { EditorManager } from '@theia/editor/lib/browser';
import * as React from 'react';
import { CallHierarchyDirection } from '../callhierarchy-service';

export const CALL_HIERARCHY_TREE_CLASS = 'theia-CallHierarchyTree';
export const CALL_HIERARCHY_TREE_NODE_CLASS = 'theia-CallHierarchyTreeNode';
export const CALL_HIERARCHY_TREE_NODE_ICON_CLASS = 'theia-CallHierarchyTreeNodeIcon';

@injectable()
export class CallHierarchyTreeWidget extends TreeWidget {

    constructor(
        @inject(TreeProps) readonly props: TreeProps,
        @inject(CallHierarchyTreeModel) readonly model: CallHierarchyTreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer,
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider,
        @inject(EditorManager) readonly editorManager: EditorManager
    ) {
        super(props, model, contextMenuRenderer);

        this.id = CALLHIERARCHY_ID;
        this.title.label = 'Call Hierarchy';
        this.title.caption = 'Call Hierarchy';
        this.title.iconClass = 'fa call-hierarchy-tab-icon';
        this.title.closable = true;
        this.addClass(CALL_HIERARCHY_TREE_CLASS);
        this.toDispose.push(this.model.onSelectionChanged(selection => {
            const node = selection[0];
            if (node) {
                this.openEditor(node, true);
            }
        }));
        this.toDispose.push(this.model.onOpenNode((node: TreeNode) => {
            this.openEditor(node, false);
        }));
    }

    initializeModel(selection: Location | undefined, direction: CallHierarchyDirection, languageId: string | undefined): void {
        this.model.initializeCallHierarchy(languageId, selection, direction);
    }

    protected createNodeClassNames(node: TreeNode, props: NodeProps): string[] {
        const classNames = super.createNodeClassNames(node, props);
        if (CallHierarchyTree.ItemNode.is(node)) {
            classNames.push(CALL_HIERARCHY_TREE_NODE_CLASS);
        }
        return classNames;
    }

    protected createNodeAttributes(node: TreeNode, props: NodeProps): React.Attributes & React.HTMLAttributes<HTMLElement> {
        const elementAttrs = super.createNodeAttributes(node, props);
        return {
            ...elementAttrs,
        };
    }

    protected renderTree(model: TreeModel): React.ReactNode {
        return super.renderTree(model)
            || <div className='noCallers'>No callers have been detected.</div>;
    }

    protected renderCaption(node: TreeNode, props: NodeProps): React.ReactNode {
        if (CallHierarchyTree.ItemNode.is(node)) {
            if (!node.parent) {
                return this.decorateRoot(node);
            } else {
                return this.decorateCall(node);
            }
        }
        return 'caption';
    }

    protected decorateRoot(node: CallHierarchyTree.ItemNode): React.ReactNode {
        const item = node.item;
        const symbol = item.name;
        const location = this.labelProvider.getName(new URI(item.uri));
        return (<div className='itemNode'>
            <i className={this.toCallDirectionClass(node.direction)}></i>
            <div className={'symbol-icon ' + this.toIconClass(item.kind)}></div>
            <div className='symbol'>
                {symbol}
            </div>
            <div className='container'>
                {location}
            </div>
        </div>);
    }

    protected toCallDirectionClass(direction?: CallHierarchyDirection): string {
        return 'fa fa-arrow-circle-up ' + (direction === CallHierarchyDirection.Outgoing ? 'rotation-outgoing' : 'rotation-incoming');
    }

    protected decorateCall(node: CallHierarchyTree.ItemNode): React.ReactNode {
        const item = node.item;
        const symbol = item.name;
        const fileName = this.labelProvider.getName(new URI(item.callLocations![0].uri));
        const line = `l.${item.callLocations![0].range.start.line + 1}`;
        const location = ` ${line} in ${fileName}`;
        return (<div className='itemNode'>
            <i className={this.toCallDirectionClass(node.direction)}></i>
            <div className={'symbol-icon ' + this.toIconClass(item.kind)}></div>
            <div className='symbol'>
                {symbol}
            </div>
            <div className='container'>
                {location}
            </div>
        </div>);
    }

    protected toIconClass(symbolKind: number) {
        switch (symbolKind) {
            case SymbolKind.File: return 'file';
            case SymbolKind.Module: return 'module';
            case SymbolKind.Namespace: return 'namespace';
            case SymbolKind.Package: return 'package';
            case SymbolKind.Class: return 'class';
            case SymbolKind.Method: return 'method';
            case SymbolKind.Property: return 'property';
            case SymbolKind.Field: return 'field';
            case SymbolKind.Constructor: return 'constructor';
            case SymbolKind.Enum: return 'enum';
            case SymbolKind.Interface: return 'interface';
            case SymbolKind.Function: return 'function';
            case SymbolKind.Variable: return 'variable';
            case SymbolKind.Constant: return 'constant';
            case SymbolKind.String: return 'string';
            case SymbolKind.Number: return 'number';
            case SymbolKind.Boolean: return 'boolean';
            case SymbolKind.Array: return 'array';
            default: return 'unknown';
        }
    }

    private openEditor(node: TreeNode, keepFocus: boolean) {
        if (!CallHierarchyTree.ItemNode.is(node)) {
            return;
        }
        const callerLocation = node.item.callLocations && node.item.callLocations![0];
        const uri = callerLocation ? callerLocation.uri : node.item.uri;
        const range = callerLocation ? callerLocation.range : node.item.selectionRange;

        this.editorManager.open(
            new URI(uri), {
                mode: keepFocus ? 'reveal' : 'activate',
                selection: Range.create(range.start, range.end)
            }
        ).then(editorWidget => {
            if (editorWidget.parent instanceof DockPanel) {
                editorWidget.parent.selectWidget(editorWidget);
            }
        });
    }

    storeState(): object {
        const callHierarchyService = this.model.getTree().callHierarchyService;
        if (CallHierarchyTree.ItemNode.is(this.model.root) && callHierarchyService) {
            return {
                root: this.deflateForStorage(this.model.root),
                languageId: callHierarchyService.languageId,
                direction: this.model.root.direction,
            };
        } else {
            return {};
        }
    }

    // tslint:disable-next-line:no-any
    restoreState(oldState: any): void {
        if ('root' in oldState && 'languageId' in oldState && 'direction' in oldState) {
            const root = this.inflateFromStorage(oldState.root);
            if (CallHierarchyTree.ItemNode.is(root)) {
                const item = root.item;
                const location = Location.create(item.uri, item.selectionRange);
                this.model.root = root;
                this.model.initializeCallHierarchy(oldState.languageId, location, oldState.direction);
            }
        }
    }
}
