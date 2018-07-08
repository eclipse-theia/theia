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

import { injectable, inject } from "inversify";
import SymbolInformation = monaco.modes.SymbolInformation;
import SymbolKind = monaco.modes.SymbolKind;
import { FrontendApplicationContribution, FrontendApplication, TreeNode } from "@theia/core/lib/browser";
import { Range, EditorManager } from '@theia/editor/lib/browser';
import DocumentSymbolProviderRegistry = monaco.modes.DocumentSymbolProviderRegistry;
import CancellationTokenSource = monaco.cancellation.CancellationTokenSource;
import { DisposableCollection } from "@theia/core";
import { OutlineViewService } from '@theia/outline-view/lib/browser/outline-view-service';
import { OutlineSymbolInformationNode } from '@theia/outline-view/lib/browser/outline-view-widget';
import URI from "@theia/core/lib/common/uri";
import { MonacoEditor } from './monaco-editor';

import debounce = require('lodash.debounce');

@injectable()
export class MonacoOutlineContribution implements FrontendApplicationContribution {

    protected cancellationSource: CancellationTokenSource;
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
                const uri = new URI(node.uri);
                await this.editorManager.open(uri, {
                    mode: 'reveal',
                    selection: node.range
                });
            }
        });
        this.outlineViewService.onDidOpen(node => {
            if (MonacoOutlineSymbolInformationNode.is(node)) {
                this.editorManager.open(new URI(node.uri), {
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

    protected async updateOutline(): Promise<void> {
        const editor = this.editorManager.currentEditor;
        if (editor) {
            const model = MonacoEditor.get(editor)!.getControl().getModel();
            this.publish(await this.computeSymbolInformations(model));
        } else {
            this.publish([]);
        }
    }

    protected async computeSymbolInformations(model: monaco.editor.IModel): Promise<SymbolInformation[]> {
        const entries: SymbolInformation[] = [];
        const documentSymbolProviders = await DocumentSymbolProviderRegistry.all(model);

        if (this.cancellationSource) {
            this.cancellationSource.cancel();
        }
        this.cancellationSource = new CancellationTokenSource();
        const token = this.cancellationSource.token;
        for (const documentSymbolProvider of documentSymbolProviders) {
            try {
                const symbolInformation = await documentSymbolProvider.provideDocumentSymbols(model, token);
                if (token.isCancellationRequested) {
                    return [];
                }
                if (Array.isArray(symbolInformation)) {
                    entries.push(...symbolInformation);
                }
            } catch {
                // happens if `provideDocumentSymbols` promise is rejected.
                return [];
            }
        }

        return entries;
    }

    protected publish(symbolInformations: SymbolInformation[]): void {
        let rangeBased = false;
        const ids = new Map();
        const nodesByName = symbolInformations.sort(this.orderByPosition).reduce((result, symbol) => {
            rangeBased = rangeBased || symbol.location.range.startLineNumber !== symbol.location.range.endLineNumber;
            const values = result.get(symbol.name) || [];
            const node = this.createNode(symbol, ids);
            values.push({ symbol, node });
            result.set(symbol.name, values);
            return result;
        }, new Map<string, MonacoOutlineContribution.NodeAndSymbol[]>());

        const roots = [];
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
        if (roots.length === 0) {
            const nodes = nodesByName.values().next().value;
            if (nodes && !nodes[0].node.parent) {
                this.outlineViewService.publish([nodes[0].node]);
            } else {
                this.outlineViewService.publish([]);
            }
        } else {
            this.outlineViewService.publish(roots);
        }
    }

    protected parentContains(symbol: SymbolInformation, parent: SymbolInformation, rangeBased: boolean): boolean {
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

    protected getRangeFromSymbolInformation(symbolInformation: SymbolInformation): Range {
        return {
            end: {
                character: symbolInformation.location.range.endColumn - 1,
                line: symbolInformation.location.range.endLineNumber - 1
            },
            start: {
                character: symbolInformation.location.range.startColumn - 1,
                line: symbolInformation.location.range.startLineNumber - 1
            }
        };
    }

    protected createNode(symbol: SymbolInformation, ids: Map<string, number>): MonacoOutlineSymbolInformationNode {
        const id = this.createId(symbol.name, ids);
        return {
            children: [],
            id,
            iconClass: SymbolKind[symbol.kind].toString().toLowerCase(),
            name: symbol.name,
            parent: undefined,
            uri: symbol.location.uri.toString(),
            range: this.getRangeFromSymbolInformation(symbol),
            selected: false,
            expanded: this.shouldExpand(symbol)
        };
    }

    protected createId(name: string, ids: Map<string, number>): string {
        const counter = ids.get(name);
        const index = typeof counter === 'number' ? counter + 1 : 0;
        ids.set(name, index);
        return name + '_' + index;
    }

    protected shouldExpand(symbol: SymbolInformation): boolean {
        return [SymbolKind.Class,
        SymbolKind.Enum, SymbolKind.File,
        SymbolKind.Interface, SymbolKind.Module,
        SymbolKind.Namespace, SymbolKind.Object,
        SymbolKind.Package, SymbolKind.Struct].indexOf(symbol.kind) !== -1;
    }

    protected orderByPosition(symbol1: SymbolInformation, symbol2: SymbolInformation): number {
        const startLineComparison = symbol1.location.range.startLineNumber - symbol2.location.range.startLineNumber;
        if (startLineComparison !== 0) {
            return startLineComparison;
        }
        const startOffsetComparison = symbol1.location.range.startColumn - symbol2.location.range.startColumn;
        if (startOffsetComparison !== 0) {
            return startOffsetComparison;
        }
        const endLineComparison = symbol1.location.range.endLineNumber - symbol2.location.range.endLineNumber;
        if (endLineComparison !== 0) {
            return endLineComparison;
        }
        return symbol1.location.range.endColumn - symbol2.location.range.endColumn;
    }

}
export namespace MonacoOutlineContribution {
    export interface NodeAndSymbol {
        node: MonacoOutlineSymbolInformationNode;
        symbol: SymbolInformation
    }
}

export interface MonacoOutlineSymbolInformationNode extends OutlineSymbolInformationNode {
    uri: string;
    range: Range;
}

export namespace MonacoOutlineSymbolInformationNode {
    export function is(node: TreeNode): node is MonacoOutlineSymbolInformationNode {
        return OutlineSymbolInformationNode.is(node) && 'uri' in node && 'range' in node;
    }
}
