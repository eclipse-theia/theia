// *****************************************************************************
// Copyright (C) 2021 SAP SE or an SAP affiliate company and others.
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

import { injectable, inject, optional } from '@theia/core/shared/inversify';
import {
    DiffUris, TreeWidget, TreeProps, ContextMenuRenderer, TreeNode, TreeModel,
    CompositeTreeNode, NodeProps, QuickViewService
} from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { BulkEditInfoNode, BulkEditNode } from './bulk-edit-tree';
import { BulkEditTreeModel } from './bulk-edit-tree-model';
import { FileResourceResolver } from '@theia/filesystem/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { EditorWidget, EditorManager, EditorOpenerOptions } from '@theia/editor/lib/browser';
import { MEMORY_TEXT } from '@theia/core/lib/common';
import { Disposable } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';
import { ResourceEdit, ResourceFileEdit, ResourceTextEdit } from '@theia/monaco-editor-core/esm/vs/editor/browser/services/bulkEditService';

export const BULK_EDIT_TREE_WIDGET_ID = 'bulkedit';
export const BULK_EDIT_WIDGET_NAME = nls.localizeByDefault('Refactor Preview');

@injectable()
export class BulkEditTreeWidget extends TreeWidget {
    private editorWidgets: EditorWidget[] = [];

    @inject(FileResourceResolver)
    protected readonly fileResourceResolver: FileResourceResolver;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(QuickViewService) @optional()
    protected readonly quickView: QuickViewService;

    constructor(
        @inject(TreeProps) readonly treeProps: TreeProps,
        @inject(BulkEditTreeModel) override readonly model: BulkEditTreeModel,
        @inject(ContextMenuRenderer) override readonly contextMenuRenderer: ContextMenuRenderer
    ) {
        super(treeProps, model, contextMenuRenderer);

        this.id = BULK_EDIT_TREE_WIDGET_ID;
        this.title.label = BULK_EDIT_WIDGET_NAME;
        this.title.caption = BULK_EDIT_WIDGET_NAME;
        this.title.closable = true;
        this.addClass('theia-bulk-edit-container');

        this.toDispose.push(Disposable.create(() => {
            this.disposeEditors();
        }));
    }

    async initModel(edits: ResourceEdit[]): Promise<void> {
        await this.model.initModel(edits, await this.getFileContentsMap(edits));
        this.quickView?.showItem(BULK_EDIT_WIDGET_NAME);
    }

    protected override tapNode(node?: TreeNode): void {
        super.tapNode(node);
        if (BulkEditNode.is(node)) {
            this.doOpen(node);
        }
    }

    protected override handleDown(event: KeyboardEvent): void {
        const node = this.model.getNextSelectableNode();
        super.handleDown(event);
        if (BulkEditNode.is(node)) {
            this.doOpen(node);
        }
    }

    protected override handleUp(event: KeyboardEvent): void {
        const node = this.model.getPrevSelectableNode();
        super.handleUp(event);
        if (BulkEditNode.is(node)) {
            this.doOpen(node);
        }
    }

    protected override renderTree(model: TreeModel): React.ReactNode {
        if (CompositeTreeNode.is(model.root) && model.root.children.length > 0) {
            return super.renderTree(model);
        }
        return <div className='theia-widget-noInfo noEdits'>{nls.localizeByDefault('Made no edits')}</div>;
    }

    protected override renderCaption(node: TreeNode, props: NodeProps): React.ReactNode {
        if (BulkEditInfoNode.is(node)) {
            return this.decorateBulkEditInfoNode(node);
        } else if (BulkEditNode.is(node)) {
            return this.decorateBulkEditNode(node);
        }
        return 'caption';
    }

    protected decorateBulkEditNode(node: BulkEditNode): React.ReactNode {
        if (node?.parent && node?.bulkEdit && ('textEdit' in node?.bulkEdit)) {
            const bulkEdit = node.bulkEdit;
            const parent = node.parent as BulkEditInfoNode;

            if (parent?.fileContents) {
                const lines = parent.fileContents.split('\n');
                const startLineNum = +bulkEdit.textEdit?.range?.startLineNumber;

                if (lines.length > startLineNum) {
                    const startColumn = +bulkEdit.textEdit.range.startColumn;
                    const endColumn = +bulkEdit.textEdit.range.endColumn;
                    const lineText = lines[startLineNum - 1];
                    const beforeMatch = (startColumn > 26 ? '... ' : '') + lineText.substring(0, startColumn - 1).slice(-25);
                    const replacedText = lineText.substring(startColumn - 1, endColumn - 1);
                    const afterMatch = lineText.substring(startColumn - 1 + replacedText.length, startColumn - 1 + replacedText.length + 75);

                    return <div className='bulkEditNode'>
                        <div className='message'>
                            {beforeMatch}
                            <span className="replaced-text">{replacedText}</span>
                            <span className="inserted-text">{bulkEdit.textEdit.text}</span>
                            {afterMatch}
                        </div>
                    </div>;
                }
            }
        }
    }

    protected decorateBulkEditInfoNode(node: BulkEditInfoNode): React.ReactNode {
        const icon = this.toNodeIcon(node);
        const name = this.toNodeName(node);
        const description = this.toNodeDescription(node);
        const path = this.labelProvider.getLongName(node.uri.withScheme('bulkedit'));
        return <div title={path} className='bulkEditInfoNode'>
            {icon && <div className={icon + ' file-icon'}></div>}
            <div className='name'>{name}</div>
            <div className='path'>{description}</div>
        </div>;
    }

    private async getFileContentsMap(edits: ResourceEdit[]): Promise<Map<string, string>> {
        const fileContentMap = new Map<string, string>();

        if (edits) {
            for (const element of edits) {
                if (element) {
                    const filePath = (('newResource' in element) && (element as ResourceFileEdit).newResource?.path) ||
                        (('resource' in element) && (element as ResourceTextEdit).resource.path);

                    if (filePath && !fileContentMap.has(filePath)) {
                        const fileUri = new URI(filePath).withScheme('file');
                        const resource = await this.fileResourceResolver.resolve(fileUri);
                        fileContentMap.set(filePath, await resource.readContents());
                    }
                }
            }
        }
        return fileContentMap;
    }

    private async doOpen(node: BulkEditNode): Promise<void> {
        if (node && node.parent && node.bulkEdit && ('edit' in node.bulkEdit)) {
            const resultNode = node.parent as BulkEditInfoNode;
            const leftUri = node.uri;
            const rightUri = await this.createReplacePreview(resultNode);
            const diffUri = DiffUris.encode(leftUri, rightUri);
            const editorWidget = await this.editorManager.open(diffUri, this.getEditorOptions(node));
            this.editorWidgets.push(editorWidget);
        }
    }

    private async createReplacePreview(bulkEditInfoNode: BulkEditInfoNode): Promise<URI> {
        const fileUri = bulkEditInfoNode.uri;
        let lines: string[] = [];
        if (bulkEditInfoNode?.fileContents) {
            lines = bulkEditInfoNode.fileContents.split('\n');
            bulkEditInfoNode.children.map((node: BulkEditNode) => {
                if (node.bulkEdit && ('textEdit' in node.bulkEdit)) {
                    const startLineNum = node.bulkEdit.textEdit.range.startLineNumber;
                    if (lines.length > startLineNum) {
                        const startColumn = node.bulkEdit.textEdit.range.startColumn;
                        const endColumn = node.bulkEdit.textEdit.range.endColumn;
                        const lineText = lines[startLineNum - 1];
                        const beforeMatch = lineText.substring(0, startColumn - 1);
                        const replacedText = lineText.substring(startColumn - 1, endColumn - 1);
                        const afterMatch = lineText.substring(startColumn - 1 + replacedText.length);
                        lines[startLineNum - 1] = beforeMatch + node.bulkEdit.textEdit.text + afterMatch;
                    }
                }
            });
        }

        return fileUri.withScheme(MEMORY_TEXT).withQuery(lines.join('\n'));
    }

    private getEditorOptions(node: BulkEditNode): EditorOpenerOptions {
        let options = {};
        if (('textEdit' in node.bulkEdit) && node?.bulkEdit?.textEdit?.range) {
            options = {
                selection: {
                    start: {
                        line: node.bulkEdit.textEdit.range.startLineNumber - 1,
                        character: node.bulkEdit.textEdit.range.startColumn - 1
                    },
                    end: {
                        line: node.bulkEdit.textEdit.range.endLineNumber - 1,
                        character: node.bulkEdit.textEdit.range.endColumn - 1
                    }
                }
            };
        }
        return options;
    }

    private disposeEditors(): void {
        this.editorWidgets.forEach(w => w.dispose());
        this.quickView?.hideItem(BULK_EDIT_WIDGET_NAME);
    }
}
