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

import { inject, injectable } from '@theia/core/shared/inversify';
import { RemoteCliArgsContribution } from '@theia/core/lib/common/remote-cli-args-contribution';
import { LaunchArgv } from '@theia/core/lib/common/window';
import { WindowLaunchArgs } from '@theia/core/lib/browser/window/window-launch-args';
import { CliPreferenceEntry } from '../common/cli-preferences';

/**
 * Re-applies `--session-preference` values on a remote backend that is started for a *forwarded*
 * (second-instance) window.
 *
 * The shared local backend only knows the preferences of the original cold-start launch, so its
 * `RemoteCliContribution#enhanceArgs` cannot supply the right values for a window opened by a
 * later launch. This frontend contribution reads the session preferences forwarded to the current
 * window (redeemed from the trusted main process) and formats them as CLI arguments for the remote
 * backend.
 */
@injectable()
export class SessionPreferenceRemoteCliContribution implements RemoteCliArgsContribution {

    @inject(WindowLaunchArgs)
    protected readonly launchArgs: WindowLaunchArgs;

    async getRemoteCliArgs(): Promise<string[]> {
        const forwarded = await this.launchArgs.getLaunchArgs();
        if (forwarded === undefined) {
            // Cold-start window: the shared backend already forwards its session preferences.
            return [];
        }
        return CliPreferenceEntry
            .parseAll(LaunchArgv.getValues(forwarded, 'session-preference'))
            .map(entry => CliPreferenceEntry.toArg('session-preference', entry));
    }
}
