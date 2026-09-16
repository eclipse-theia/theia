// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { ILogger, PreferenceService } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { RegistryAutoUpdateService } from './registry-auto-update-service';

/**
 * Runs the AI registry update check once per window load, after the layout is up so it never
 * competes with application start-up. There is deliberately no polling: an update landing
 * mid-session is picked up on the next window load.
 */
@injectable()
export class RegistryAutoUpdateContribution implements FrontendApplicationContribution {

    @inject(RegistryAutoUpdateService)
    protected readonly autoUpdateService: RegistryAutoUpdateService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(ILogger) @named('ai-registry:RegistryAutoUpdateContribution')
    protected readonly logger: ILogger;

    onDidInitializeLayout(): void {
        this.preferenceService.ready
            .then(() => this.autoUpdateService.check())
            .catch(error => {
                this.logger.error('AI registry auto-update check failed.', error);
            });
    }
}
