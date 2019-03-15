/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { TextEditorsExt, EditorChangedPropertiesData, TextEditorPositionData, TextEditorsMain, PLUGIN_RPC_CONTEXT } from '../api/plugin-api';
import { RPCProtocol } from '../api/rpc-protocol';
import * as theia from '@theia/plugin';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { EditorsAndDocumentsExtImpl } from './editors-and-documents';
import { TextEditorExt } from './text-editor';
import * as Converters from './type-converters';
import { TextEditorSelectionChangeKind } from './types-impl';
import { IdGenerator } from '../common/id-generator';

export class TextEditorsExtImpl implements TextEditorsExt {

    private readonly _onDidChangeTextEditorSelection = new Emitter<theia.TextEditorSelectionChangeEvent>();
    private readonly _onDidChangeTextEditorOptions = new Emitter<theia.TextEditorOptionsChangeEvent>();
    private readonly _onDidChangeTextEditorVisibleRanges = new Emitter<theia.TextEditorVisibleRangesChangeEvent>();
    private readonly _onDidChangeTextEditorViewColumn = new Emitter<theia.TextEditorViewColumnChangeEvent>();
    private readonly _onDidChangeActiveTextEditor = new Emitter<theia.TextEditor | undefined>();
    private readonly _onDidChangeVisibleTextEditors = new Emitter<theia.TextEditor[]>();

    readonly onDidChangeTextEditorSelection: Event<theia.TextEditorSelectionChangeEvent> = this._onDidChangeTextEditorSelection.event;
    readonly onDidChangeTextEditorOptions = this._onDidChangeTextEditorOptions.event;
    readonly onDidChangeTextEditorVisibleRanges = this._onDidChangeTextEditorVisibleRanges.event;
    readonly onDidChangeTextEditorViewColumn = this._onDidChangeTextEditorViewColumn.event;
    readonly onDidChangeActiveTextEditor = this._onDidChangeActiveTextEditor.event;
    readonly onDidChangeVisibleTextEditors = this._onDidChangeVisibleTextEditors.event;

    private proxy: TextEditorsMain;

    constructor(rpc: RPCProtocol, private editorsAndDocuments: EditorsAndDocumentsExtImpl) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.TEXT_EDITORS_MAIN);

        this.editorsAndDocuments.onDidChangeActiveTextEditor(e => this._onDidChangeActiveTextEditor.fire(e));
        this.editorsAndDocuments.onDidChangeVisibleTextEditors(e => this._onDidChangeVisibleTextEditors.fire(e));
    }
    $acceptEditorPropertiesChanged(id: string, props: EditorChangedPropertiesData): void {
        const textEditor = this.editorsAndDocuments.getEditor(id);
        if (!textEditor) {
            return;
        }

        if (props.options) {
            textEditor.acceptOptions(props.options);
        }
        if (props.selections) {
            const selections = props.selections.selections.map(Converters.toSelection);
            textEditor.acceptSelections(selections);
        }

        if (props.visibleRanges) {
            const visibleRanges = props.visibleRanges.map(Converters.toRange);
            textEditor.acceptVisibleRanges(visibleRanges);
        }

        if (props.options) {
            this._onDidChangeTextEditorOptions.fire({
                textEditor,
                options: props.options
            });
        }

        if (props.selections) {
            const kind = TextEditorSelectionChangeKind.fromValue(props.selections.source);
            const selections = props.selections.selections.map(Converters.toSelection);
            this._onDidChangeTextEditorSelection.fire({
                textEditor,
                selections,
                kind
            });
        }

        if (props.visibleRanges) {
            const visibleRanges = props.visibleRanges.map(Converters.toRange);
            this._onDidChangeTextEditorVisibleRanges.fire({
                textEditor,
                visibleRanges
            });
        }
    }
    $acceptEditorPositionData(data: TextEditorPositionData): void {
        for (const id in data) {
            if (data.hasOwnProperty(id)) {
                const textEditor = this.editorsAndDocuments.getEditor(id);
                const viewColumn = Converters.toViewColumn(data[id]);
                if (textEditor && viewColumn) {
                    if (textEditor.viewColumn !== viewColumn) {
                        textEditor.acceptViewColumn(viewColumn);
                        this._onDidChangeTextEditorViewColumn.fire({ textEditor, viewColumn });
                    }
                }
            }
        }
    }

    getActiveEditor(): TextEditorExt | undefined {
        return this.editorsAndDocuments.activeEditor();
    }

    getVisibleTextEditors(): theia.TextEditor[] {
        return this.editorsAndDocuments.allEditors();
    }

    createTextEditorDecorationType(options: theia.DecorationRenderOptions): theia.TextEditorDecorationType {
        return new TextEditorDecorationType(this.proxy, options);
    }

    applyWorkspaceEdit(edit: theia.WorkspaceEdit): Promise<boolean> {
        const dto = Converters.fromWorkspaceEdit(edit, this.editorsAndDocuments);
        return this.proxy.$tryApplyWorkspaceEdit(dto);
    }

    saveAll(includeUntitled?: boolean): PromiseLike<boolean> {
        return this.proxy.$saveAll(includeUntitled);
    }

}

export class TextEditorDecorationType implements theia.TextEditorDecorationType {

    private static readonly Keys = new IdGenerator('TextEditorDecorationType');

    private proxy: TextEditorsMain;
    public key: string;

    constructor(proxy: TextEditorsMain, options: theia.DecorationRenderOptions) {
        this.key = TextEditorDecorationType.Keys.nextId();
        this.proxy = proxy;
        // tslint:disable-next-line:no-any
        this.proxy.$registerTextEditorDecorationType(this.key, <any>options);
    }

    dispose(): void {
        this.proxy.$removeTextEditorDecorationType(this.key);
    }
}
