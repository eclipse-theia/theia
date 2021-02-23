/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { Emitter, Event, ResourceProvider } from '@theia/core';
import { DirtyDiffDecorator } from '../dirty-diff/dirty-diff-decorator';
import { DiffComputer } from '../dirty-diff/diff-computer';
import { ContentLines } from '../dirty-diff/content-lines';
import { EditorManager, TextEditor } from '@theia/editor/lib/browser';
import { ScmService } from '../scm-service';

export interface DecorationData {
    letter?: string;
    title?: string;
    color?: { id: string };
    priority?: number;
    bubble?: boolean;
    source?: string;
}

@injectable()
export class ScmDecorationsService {
    private readonly NavigatorDecorationsEmitter = new Emitter<Map<string, DecorationData>>();
    private readonly diffComputer: DiffComputer;
    private dirtyState: boolean = true;

    constructor(@inject(DirtyDiffDecorator) protected readonly decorator: DirtyDiffDecorator,
        @inject(ScmService) protected readonly scmService: ScmService,
        @inject(EditorManager) protected readonly editorManager: EditorManager,
        @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider) {
        this.diffComputer = new DiffComputer();
        this.editorManager.onCreated(async editor => this.applyEditorDecorations(editor.editor));
        this.scmService.onDidAddRepository(repository => repository.provider.onDidChange(() => {
            const editor = this.editorManager.currentEditor;
            if (editor) {
                if (this.dirtyState) {
                    this.applyEditorDecorations(editor.editor);
                    this.dirtyState = false;
                } else {
                    /** onDidChange event might be called several times one after another, so need to prevent repeated events. */
                    setTimeout(() => {
                        this.dirtyState = true;
                    }, 500);
                }
            }
        }));
        this.scmService.onDidChangeSelectedRepository(() => {
            const editor = this.editorManager.currentEditor;
            if (editor) {
                this.applyEditorDecorations(editor.editor);
            }
        });
    }

    async applyEditorDecorations(editor: TextEditor): Promise<void> {
        const currentRepo = this.scmService.selectedRepository;
        if (currentRepo) {
            try {
                const uri = editor.uri.withScheme(currentRepo.provider.id).withQuery(`{"ref":"", "path":"${editor.uri.path.toString()}"}`);
                const previousResource = await this.resourceProvider(uri);
                const previousContent = await previousResource.readContents();
                const previousLines = ContentLines.fromString(previousContent);
                const currentResource = await this.resourceProvider(editor.uri);
                const currentContent = await currentResource.readContents();
                const currentLines = ContentLines.fromString(currentContent);
                const { added, removed, modified } = this.diffComputer.computeDirtyDiff(ContentLines.arrayLike(previousLines), ContentLines.arrayLike(currentLines));
                this.decorator.applyDecorations({ editor: editor, added, removed, modified });
                currentResource.dispose();
                previousResource.dispose();
            } catch (e) {
                // Scm resource may not be found, do nothing.
            }
        }
    }

    get onNavigatorDecorationsChanged(): Event<Map<string, DecorationData>> {
        return this.NavigatorDecorationsEmitter.event;
    }

    fireNavigatorDecorationsChanged(data: Map<string, DecorationData>): void {
        this.NavigatorDecorationsEmitter.fire(data);
    }
}
