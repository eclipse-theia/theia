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
import { inject, injectable } from '@theia/core/shared/inversify';
import { EditorManager } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { ChangeSetFileElement } from './change-set-file-element';

@injectable()
export class ChangeSetFileService {
    @inject(ILogger)
    protected readonly logger: ILogger;

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

    async read(uri: URI): Promise<string | undefined> {
        const exists = await this.fileService.exists(uri);
        if (!exists) {
            return undefined;
        }
        try {
            const document = this.monacoWorkspace.getTextDocument(uri.toString());
            if (document) {
                return document.getText();
            }
            return (await this.fileService.readFile(uri)).value.toString();
        } catch (error) {
            this.logger.error('Failed to read original content of change set file element.', error);
            return undefined;
        }
    }

    getName(uri: URI): string {
        return this.labelProvider.getName(uri);
    }

    getIcon(uri: URI): string | undefined {
        return this.labelProvider.getIcon(uri);
    }

    getAdditionalInfo(uri: URI): string | undefined {
        const wsUri = this.wsService.getWorkspaceRootUri(uri);
        if (wsUri) {
            const wsRelative = wsUri.relative(uri);
            if (wsRelative?.hasDir) {
                return `${wsRelative.dir.toString()}`;
            }
            return '';
        }
        return this.labelProvider.getLongName(uri.parent);
    }

    async open(element: ChangeSetFileElement): Promise<void> {
        const exists = await this.fileService.exists(element.uri);
        if (exists) {
            await open(this.openerService, element.uri);
            return;
        }
        await this.editorManager.open(element.changedUri, {
            mode: 'reveal'
        });
    }

    async openDiff(originalUri: URI, suggestedUri: URI): Promise<void> {
        const exists = await this.fileService.exists(originalUri);
        const openedUri = exists ? originalUri : originalUri.withScheme(UNTITLED_SCHEME);
        // Currently we don't have a great way to show the suggestions in a diff editor with accept/reject buttons
        // So we just use plain diffs with the suggestions as original and the current state as modified, so users can apply changes in their current state
        // But this leads to wrong colors and wrong label (revert change instead of accept change)
        const diffUri = DiffUris.encode(openedUri, suggestedUri,
            `AI Changes: ${this.labelProvider.getName(originalUri)}`,
        );
        open(this.openerService, diffUri);
    }

    async delete(uri: URI): Promise<void> {
        const exists = await this.fileService.exists(uri);
        if (exists) {
            await this.fileService.delete(uri);
        }
    }

    async write(uri: URI, targetState: string): Promise<void> {
        const exists = await this.fileService.exists(uri);
        if (!exists) {
            await this.fileService.create(uri, targetState);
        }
        await this.doWrite(uri, targetState);
    }

    protected async doWrite(uri: URI, text: string): Promise<void> {
        const document = this.monacoWorkspace.getTextDocument(uri.toString());
        if (document) {
            await this.monacoWorkspace.applyBackgroundEdit(document, [{
                range: document.textEditorModel.getFullModelRange(),
                text
            }], (editor, wasDirty) => editor === undefined || !wasDirty);
        } else {
            await this.fileService.write(uri, text);
        }
    }

}
