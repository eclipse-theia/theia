// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import * as monaco from '@theia/monaco-editor-core';
import { ILogger } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { OutputUri } from '../common/output-uri.js';
import { OutputLinkComputer } from './output-link-computer.js';

/**
 * Makes paths of workspace files in output channels clickable.
 */
@injectable()
export class OutputLinkProvider implements FrontendApplicationContribution, monaco.languages.LinkProvider {

    @inject(OutputLinkComputer)
    protected readonly linkComputer: OutputLinkComputer;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(ILogger) @named('output:OutputLinkProvider')
    protected readonly logger: ILogger;

    protected registration: monaco.IDisposable | undefined;
    protected updateCount = 0;

    onStart(): void {
        this.workspaceService.roots.then(roots => this.updateWorkspaceFolders(roots));
        this.workspaceService.onWorkspaceChanged(roots => this.updateWorkspaceFolders(roots));
    }

    provideLinks(model: monaco.editor.ITextModel): monaco.languages.ILinksList {
        return { links: this.linkComputer.computeLinks(model.getLinesContent()) };
    }

    protected async updateWorkspaceFolders(roots: FileStat[]): Promise<void> {
        const update = ++this.updateCount;
        try {
            const folders = await Promise.all(roots.map(async root => ({
                uri: root.resource,
                fsPath: await this.fileService.fsPath(root.resource)
            })));
            if (update !== this.updateCount) {
                // a newer update is in progress
                return;
            }
            this.linkComputer.setWorkspaceFolders(folders);
            // registering again makes Monaco recompute the links of open output channels
            this.registration?.dispose();
            this.registration = folders.length ? monaco.languages.registerLinkProvider({ scheme: OutputUri.SCHEME }, this) : undefined;
        } catch (error) {
            this.logger.error('Failed to update the workspace folders of output links', error);
        }
    }
}
