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
import { PreferenceScope, PreferenceProvider, PreferenceProviderPriority } from '@theia/core/lib/browser';
import { WorkspaceService, WorkspaceData } from '@theia/workspace/lib/browser/workspace-service';
import { AbstractResourcePreferenceProvider } from './abstract-resource-preference-provider';

@injectable()
export class WorkspacePreferenceProvider extends AbstractResourcePreferenceProvider {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @postConstruct()
    protected async init(): Promise<void> {
        await super.init();
        this.workspaceService.onWorkspaceLocationChanged(workspaceFile => {
            if (workspaceFile && !workspaceFile.isDirectory) {
                this.toDisposeOnWorkspaceLocationChanged.dispose();
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

    canProvide(preferenceName: string, resourceUri?: string): { priority: number, provider: PreferenceProvider } {
        const value = this.get(preferenceName);
        if (value === undefined || value === null) {
            return super.canProvide(preferenceName, resourceUri);
        }
        if (resourceUri) {
            const folderPaths = this.getDomain().map(f => new URI(f).path);
            if (folderPaths.every(p => p.relativity(new URI(resourceUri).path) < 0)) {
                return super.canProvide(preferenceName, resourceUri);
            }
        }

        return { priority: PreferenceProviderPriority.Workspace, provider: this };
    }

    // tslint:disable-next-line:no-any
    protected parse(content: string): any {
        const data = super.parse(content);
        if (this.workspaceService.saved) {
            if (WorkspaceData.is(data)) {
                return data.settings || {};
            }
        }
        return data;
    }

    protected getPath(preferenceName: string): string[] {
        if (this.workspaceService.saved) {
            return ['settings', preferenceName];
        }
        return super.getPath(preferenceName);
    }

    protected getScope() {
        return PreferenceScope.Workspace;
    }

    getDomain(): string[] {
        const workspace = this.workspaceService.workspace;
        if (workspace) {
            return workspace.isDirectory
                ? [workspace.uri]
                : this.workspaceService.tryGetRoots().map(r => r.uri).concat([workspace.uri]); // workspace file is treated as part of the workspace
        }
        return [];
    }
}
