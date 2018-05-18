/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Message } from "@phosphor/messaging";
import {
    ContextMenuRenderer, TreeWidget, NodeProps, TreeProps, TreeNode,
    SelectableTreeNode, TreeModel, DockPanel
} from "@theia/core/lib/browser";
import { ElementAttrs, h } from "@phosphor/virtualdom";
import { LabelProvider } from "@theia/core/lib/browser/label-provider";
import { DefinitionNode, CallerNode } from "./callhierarchy-tree";
import { CallHierarchyTreeModel } from "./callhierarchy-tree-model";
import { CALLHIERARCHY_ID, Definition, Caller } from "../callhierarchy";
import URI from "@theia/core/lib/common/uri";
import { Location, Range, SymbolKind } from 'vscode-languageserver-types';
import { EditorManager } from "@theia/editor/lib/browser";

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
        this.title.iconClass = 'fa fa-arrow-circle-down';
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
    }

    initializeModel(selection: Location | undefined, languageId: string | undefined): void {
        this.model.initializeCallHierarchy(languageId, selection);
    }

    protected createNodeClassNames(node: TreeNode, props: NodeProps): string[] {
        const classNames = super.createNodeClassNames(node, props);
        if (DefinitionNode.is(node)) {
            classNames.push(DEFINITION_NODE_CLASS);
        }
        return classNames;
    }

    protected onUpdateRequest(msg: Message) {
        if (!this.model.selectedNodes && SelectableTreeNode.is(this.model.root)) {
            this.model.selectNode(this.model.root);
        }
        super.onUpdateRequest(msg);
    }

    protected createNodeAttributes(node: TreeNode, props: NodeProps): ElementAttrs {
        const elementAttrs = super.createNodeAttributes(node, props);
        return {
            ...elementAttrs,
        };
    }

    protected renderTree(model: TreeModel): h.Child {
        return super.renderTree(model)
            || h.div({ className: 'noCallers' }, 'No callers have been detected.');
    }

    protected renderCaption(node: TreeNode, props: NodeProps): h.Child {
        if (DefinitionNode.is(node)) {
            return this.decorateDefinitionCaption(node.definition);
        }
        if (CallerNode.is(node)) {
            return this.decorateCallerCaption(node.caller);
        }
        return 'caption';
    }

    protected decorateDefinitionCaption(definition: Definition): h.Child {
        const containerName = definition.containerName;
        const icon = h.div({ className: "symbol-icon " + this.toIconClass(definition.symbolKind) });
        const symbol = definition.symbolName;
        const symbolElement = h.div({ className: 'symbol' }, symbol);
        const location = this.labelProvider.getName(new URI(definition.location.uri));
        const container = (containerName) ? containerName + ' — ' + location : location;
        const containerElement = h.div({ className: 'container' }, container);
        return h.div({ className: 'definitionNode' }, icon, symbolElement, containerElement);
    }

    protected decorateCallerCaption(caller: Caller): h.Child {
        const definition = caller.callerDefinition;
        const icon = h.div({ className: "symbol-icon " + this.toIconClass(definition.symbolKind) });
        const containerName = definition.containerName;
        const symbol = definition.symbolName;
        const symbolElement = h.div({ className: 'symbol' }, symbol);
        const referenceCount = caller.references.length;
        const referenceCountElement = h.div({ className: 'referenceCount' }, (referenceCount > 1) ? `[${referenceCount}]` : '');
        const location = this.labelProvider.getName(new URI(definition.location.uri));
        const container = (containerName) ? containerName + ' — ' + location : location;
        const containerElement = h.div({ className: 'container' }, container);
        return h.div({ className: 'definitionNode' }, icon, symbolElement, referenceCountElement, containerElement);
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
        let location: Location | undefined;
        if (DefinitionNode.is(node)) {
            location = node.definition.location;
        }
        if (CallerNode.is(node)) {
            location = node.caller.references[0];
        }
        if (location) {
            this.editorManager.open(
                new URI(location.uri), {
                    mode: keepFocus ? 'reveal' : 'activate',
                    selection: Range.create(location.range.start, location.range.end)
                }
            ).then(editorWidget => {
                if (editorWidget.parent instanceof DockPanel) {
                    editorWidget.parent.selectWidget(editorWidget);
                }
            });
        }
    }

    storeState(): object {
        const callHierarchyService = this.model.getTree().callHierarchyService;
        if (this.model.root && callHierarchyService) {
            return {
                root: this.deflateForStorage(this.model.root),
                languageId: callHierarchyService.languageId,
            };
        } else {
            return {};
        }
    }

    restoreState(oldState: object): void {
        // tslint:disable-next-line:no-any
        if ((oldState as any).root && (oldState as any).languageId) {
            // tslint:disable-next-line:no-any
            this.model.root = this.inflateFromStorage((oldState as any).root);
            this.model.initializeCallHierarchy((oldState as any).languageId, (this.model.root as DefinitionNode).definition.location);
        }
    }
}
