// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import {
    ContextMenuRenderer, TreeWidget, NodeProps, TreeProps, TreeNode,
    TreeModel, DockPanel, codicon
} from '@theia/core/lib/browser';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { ItemNode, CallerNode } from './callhierarchy-tree';
import { CallHierarchyTreeModel } from './callhierarchy-tree-model';
import { CALLHIERARCHY_ID, CallHierarchyItem, CallHierarchyIncomingCall, CALL_HIERARCHY_LABEL } from '../callhierarchy';
import URI from '@theia/core/lib/common/uri';
import { Location, Range, SymbolKind, DocumentUri, SymbolTag } from '@theia/core/shared/vscode-languageserver-protocol';
import { EditorManager } from '@theia/editor/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import * as React from '@theia/core/shared/react';

export const HIERARCHY_TREE_CLASS = 'theia-CallHierarchyTree';
export const DEFINITION_NODE_CLASS = 'theia-CallHierarchyTreeNode';
export const DEFINITION_ICON_CLASS = 'theia-CallHierarchyTreeNodeIcon';

@injectable()
export class CallHierarchyTreeWidget extends TreeWidget {

    constructor(
        @inject(TreeProps) override readonly props: TreeProps,
        @inject(CallHierarchyTreeModel) override readonly model: CallHierarchyTreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer,
        @inject(LabelProvider) protected override readonly labelProvider: LabelProvider,
        @inject(EditorManager) readonly editorManager: EditorManager
    ) {
        super(props, model, contextMenuRenderer);

        this.id = CALLHIERARCHY_ID;
        this.title.label = CALL_HIERARCHY_LABEL;
        this.title.caption = CALL_HIERARCHY_LABEL;
        this.title.iconClass = codicon('references');
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

    protected override createNodeClassNames(node: TreeNode, props: NodeProps): string[] {
        const classNames = super.createNodeClassNames(node, props);
        if (ItemNode.is(node)) {
            classNames.push(DEFINITION_NODE_CLASS);
        }
        return classNames;
    }

    protected override createNodeAttributes(node: TreeNode, props: NodeProps): React.Attributes & React.HTMLAttributes<HTMLElement> {
        const elementAttrs = super.createNodeAttributes(node, props);
        return {
            ...elementAttrs,
        };
    }

    protected override renderTree(model: TreeModel): React.ReactNode {
        return super.renderTree(model)
            || <div className='theia-widget-noInfo'>{nls.localize('theia/callhierarchy/noCallers', 'No callers have been detected.')}</div>;
    }

    protected override renderCaption(node: TreeNode, props: NodeProps): React.ReactNode {
        if (ItemNode.is(node)) {
            return this.decorateDefinitionCaption(node.definition);
        }
        if (CallerNode.is(node)) {
            return this.decorateCallerCaption(node.caller);
        }
        return 'caption';
    }

    protected decorateDefinitionCaption(definition: CallHierarchyItem): React.ReactNode {
        const symbol = definition.name;
        const location = this.labelProvider.getName(URI.fromComponents(definition.uri));
        const container = location;
        const isDeprecated = definition.tags?.includes(SymbolTag.Deprecated);
        const classNames = ['definitionNode'];
        if (isDeprecated) {
            classNames.push('deprecatedDefinition');
        }

        return <div className={classNames.join(' ')}>
            <div className={'symbol-icon-center codicon codicon-symbol-' + this.toIconClass(definition.kind)}></div>
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

    protected decorateCallerCaption(caller: CallHierarchyIncomingCall): React.ReactNode {
        const definition = caller.from;
        const symbol = definition.name;
        const referenceCount = caller.fromRanges.length;
        const location = this.labelProvider.getName(URI.fromComponents(definition.uri));
        const container = location;
        const isDeprecated = definition.tags?.includes(SymbolTag.Deprecated);
        const classNames = ['definitionNode'];
        if (isDeprecated) {
            classNames.push('deprecatedDefinition');
        }

        return <div className={classNames.join(' ')}>
            <div className={'symbol-icon-center codicon codicon-symbol-' + this.toIconClass(definition.kind)}></div>
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

        if (ItemNode.is(node)) {
            const def = node.definition;
            this.doOpenEditor(URI.fromComponents(def.uri).toString(), def.selectionRange ? def.selectionRange : def.range, keepFocus);
        }
        if (CallerNode.is(node)) {
            this.doOpenEditor(URI.fromComponents(node.caller.from.uri).toString(), node.caller.fromRanges[0], keepFocus);
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

    override storeState(): object {
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

    override restoreState(oldState: object): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((oldState as any).root && (oldState as any).languageId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const root = this.inflateFromStorage((oldState as any).root) as ItemNode;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.model.initializeCallHierarchy((oldState as any).languageId, URI.fromComponents(root.definition.uri).toString(), root.definition.range.start);
        }
    }
}
