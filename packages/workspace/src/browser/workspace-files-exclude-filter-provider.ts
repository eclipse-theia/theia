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

import { Emitter, Event } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { FileSystemPreferences } from '@theia/filesystem/lib/common';
import { WorkspaceSearchFilterProvider } from './workspace-search-filter-service';

/**
 * A workspace search filter provider that contributes the user-configurable
 * "Files: Exclude" settings from the preferences.
 */
@injectable()
export class WorkspaceFilesExcludeFilterProvider implements WorkspaceSearchFilterProvider {

    @inject(FileSystemPreferences)
    protected readonly fsPreferences: FileSystemPreferences;

    protected readonly onExclusionGlobsChangedEmitter = new Emitter<void>();
    readonly onExclusionGlobsChanged: Event<void> = this.onExclusionGlobsChangedEmitter.event;

    @postConstruct()
    protected init(): void {
        this.fsPreferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'files.exclude') {
                this.onExclusionGlobsChangedEmitter.fire();
            }
        });
    }

    getExclusionGlobs(): string[] {
        const filesExclude = this.fsPreferences['files.exclude'];
        return Object.keys(filesExclude).filter(key => !!filesExclude[key]);
    }
}
