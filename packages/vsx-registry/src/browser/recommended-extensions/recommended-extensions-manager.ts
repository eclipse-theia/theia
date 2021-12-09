/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { PreferenceScope, PreferenceService } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';

@injectable()
export class RecommendedExtensionsManager {

    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(FileService) protected readonly fileService: FileService;
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;

    async openRecommendations(): Promise<void> {
        const workspaceUri = this.workspaceService.workspace;
        if (!workspaceUri) {
            return;
        }
        const configUri = this.preferenceService.getConfigUri(PreferenceScope.Folder, workspaceUri.resource.toString(), 'extensions');
        if (configUri) {
            await this.doOpen(configUri);
        }
    }

    protected async doOpen(configUri: URI): Promise<EditorWidget | undefined> {
        if (!await this.fileService.exists(configUri)) {
            await this.doCreate(configUri);
        }
        return this.editorManager.open(configUri, { mode: 'activate' });
    }

    protected async doCreate(configUri: URI): Promise<void> {
        await this.fileService.write(configUri, this.getInitialRecommendedContent());
    }

    protected getInitialRecommendedContent(): string {
        return [
            '{',
            '\t// Extension identifier format: ${publisher}.${name}. Example: vscode.csharp',
            '',
            '\t// List of extensions which should be recommended for users of this workspace.',
            '\t"recommendations": [',
            '\t\t',
            '\t],',
            '\t// List of extensions recommended by the application that should not be recommended for users of this workspace.',
            '\t"unwantedRecommendations": [',
            '\t\t',
            '\t]',
            '}'
        ].join('\n');
    }

}
