// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { nls } from '@theia/core/lib/common/nls';
import { WorkspaceRestrictionContribution, WorkspaceRestriction } from '@theia/workspace/lib/browser/workspace-trust-service';
import { AIActivationService } from '@theia/ai-core/lib/browser';

@injectable()
export class AIWorkspaceRestrictionContribution implements WorkspaceRestrictionContribution {

    @inject(AIActivationService)
    protected readonly activationService: AIActivationService;

    getRestrictions(): WorkspaceRestriction[] {
        if (this.activationService.isActive && !this.activationService.canRun) {
            return [{
                label: nls.localize('theia/ai/ide/restrictedModeLabel',
                    'AI Features (disabled in Restricted Mode)'),
                details: [nls.localize('theia/ai/ide/restrictedModeDetails',
                    'AI chat, inline suggestions, code actions, and prompt templates are disabled')]
            }];
        }
        return [];
    }
}
