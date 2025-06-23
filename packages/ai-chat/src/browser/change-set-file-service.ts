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

import { ILogger, URI } from '@theia/core';
import { ApplicationShell, DiffUris, LabelProvider, NavigatableWidget, OpenerService, open } from '@theia/core/lib/browser';
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

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

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
        const diffUri = this.getDiffUri(originalUri, suggestedUri);
        open(this.openerService, diffUri);
    }

    protected getDiffUri(originalUri: URI, suggestedUri: URI): URI {
        return DiffUris.encode(originalUri, suggestedUri,
            `AI Changes: ${this.labelProvider.getName(originalUri)}`,
        );
    }

    async delete(uri: URI): Promise<void> {
        const exists = await this.fileService.exists(uri);
        if (exists) {
            await this.fileService.delete(uri);
        }
    }

    /** Returns true if there was a document available to save for the specified URI. */
    async trySave(suggestedUri: URI): Promise<boolean> {
        const openModel = this.monacoWorkspace.getTextDocument(suggestedUri.toString());
        if (openModel) {
            await openModel.save();
            return true;
        } else {
            return false;
        }
    }

    async writeFrom(from: URI, to: URI, fallbackContent: string): Promise<void> {
        const authoritativeContent = this.monacoWorkspace.getTextDocument(from.toString())?.getText() ?? fallbackContent;
        await this.write(to, authoritativeContent);
    }

    async write(uri: URI, text: string): Promise<void> {
        const document = this.monacoWorkspace.getTextDocument(uri.toString());
        if (document) {
            await this.monacoWorkspace.applyBackgroundEdit(document, [{
                range: document.textEditorModel.getFullModelRange(),
                text
            }], () => true);
        } else {
            await this.fileService.write(uri, text);
        }
    }

    closeDiffsForSession(sessionId: string, except?: URI[]): void {
        const openEditors = this.shell.widgets.filter(widget => {
            const uri = NavigatableWidget.getUri(widget);
            return uri && uri.authority === sessionId && !except?.some(candidate => candidate.path.toString() === uri.path.toString());
        });
        openEditors.forEach(editor => editor.close());
    }

    closeDiff(uri: URI): void {
        const openEditors = this.shell.widgets.filter(widget => NavigatableWidget.getUri(widget)?.isEqual(uri));
        openEditors.forEach(editor => editor.close());
    }
}
