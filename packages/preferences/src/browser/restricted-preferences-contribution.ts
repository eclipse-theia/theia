// *****************************************************************************
// Copyright (C) 2026 CodeSignal and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { nls, PreferenceExclusionService, PreferenceScope } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { WorkspaceRestriction, WorkspaceRestrictionContribution, WorkspaceTrustService } from '@theia/workspace/lib/browser/workspace-trust-service';

/**
 * Lists the workspace and folder settings that aren't applied in the tooltip of the Restricted Mode status bar item.
 */
@injectable()
export class RestrictedPreferencesContribution implements WorkspaceRestrictionContribution, FrontendApplicationContribution {

    @inject(PreferenceExclusionService)
    protected readonly exclusionService: PreferenceExclusionService;

    @inject(WorkspaceTrustService)
    protected readonly trustService: WorkspaceTrustService;

    onStart(): void {
        this.exclusionService.onDidChangeExcludedPreferences(() => this.trustService.refreshRestrictedModeIndicator());
    }

    getRestrictions(): WorkspaceRestriction[] {
        const names = new Set(this.exclusionService.getExcludedPreferences()
            .filter(({ scope }) => scope === PreferenceScope.Workspace || scope === PreferenceScope.Folder)
            .map(({ preferenceName }) => preferenceName));
        if (!names.size) {
            return [];
        }
        return [{
            label: nls.localize('theia/preferences/restrictedSettings', 'Workspace settings that are not applied in Restricted Mode'),
            details: Array.from(names).sort()
        }];
    }
}
