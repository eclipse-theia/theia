// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { ILogger, UNTITLED_SCHEME, URI } from '@theia/core';
import { DiffUris, LabelProvider, OpenerService, open } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { EditorManager } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { ChangeSetElement, ChangeSetImpl } from '../common';
import { createChangeSetFileUri } from './change-set-file-resource';

export const ChangeSetFileElementFactory = Symbol('ChangeSetFileElementFactory');
export type ChangeSetFileElementFactory = (elementProps: ChangeSetElementArgs) => ChangeSetFileElement;

export const ChangeSetElementArgs = Symbol('ChangeSetElementArgs');
export interface ChangeSetElementArgs extends Partial<ChangeSetElement> {
    /** The URI of the element, expected to be unique within the same change set. */
    uri: URI;
    /** The change set containing this element. */
    changeSet: ChangeSetImpl;
    /** The id of the chat session containing this change set element. */
    chatSessionId: string;
    /**
     * The state of the file after the changes have been applied.
     * If `undefined`, there is no change.
     */
    targetState?: string;
};

@injectable()
export class ChangeSetFileElement implements ChangeSetElement {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(ChangeSetElementArgs)
    protected readonly elementProps: ChangeSetElementArgs;

    @inject(WorkspaceService)
    protected readonly wsService: WorkspaceService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(MonacoWorkspace)
    protected readonly monacoWorkspace: MonacoWorkspace;

    @inject(FileService)
    protected readonly fileService: FileService;

    protected _state: 'pending' | 'applied' | 'rejected' | undefined;

    protected originalContent: string | undefined;

    @postConstruct()
    init(): void {
        this.obtainOriginalContent();
    }

    protected async obtainOriginalContent(): Promise<void> {
        const exists = await this.fileService.exists(this.uri);
        if (this.type === 'add' && !exists) {
            // no need to track original state
            return;
        }
        try {
            const document = this.monacoWorkspace.getTextDocument(this.uri.toString());
            if (document) {
                this.originalContent = document.getText();
            } else {
                this.originalContent = (await this.fileService.readFile(this.uri)).value.toString();
            }
        } catch (error) {
            this.logger.error('Failed to read original content of change set file element.', error);
        }
    }

    get uri(): URI {
        return this.elementProps.uri;
    }

    get name(): string {
        return this.elementProps.name ?? this.labelProvider.getName(this.uri);
    }

    get icon(): string | undefined {
        return this.elementProps.icon ?? this.labelProvider.getIcon(this.uri);
    }

    get additionalInfo(): string | undefined {
        const wsUri = this.wsService.getWorkspaceRootUri(this.uri);
        if (wsUri) {
            const wsRelative = wsUri.relative(this.uri);
            if (wsRelative?.hasDir) {
                return `${wsRelative.dir.toString()}`;
            }
            return '';
        }
        return this.labelProvider.getLongName(this.uri.parent);
    }

    get state(): 'pending' | 'applied' | 'rejected' | undefined {
        return this._state ?? this.elementProps.state;
    }

    protected set state(value: 'pending' | 'applied' | 'rejected' | undefined) {
        this._state = value;
        this.elementProps.changeSet.notifyChange();
    }

    get type(): 'add' | 'modify' | 'delete' | undefined {
        return this.elementProps.type;
    }

    get data(): { [key: string]: unknown; } | undefined {
        return this.elementProps.data;
    };

    get targetState(): string {
        return this.elementProps.targetState ?? '';
    }

    async open(): Promise<void> {
        const exists = await this.fileService.exists(this.uri);
        if (exists) {
            open(this.openerService, this.uri);
            return;
        }
        const editor = await this.editorManager.open(this.uri.withScheme(UNTITLED_SCHEME), {
            mode: 'reveal'
        });
        editor.editor.executeEdits([{
            newText: this.targetState,
            range: {
                start: {
                    character: 1,
                    line: 1,
                },
                end: {
                    character: 1,
                    line: 1,
                },
            }
        }]);
    }

    async openChange(): Promise<void> {
        const exists = await this.fileService.exists(this.uri);
        const openedUri = exists ? this.uri : this.uri.withScheme(UNTITLED_SCHEME);
        // Currently we don't have a great way to show the suggestions in a diff editor with accept/reject buttons
        // So we just use plain diffs with the suggestions as original and the current state as modified, so users can apply changes in their current state
        // But this leads to wrong colors and wrong label (revert change instead of accept change)
        const diffUri = DiffUris.encode(
            createChangeSetFileUri(this.elementProps.chatSessionId, this.uri),
            openedUri,
            `AI Changes: ${this.labelProvider.getName(this.uri)}`,
        );
        open(this.openerService, diffUri);
    }

    async accept(): Promise<void> {
        this.state = 'applied';
        if (this.type === 'delete') {
            await this.fileService.delete(this.uri);
            this.state = 'applied';
            return;
        }

        const exists = await this.fileService.exists(this.uri);
        if (!exists) {
            await this.fileService.create(this.uri, this.targetState);
        }
        await this.write(this.targetState);
    }

    protected async write(text: string): Promise<void> {
        const document = this.monacoWorkspace.getTextDocument(this.uri.toString());
        if (document) {
            this.monacoWorkspace.applyBackgroundEdit(document, [{
                range: document.textEditorModel.getFullModelRange(),
                text
            }], true);
        } else {
            await this.fileService.write(this.uri, text);
        }
    }

    async reject(): Promise<void> {
        this.state = 'rejected';
        const exists = await this.fileService.exists(this.uri);
        if (this.type === 'add' && exists) {
            await this.fileService.delete(this.uri);
            return;
        }
        if (this.type === 'delete' && !exists && this.originalContent) {
            await this.fileService.createFile(this.uri);
        }
        if (this.originalContent) {
            await this.write(this.originalContent);
        }
    }

}
