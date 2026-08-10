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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ContributionProvider, ILogger } from '@theia/core';
import { RemoteCliArgsContribution } from '@theia/core/lib/common/remote-cli-args-contribution';

/**
 * Collects the extra CLI arguments to pass to a remote backend from all
 * {@link RemoteCliArgsContribution}s. This carries per-window options (e.g. the forwarded
 * `--session-preference` values of a second-instance window) that the shared local backend cannot
 * provide. Usable by any remote attach flow (dev container, SSH) so they stay consistent.
 */
@injectable()
export class RemoteCliArgsCollector {

    @inject(ContributionProvider) @named(RemoteCliArgsContribution)
    protected readonly contributions: ContributionProvider<RemoteCliArgsContribution>;

    @inject(ILogger)
    protected readonly logger: ILogger;

    async collect(): Promise<string[]> {
        const args: string[] = [];
        for (const contribution of this.contributions.getContributions()) {
            try {
                args.push(...await contribution.getRemoteCliArgs());
            } catch (e) {
                this.logger.warn('Failed to collect remote CLI args from a contribution:', e);
            }
        }
        return args;
    }
}
