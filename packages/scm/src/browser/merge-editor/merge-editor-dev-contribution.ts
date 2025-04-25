// *****************************************************************************
// Copyright (C) 2025 1C-Soft LLC and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, DisposableCollection, generateUuid, InMemoryResources, MessageService, nls, QuickInputService, URI } from '@theia/core';
import { ApplicationShell, open, OpenerService } from '@theia/core/lib/browser';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { LanguageService } from '@theia/core/lib/browser/language-service';
import { MergeEditor, MergeEditorOpenerOptions, MergeEditorUri } from './merge-editor';

export namespace MergeEditorDevCommands {
    export const MERGE_EDITOR_DEV_CATEGORY = 'Merge Editor (Dev)';
    export const COPY_CONTENTS_TO_JSON = Command.toDefaultLocalizedCommand({
        id: 'mergeEditor.dev.copyContentsToJSON',
        label: 'Copy Merge Editor State as JSON',
        category: MERGE_EDITOR_DEV_CATEGORY
    });
    export const OPEN_CONTENTS_FROM_JSON = Command.toDefaultLocalizedCommand({
        id: 'mergeEditor.dev.openContentsFromJSON',
        label: 'Open Merge Editor State from JSON',
        category: MERGE_EDITOR_DEV_CATEGORY
    });
}

@injectable()
export class MergeEditorDevContribution implements CommandContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(ClipboardService)
    protected readonly clipboardService: ClipboardService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(LanguageService)
    protected readonly languageService: LanguageService;

    @inject(InMemoryResources)
    protected readonly inMemoryResources: InMemoryResources;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    protected getMergeEditor(widget = this.shell.currentWidget): MergeEditor | undefined {
        return widget instanceof MergeEditor ? widget : (widget?.parent ? this.getMergeEditor(widget.parent) : undefined);
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(MergeEditorDevCommands.COPY_CONTENTS_TO_JSON, {
            execute: widget => {
                const editor = this.getMergeEditor(widget);
                if (editor) {
                    this.copyContentsToJSON(editor);
                }
            },
            isEnabled: widget => !!this.getMergeEditor(widget),
            isVisible: widget => !!this.getMergeEditor(widget)
        });
        commands.registerCommand(MergeEditorDevCommands.OPEN_CONTENTS_FROM_JSON, {
            execute: () => this.openContentsFromJSON().catch(error => this.messageService.error(error.message))
        });
    }

    protected copyContentsToJSON(editor: MergeEditor): void {
        const { model } = editor;
        const editorContents: MergeEditorContents = {
            base: model.baseDocument.getText(),
            input1: model.side1Document.getText(),
            input2: model.side2Document.getText(),
            result: model.resultDocument.getText(),
            languageId: model.resultDocument.getLanguageId()
        };
        this.clipboardService.writeText(JSON.stringify(editorContents, undefined, 2));
        this.messageService.info(nls.localizeByDefault('Successfully copied merge editor state'));
    }

    protected async openContentsFromJSON(): Promise<void> {
        const inputText = await this.quickInputService.input({
            prompt: nls.localizeByDefault('Enter JSON'),
            value: await this.clipboardService.readText()
        });

        if (!inputText) {
            return;
        }

        const { base, input1, input2, result, languageId } = Object.assign<MergeEditorContents, unknown>({
            base: '',
            input1: '',
            input2: '',
            result: '',
            languageId: 'plaintext'
        }, JSON.parse(inputText));

        const extension = Array.from(this.languageService.getLanguage(languageId!)?.extensions ?? [''])[0];

        const parentUri = new URI('merge-editor-dev://' + generateUuid());
        const baseUri = parentUri.resolve('base' + extension);
        const side1Uri = parentUri.resolve('side1' + extension);
        const side2Uri = parentUri.resolve('side2' + extension);
        const resultUri = parentUri.resolve('result' + extension);

        const toDispose = new DisposableCollection();
        try {
            toDispose.push(this.inMemoryResources.add(baseUri, base));
            toDispose.push(this.inMemoryResources.add(side1Uri, input1));
            toDispose.push(this.inMemoryResources.add(side2Uri, input2));
            toDispose.push(this.inMemoryResources.add(resultUri, result));

            const uri = MergeEditorUri.encode({ baseUri, side1Uri, side2Uri, resultUri });
            const options: MergeEditorOpenerOptions = {
                widgetState: {
                    side1State: {
                        title: 'Left',
                        description: '(from JSON)'
                    },
                    side2State: {
                        title: 'Right',
                        description: '(from JSON)'
                    }
                }
            };
            await open(this.openerService, uri, options);
        } finally {
            toDispose.dispose();
        }
    }
}

export interface MergeEditorContents {
    base: string;
    input1: string;
    input2: string;
    result: string;
    languageId?: string;
}
