/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
import DocumentSymbol = monaco.languages.DocumentSymbol;
import SymbolKind = monaco.languages.SymbolKind;
import { FrontendApplicationContribution, FrontendApplication, TreeNode } from '@theia/core/lib/browser';
import { Range, EditorManager } from '@theia/editor/lib/browser';
import DocumentSymbolProviderRegistry = monaco.modes.DocumentSymbolProviderRegistry;
import CancellationTokenSource = monaco.cancellation.CancellationTokenSource;
import CancellationToken = monaco.cancellation.CancellationToken;
import { DisposableCollection } from '@theia/core';
import { OutlineViewService } from '@theia/outline-view/lib/browser/outline-view-service';
import { OutlineSymbolInformationNode } from '@theia/outline-view/lib/browser/outline-view-widget';
import URI from '@theia/core/lib/common/uri';
import { MonacoEditor } from './monaco-editor';

import debounce = require('lodash.debounce');

@injectable()
export class MonacoOutlineContribution implements FrontendApplicationContribution {

    protected readonly toDisposeOnClose = new DisposableCollection();
    protected readonly toDisposeOnEditor = new DisposableCollection();

    @inject(OutlineViewService) protected readonly outlineViewService: OutlineViewService;
    @inject(EditorManager) protected readonly editorManager: EditorManager;

    onStart(app: FrontendApplication): void {
        this.outlineViewService.onDidChangeOpenState(async open => {
            if (open) {
                this.toDisposeOnClose.push(this.toDisposeOnEditor);
                this.toDisposeOnClose.push(DocumentSymbolProviderRegistry.onDidChange(
                    debounce(() => this.updateOutline())
                ));
                this.toDisposeOnClose.push(this.editorManager.onCurrentEditorChanged(
                    debounce(() => this.handleCurrentEditorChanged(), 50)
                ));
                this.handleCurrentEditorChanged();
            } else {
                this.toDisposeOnClose.dispose();
            }
        });
        this.outlineViewService.onDidSelect(async node => {
            if (MonacoOutlineSymbolInformationNode.is(node) && node.parent) {
                await this.editorManager.open(node.uri, {
                    mode: 'reveal',
                    selection: node.range
                });
            }
        });
        this.outlineViewService.onDidOpen(node => {
            if (MonacoOutlineSymbolInformationNode.is(node)) {
                this.editorManager.open(node.uri, {
                    selection: <Range>{
                        start: node.range.start
                    }
                });
            }
        });
    }

    protected handleCurrentEditorChanged(): void {
        this.toDisposeOnEditor.dispose();
        if (this.toDisposeOnClose.disposed) {
            return;
        }
        this.toDisposeOnClose.push(this.toDisposeOnEditor);
        const editor = this.editorManager.currentEditor;
        if (editor) {
            const model = MonacoEditor.get(editor)!.getControl().getModel();
            this.toDisposeOnEditor.push(model.onDidChangeContent(() => this.updateOutline()));
        }
        this.updateOutline();
    }

    protected tokenSource = new CancellationTokenSource();
    protected async updateOutline(): Promise<void> {
        this.tokenSource.cancel();
        this.tokenSource = new CancellationTokenSource();
        const token = this.tokenSource.token;

        const editor = MonacoEditor.get(this.editorManager.currentEditor);
        const model = editor && editor.getControl().getModel();
        const roots = model && await this.createRoots(model, token);
        if (token.isCancellationRequested) {
            return;
        }
        this.outlineViewService.publish(roots || []);
    }

    protected async createRoots(model: monaco.editor.IModel, token: CancellationToken): Promise<MonacoOutlineSymbolInformationNode[]> {
        const providers = await DocumentSymbolProviderRegistry.all(model);
        if (token.isCancellationRequested) {
            return [];
        }
        const roots = [];
        const uri = new URI(model.uri.toString());
        for (const provider of providers) {
            try {
                const symbols = await provider.provideDocumentSymbols(model, token);
                if (token.isCancellationRequested) {
                    return [];
                }
                const nodes = this.createNodes(uri, symbols);
                roots.push(...nodes);
            } catch {
                /* collect symbols from other providers */
            }
        }
        return roots;
    }

    protected createNodes(uri: URI, symbols: DocumentSymbol[]): MonacoOutlineSymbolInformationNode[] {
        let rangeBased = false;
        const ids = new Map();
        const roots: MonacoOutlineSymbolInformationNode[] = [];
        const nodesByName = symbols.sort(this.orderByPosition).reduce((result, symbol) => {
            const node = this.createNode(uri, symbol, ids);
            if (symbol.children) {
                roots.push(node);
            } else {
                rangeBased = rangeBased || symbol.range.startLineNumber !== symbol.range.endLineNumber;
                const values = result.get(symbol.name) || [];
                values.push({ symbol, node });
                result.set(symbol.name, values);
            }
            return result;
        }, new Map<string, MonacoOutlineContribution.NodeAndSymbol[]>());

        for (const nodes of nodesByName.values()) {
            for (const { node, symbol } of nodes) {
                if (!symbol.containerName) {
                    roots.push(node);
                } else {
                    const possibleParents = nodesByName.get(symbol.containerName);
                    if (possibleParents) {
                        const parent = possibleParents.find(possibleParent => this.parentContains(symbol, possibleParent.symbol, rangeBased));
                        if (parent) {
                            const parentNode = parent.node;
                            Object.assign(node, { parent: parentNode });
                            (parentNode.children as TreeNode[]).push(node);
                        }
                    }
                }
            }
        }
        if (!roots.length) {
            const nodes = nodesByName.values().next().value;
            if (nodes && !nodes[0].node.parent) {
                return [nodes[0].node];
            }
            return [];
        }
        return roots;
    }

    protected parentContains(symbol: DocumentSymbol, parent: DocumentSymbol, rangeBased: boolean): boolean {
        const symbolRange = this.getRangeFromSymbolInformation(symbol);
        const nodeRange = this.getRangeFromSymbolInformation(parent);
        const sameStartLine = symbolRange.start.line === nodeRange.start.line;
        const startColGreaterOrEqual = symbolRange.start.character >= nodeRange.start.character;
        const startLineGreater = symbolRange.start.line > nodeRange.start.line;
        const sameEndLine = symbolRange.end.line === nodeRange.end.line;
        const endColSmallerOrEqual = symbolRange.end.character <= nodeRange.end.character;
        const endLineSmaller = symbolRange.end.line < nodeRange.end.line;
        return (((sameStartLine && startColGreaterOrEqual || startLineGreater) &&
            (sameEndLine && endColSmallerOrEqual || endLineSmaller)) || !rangeBased);
    }

    protected getRangeFromSymbolInformation(symbolInformation: DocumentSymbol): Range {
        return {
            end: {
                character: symbolInformation.range.endColumn - 1,
                line: symbolInformation.range.endLineNumber - 1
            },
            start: {
                character: symbolInformation.range.startColumn - 1,
                line: symbolInformation.range.startLineNumber - 1
            }
        };
    }

    protected createNode(uri: URI, symbol: DocumentSymbol, ids: Map<string, number>, parent?: MonacoOutlineSymbolInformationNode): MonacoOutlineSymbolInformationNode {
        const id = this.createId(symbol.name, ids);
        const children: MonacoOutlineSymbolInformationNode[] = [];
        const node: MonacoOutlineSymbolInformationNode = {
            children,
            id,
            iconClass: SymbolKind[symbol.kind].toString().toLowerCase(),
            name: symbol.name,
            parent,
            uri,
            range: this.getRangeFromSymbolInformation(symbol),
            selected: false,
            expanded: this.shouldExpand(symbol)
        };
        if (symbol.children) {
            for (const child of symbol.children) {
                children.push(this.createNode(uri, child, ids, node));
            }
        }
        return node;
    }

    protected createId(name: string, ids: Map<string, number>): string {
        const counter = ids.get(name);
        const index = typeof counter === 'number' ? counter + 1 : 0;
        ids.set(name, index);
        return name + '_' + index;
    }

    protected shouldExpand(symbol: DocumentSymbol): boolean {
        return [SymbolKind.Class,
        SymbolKind.Enum, SymbolKind.File,
        SymbolKind.Interface, SymbolKind.Module,
        SymbolKind.Namespace, SymbolKind.Object,
        SymbolKind.Package, SymbolKind.Struct].indexOf(symbol.kind) !== -1;
    }

    protected orderByPosition(symbol: DocumentSymbol, symbol2: DocumentSymbol): number {
        const startLineComparison = symbol.range.startLineNumber - symbol2.range.startLineNumber;
        if (startLineComparison !== 0) {
            return startLineComparison;
        }
        const startOffsetComparison = symbol.range.startColumn - symbol2.range.startColumn;
        if (startOffsetComparison !== 0) {
            return startOffsetComparison;
        }
        const endLineComparison = symbol.range.endLineNumber - symbol2.range.endLineNumber;
        if (endLineComparison !== 0) {
            return endLineComparison;
        }
        return symbol.range.endColumn - symbol2.range.endColumn;
    }

}
export namespace MonacoOutlineContribution {
    export interface NodeAndSymbol {
        node: MonacoOutlineSymbolInformationNode;
        symbol: DocumentSymbol
    }
}

export interface MonacoOutlineSymbolInformationNode extends OutlineSymbolInformationNode {
    uri: URI;
    range: Range;
}

export namespace MonacoOutlineSymbolInformationNode {
    export function is(node: TreeNode): node is MonacoOutlineSymbolInformationNode {
        return OutlineSymbolInformationNode.is(node) && 'uri' in node && 'range' in node;
    }
}
