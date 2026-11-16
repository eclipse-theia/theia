// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

import { inject, injectable, named } from 'inversify';
import { FrontendApplicationContribution } from '../../browser/frontend-application-contribution.js';
import { ILogger } from '../../common/logger.js';
import { MessageService } from '../../common/message-service.js';
import { nls } from '../../common/nls.js';
import { PreferenceService } from '../../common/preferences/preference-service.js';
import { ShellEnvironmentResolutionTimeout, ShellEnvironmentResolution, ShellEnvironmentServer } from '../../common/shell-environment.js';

/**
 * Tells the user when the environment of the login shell could not be resolved, as the backend's child processes
 * may then not find the user's tools, and stores the resolution timeout preference for the next start of the backend,
 * which resolves the environment before the preferences are available.
 */
@injectable()
export class ElectronShellEnvironmentContribution implements FrontendApplicationContribution {

    @inject(ShellEnvironmentServer)
    protected readonly shellEnvironment: ShellEnvironmentServer;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    @inject(ILogger) @named('core:ElectronShellEnvironmentContribution')
    protected readonly logger: ILogger;

    onStart(): void {
        this.shellEnvironment.whenResolved().then(resolution => this.report(resolution))
            .catch(error => this.logger.warn('Could not learn whether the shell environment was resolved:', error));
        this.preferences.ready.then(() => {
            this.storeResolutionTimeout();
            this.preferences.onPreferenceChanged(event => {
                if (event.preferenceName === ShellEnvironmentResolutionTimeout.PREFERENCE) {
                    this.storeResolutionTimeout();
                }
            });
        });
    }

    protected report(resolution: ShellEnvironmentResolution): void {
        if (resolution.status === 'timeout') {
            this.messageService.warn(nls.localizeByDefault(
                'Unable to resolve your shell environment in a reasonable time. Please review your shell configuration and restart.'));
        } else if (resolution.status === 'failed') {
            this.messageService.warn(nls.localizeByDefault('Unable to resolve your shell environment: {0}', resolution.reason ?? ''));
        }
    }

    protected storeResolutionTimeout(): void {
        const configured = this.preferences.inspect<number>(ShellEnvironmentResolutionTimeout.PREFERENCE)?.globalValue;
        this.shellEnvironment.setResolutionTimeout(typeof configured === 'number' ? configured : undefined)
            .catch(error => this.logger.warn('Could not store the shell environment resolution timeout:', error));
    }
}
