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
import { DefinitionNode, CallerNode } from './callhierarchy-tree';
import { CallHierarchyTreeModel } from './callhierarchy-tree-model';
import { CALLHIERARCHY_ID, Definition, Caller } from '../callhierarchy';
import URI from '@theia/core/lib/common/uri';
import { Location, Range, SymbolKind, DocumentUri } from 'vscode-languageserver-types';
import { EditorManager } from '@theia/editor/lib/browser';
import * as React from 'react';

export const HIERARCHY_TREE_CLASS = 'theia-CallHierarchyTree';
export const DEFINITION_NODE_CLASS = 'theia-CallHierarchyTreeNode';
export const DEFINITION_ICON_CLASS = 'theia-CallHierarchyTreeNodeIcon';

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
        this.addClass(HIERARCHY_TREE_CLASS);
        this.toDispose.push(this.model.onSelectionChanged(selection => {
            const node = selection[0];
            if (node) {
                this.openEditor(node, true);
            }
        }));
        this.toDispose.push(this.model.onOpenNode((node: TreeNode) => {
            this.openEditor(node, false);
        }));
        this.toDispose.push(
            this.labelProvider.onDidChange(() => this.update())
        );
    }

    initializeModel(selection: Location | undefined, languageId: string | undefined): void {
        this.model.initializeCallHierarchy(languageId, selection ? selection.uri : undefined, selection ? selection.range.start : undefined);
    }

    protected createNodeClassNames(node: TreeNode, props: NodeProps): string[] {
        const classNames = super.createNodeClassNames(node, props);
        if (DefinitionNode.is(node)) {
            classNames.push(DEFINITION_NODE_CLASS);
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
            || <div className='theia-widget-noInfo'>No callers have been detected.</div>;
    }

    protected renderCaption(node: TreeNode, props: NodeProps): React.ReactNode {
        if (DefinitionNode.is(node)) {
            return this.decorateDefinitionCaption(node.definition);
        }
        if (CallerNode.is(node)) {
            return this.decorateCallerCaption(node.caller);
        }
        return 'caption';
    }

    protected decorateDefinitionCaption(definition: Definition): React.ReactNode {
        const containerName = definition.containerName;
        const symbol = definition.symbolName;
        const location = this.labelProvider.getName(new URI(definition.location.uri));
        const container = (containerName) ? containerName + ' — ' + location : location;
        return <div className='definitionNode'>
            <div className={'symbol-icon ' + this.toIconClass(definition.symbolKind)}></div>
            <div className='definitionNode-content'>
                <span className='symbol'>
                    {symbol}
                </span>
                <span className='container'>
                    {container}
                </span>
            </div>
        </div>;
    }

    protected decorateCallerCaption(caller: Caller): React.ReactNode {
        const definition = caller.callerDefinition;
        const containerName = definition.containerName;
        const symbol = definition.symbolName;
        const referenceCount = caller.references.length;
        const location = this.labelProvider.getName(new URI(definition.location.uri));
        const container = (containerName) ? containerName + ' — ' + location : location;
        return <div className='definitionNode'>
            <div className={'symbol-icon ' + this.toIconClass(definition.symbolKind)}></div>
            <div className='definitionNode-content'>
                <span className='symbol'>
                    {symbol}
                </span>
                <span className='referenceCount'>
                    {(referenceCount > 1) ? `[${referenceCount}]` : ''}
                </span>
                <span className='container'>
                    {container}
                </span>
            </div>
        </div>;
    }

    // tslint:disable-next-line:typedef
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

    private openEditor(node: TreeNode, keepFocus: boolean): void {

        if (DefinitionNode.is(node)) {
            const def = node.definition;
            this.doOpenEditor(node.definition.location.uri, def.selectionRange ? def.selectionRange : def.location.range, keepFocus);
        }
        if (CallerNode.is(node)) {
            this.doOpenEditor(node.caller.callerDefinition.location.uri, node.caller.references[0], keepFocus);
        }
    }

    private doOpenEditor(uri: DocumentUri, range: Range, keepFocus: boolean): void {
        this.editorManager.open(
            new URI(uri), {
                mode: keepFocus ? 'reveal' : 'activate',
                selection: range
            }
        ).then(editorWidget => {
            if (editorWidget.parent instanceof DockPanel) {
                editorWidget.parent.selectWidget(editorWidget);
            }
        });
    }

    storeState(): object {
        const callHierarchyService = this.model.getTree().callHierarchyService;
        if (this.model.root && callHierarchyService) {
            return {
                root: this.deflateForStorage(this.model.root),
                languageId: this.model.languageId,
            };
        } else {
            return {};
        }
    }

    restoreState(oldState: object): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((oldState as any).root && (oldState as any).languageId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const root = this.inflateFromStorage((oldState as any).root) as DefinitionNode;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.model.initializeCallHierarchy((oldState as any).languageId, root.definition.location.uri, root.definition.location.range.start);
        }
    }
}
