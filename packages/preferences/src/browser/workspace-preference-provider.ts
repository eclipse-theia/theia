/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { inject, injectable, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService, WorkspaceData } from '@theia/workspace/lib/browser/workspace-service';
import { AbstractResourcePreferenceProvider } from './abstract-resource-preference-provider';
import * as jsoncparser from 'jsonc-parser';

@injectable()
export class WorkspacePreferenceProvider extends AbstractResourcePreferenceProvider {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @postConstruct()
    protected async init(): Promise<void> {
        super.init();
        this.workspaceService.onSavedLocationChanged(workspaceFile => {
            if (workspaceFile && !workspaceFile.isDirectory) {
                this.toDispose.dispose();
                super.init();
            }
        });
    }

    async getUri(): Promise<URI | undefined> {
        await this.workspaceService.roots;
        const workspace = this.workspaceService.workspace;
        if (workspace) {
            const uri = new URI(workspace.uri);
            return workspace.isDirectory ? uri.resolve('.theia').resolve('settings.json') : uri;
        }
    }

    protected async readPreferences(): Promise<void> {
        const newContent = await this.readContents();
        const strippedContent = jsoncparser.stripComments(newContent);
        const data = jsoncparser.parse(strippedContent);
        if (this.workspaceService.saved) {
            if (WorkspaceData.is(data)) {
                this.preferences = data.settings || {};
            }
        } else {
            this.preferences = data || {};
        }
        this.onDidPreferencesChangedEmitter.fire(undefined);
    }

    protected getPath(preferenceName: string): string[] {
        if (this.workspaceService.saved) {
            return ['settings', preferenceName];
        }
        return super.getPath(preferenceName);
    }

}
