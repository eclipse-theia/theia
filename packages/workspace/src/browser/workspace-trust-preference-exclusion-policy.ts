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

import { Emitter, Event } from '@theia/core/lib/common';
import { PreferenceExclusionContext, PreferenceExclusionPolicy, PreferenceScope } from '@theia/core/lib/common/preferences';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { WorkspaceTrustService } from './workspace-trust-service.js';

/**
 * While the workspace isn't trusted, workspace and folder settings don't apply to preferences marked `restricted`.
 * While the trust state is being resolved, the workspace counts as untrusted.
 */
@injectable()
export class WorkspaceTrustPreferenceExclusionPolicy implements PreferenceExclusionPolicy {

    @inject(WorkspaceTrustService)
    protected readonly trustService: WorkspaceTrustService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        this.trustService.onDidChangeWorkspaceTrust(() => this.onDidChangeEmitter.fire());
    }

    isExcluded(preferenceName: string, { scope, property }: PreferenceExclusionContext): boolean {
        return this.trustService.currentWorkspaceTrust !== true
            && !!property?.restricted
            && (scope === PreferenceScope.Workspace || scope === PreferenceScope.Folder);
    }
}
