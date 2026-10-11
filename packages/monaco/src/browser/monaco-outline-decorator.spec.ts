// *****************************************************************************
// Copyright (C) 2026 Vinay Kaushal and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import type { CompositeTreeNode, Tree } from '@theia/core/lib/browser/tree';
import type { TreeDecoration } from '@theia/core/lib/browser/tree/tree-decorator';
import type * as monaco from '@theia/monaco-editor-core';
import type { MonacoOutlineSymbolInformationNode } from './monaco-outline-contribution';

describe('MonacoOutlineDecorator', () => {

    // The outline code uses the full monaco API at runtime. Load it only once this suite runs: loading it while
    // the spec files are collected registers monaco's editor contributions before monaco-init.spec initializes
    // the standalone services, which then need browser APIs that JSDOM does not provide.
    let monacoApi: typeof monaco;
    let outline: typeof import('./monaco-outline-contribution');
    let decorator: typeof import('./monaco-outline-decorator');
    let disableJSDOM: () => void;

    before(async () => {
        disableJSDOM = enableJSDOM();
        // @lumino/dragdrop (pulled in transitively) extends the DragEvent DOM global at
        // module load, which JSDOM does not provide; stub it so the import succeeds.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(global as any).DragEvent) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (global as any).DragEvent = class DragEvent extends (global as any).Event { };
        }
        monacoApi = await import('@theia/monaco-editor-core');
        outline = await import('./monaco-outline-contribution');
        decorator = await import('./monaco-outline-decorator');
    });
    after(() => disableJSDOM());

    const range: monaco.IRange = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 10 };

    function symbol(name: string, detail: string, deprecated = false): monaco.languages.DocumentSymbol {
        const tags = deprecated ? [monacoApi.languages.SymbolTag.Deprecated] : [];
        return { name, detail, kind: monacoApi.languages.SymbolKind.Method, tags, range, selectionRange: range };
    }

    function createNode(documentSymbol: monaco.languages.DocumentSymbol): MonacoOutlineSymbolInformationNode {
        return new outline.MonacoOutlineContribution()['createNode'](new URI('file:///test.ts'), documentSymbol, new Map());
    }

    function decorate(...nodes: MonacoOutlineSymbolInformationNode[]): Promise<Map<string, TreeDecoration.Data>> {
        const root: CompositeTreeNode = { id: 'root', name: 'root', parent: undefined, children: nodes };
        return new decorator.MonacoOutlineDecorator().decorations({ root } as unknown as Tree);
    }

    it('marks a symbol tagged as deprecated', () => {
        expect(createNode(symbol('old', '', true)).deprecated).to.equal(true);
        expect(createNode(symbol('current', '')).deprecated).to.equal(false);
    });

    it('strikes through a deprecated symbol', async () => {
        const node = createNode(symbol('old', '', true));

        const decorations = await decorate(node);

        expect(decorations.get(node.id)?.fontData).to.deep.equal({ style: 'line-through' });
        expect(decorations.get(node.id)?.captionSuffixes).to.equal(undefined);
    });

    it('keeps the detail suffix of a deprecated symbol', async () => {
        const node = createNode(symbol('old', '(): void', true));

        const decorations = await decorate(node);

        expect(decorations.get(node.id)?.fontData).to.deep.equal({ style: 'line-through' });
        expect(decorations.get(node.id)?.captionSuffixes?.map(suffix => suffix.data)).to.deep.equal(['(): void']);
    });

    it('does not decorate a symbol that is neither deprecated nor has a detail', async () => {
        const node = createNode(symbol('current', ''));

        const decorations = await decorate(node);

        expect(decorations.has(node.id)).to.equal(false);
    });
});
