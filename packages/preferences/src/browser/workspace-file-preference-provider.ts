/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { PreferenceScope } from '@theia/core/lib/browser/preferences';
import { WorkspaceService, WorkspaceData } from '@theia/workspace/lib/browser/workspace-service';
import { AbstractResourcePreferenceProvider } from './abstract-resource-preference-provider';

@injectable()
export class WorkspaceFilePreferenceProviderOptions {
    workspaceUri: URI;
}

export const WorkspaceFilePreferenceProviderFactory = Symbol('WorkspaceFilePreferenceProviderFactory');
export type WorkspaceFilePreferenceProviderFactory = (options: WorkspaceFilePreferenceProviderOptions) => WorkspaceFilePreferenceProvider;

@injectable()
export class WorkspaceFilePreferenceProvider extends AbstractResourcePreferenceProvider {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(WorkspaceFilePreferenceProviderOptions)
    protected readonly options: WorkspaceFilePreferenceProviderOptions;

    protected sectionsInsideSettings = new Set<string>();

    protected getUri(): URI {
        return this.options.workspaceUri;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected parse(content: string): any {
        const data = super.parse(content);
        if (WorkspaceData.is(data)) {
            const settings = { ...data.settings };
            for (const key of this.configurations.getSectionNames().filter(name => name !== 'settings')) {
                // If the user has written configuration inside the "settings" object, we will respect that.
                if (settings[key]) {
                    this.sectionsInsideSettings.add(key);
                }
                // Favor sections outside the "settings" object to agree with VSCode behavior
                if (data[key]) {
                    settings[key] = data[key];
                    this.sectionsInsideSettings.delete(key);
                }
            }
            return settings;
        }
        return {};
    }

    protected getPath(preferenceName: string): string[] {
        const firstSegment = preferenceName.split('.')[0];
        if (firstSegment && this.configurations.isSectionName(firstSegment)) {
            // Default to writing sections outside the "settings" object.
            const path = [firstSegment];
            const pathRemainder = preferenceName.slice(firstSegment.length + 1);
            if (pathRemainder) {
                path.push(pathRemainder);
            }
            // If the user has already written this section inside the "settings" object, modify it there.
            if (this.sectionsInsideSettings.has(firstSegment)) {
                path.unshift('settings');
            }
            return path;
        }
        return ['settings', preferenceName];
    }

    protected getScope(): PreferenceScope {
        return PreferenceScope.Workspace;
    }

    getDomain(): string[] {
        // workspace file is treated as part of the workspace
        return this.workspaceService.tryGetRoots().map(r => r.resource.toString()).concat([this.options.workspaceUri.toString()]);
    }
}
