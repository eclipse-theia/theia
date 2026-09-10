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

import { expect } from 'chai';
import { RemoteCliArgsContribution } from '@theia/core/lib/common/remote-cli-args-contribution';
import { RemoteCliArgsCollector } from './remote-cli-args-collector';

function collectorWith(contributions: RemoteCliArgsContribution[]): RemoteCliArgsCollector {
    const collector = new RemoteCliArgsCollector();
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (collector as any).contributions = { getContributions: () => contributions };
    (collector as any).logger = { warn: () => { } };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return collector;
}

describe('RemoteCliArgsCollector', () => {

    it('flattens the args from every contribution', async () => {
        const collector = collectorWith([
            { getRemoteCliArgs: () => ['--session-preference=a=base64:MQ=='] },
            { getRemoteCliArgs: () => [] },
            { getRemoteCliArgs: async () => ['--x', '--y'] }
        ]);
        expect(await collector.collect()).to.deep.equal(['--session-preference=a=base64:MQ==', '--x', '--y']);
    });

    it('ignores a failing contribution and keeps the others', async () => {
        const collector = collectorWith([
            { getRemoteCliArgs: () => { throw new Error('boom'); } },
            { getRemoteCliArgs: () => ['--ok'] }
        ]);
        expect(await collector.collect()).to.deep.equal(['--ok']);
    });
});
