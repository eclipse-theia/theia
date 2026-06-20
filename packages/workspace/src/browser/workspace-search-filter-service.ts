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

import { ContributionProvider, Emitter, Event } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';

export const WorkspaceSearchFilterProvider = Symbol('WorkspaceSearchFilterProvider');

/**
 * Interface for a provider of workspace search filters to the {@link WorkspaceSearchFilterService}.
 * Currently, only exclusion globs can be provided.
 */
export interface WorkspaceSearchFilterProvider {
    /** Obtain zero or more file glob patterns for exclusions from searches in the workspace. */
    getExclusionGlobs(): string[];
    /** An event signalling when the exclusion globs provided by this provider have changed. */
    readonly onExclusionGlobsChanged: Event<void>;
}

/**
 * A service providing workspace search filters to clients performing searches over files in the
 * workspace. Clients may use these filters in whatever way makes most sense for them.
 */
@injectable()
export class WorkspaceSearchFilterService {

    @inject(ContributionProvider) @named(WorkspaceSearchFilterProvider)
    protected readonly providers: ContributionProvider<WorkspaceSearchFilterProvider>;

    protected readonly onExclusionGlobsChangedEmitter = new Emitter<void>();
    /** An event signalling when the exclusion globs provided by this provider have changed. */
    readonly onExclusionGlobsChanged: Event<void> = this.onExclusionGlobsChangedEmitter.event;

    protected exclusionGlobs: string[] | undefined;

    @postConstruct()
    protected init(): void {
        for (const provider of this.providers.getContributions()) {
            provider.onExclusionGlobsChanged(() => {
                this.exclusionGlobs = undefined;
                this.onExclusionGlobsChangedEmitter.fire();
            });
        }
    }

    /**
     * Obtain zero or more glob patterns matching files to exclude from searches in the workspace.
     */
    getExclusionGlobs(): string[] {
        if (this.exclusionGlobs === undefined) {
            const globs = new Set<string>();
            for (const provider of this.providers.getContributions()) {
                for (const glob of provider.getExclusionGlobs()) {
                    globs.add(glob);
                }
            }
            this.exclusionGlobs = [...globs];
        }
        return this.exclusionGlobs;
    }
}
