// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ApplicationShell, DepthFirstTreeIterator, NavigatableWidget, Tree, TreeDecoration, TreeDecorator } from '@theia/core/lib/browser';
import { FileSystemFrontendContribution } from '@theia/filesystem/lib/browser/filesystem-frontend-contribution';
import { Emitter } from '@theia/core';
import { FileStatNode } from '@theia/filesystem/lib/browser';
import { FileChangeType } from '@theia/filesystem/lib/common/files';

@injectable()
export class NavigatorDeletedEditorDecorator implements TreeDecorator {

    @inject(FileSystemFrontendContribution)
    protected readonly fileSystemContribution: FileSystemFrontendContribution;
    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    readonly id = 'theia-deleted-editor-decorator';
    protected readonly onDidChangeDecorationsEmitter = new Emitter();
    readonly onDidChangeDecorations = this.onDidChangeDecorationsEmitter.event;
    protected deletedURIs = new Set<string>();

    @postConstruct()
    init(): void {
        this.fileSystemContribution.onDidChangeEditorFile(({ editor, type }) => {
            const uri = editor.getResourceUri()?.toString();
            if (uri) {
                if (type === FileChangeType.DELETED) {
                    this.deletedURIs.add(uri);
                } else if (type === FileChangeType.ADDED) {
                    this.deletedURIs.delete(uri);
                }
                this.fireDidChangeDecorations((tree: Tree) => this.collectDecorators(tree));
            }
        });
        this.shell.onDidAddWidget(() => {
            const newDeletedURIs = new Set<string>();
            this.shell.widgets.forEach(widget => {
                if (NavigatableWidget.is(widget)) {
                    const uri = widget.getResourceUri()?.toString();
                    if (uri && this.deletedURIs.has(uri)) {
                        newDeletedURIs.add(uri);
                    }
                }
            });
            this.deletedURIs = newDeletedURIs;
        });
    }

    decorations(tree: Tree): Map<string, TreeDecoration.Data> {
        return this.collectDecorators(tree);
    }

    protected collectDecorators(tree: Tree): Map<string, TreeDecoration.Data> {
        const result = new Map<string, TreeDecoration.Data>();
        if (tree.root === undefined) {
            return result;
        }
        for (const node of new DepthFirstTreeIterator(tree.root)) {
            if (FileStatNode.is(node)) {
                const uri = node.uri.toString();
                if (this.deletedURIs.has(uri)) {
                    const deletedDecoration: TreeDecoration.Data = {
                        fontData: {
                            style: 'line-through',
                        }
                    };
                    result.set(node.id, deletedDecoration);
                }
            }
        }
        return result;
    }

    protected fireDidChangeDecorations(event: (tree: Tree) => Map<string, TreeDecoration.Data>): void {
        this.onDidChangeDecorationsEmitter.fire(event);
    }
}
