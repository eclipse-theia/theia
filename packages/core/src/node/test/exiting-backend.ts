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

/**
 * Script for tests: creates a `BackendApplication`, which installs its process handlers, starts a
 * child process, prints the PID of the child and exits with code {@link EXITING_BACKEND_EXIT_CODE}.
 * The `exit` handler of the `BackendApplication` then terminates the process tree.
 */

import 'reflect-metadata';
import * as cp from 'child_process';
import { Container } from 'inversify';
import { bindContributionProvider, ILogger, Stopwatch } from '../../common';
import { MockLogger } from '../../common/test/mock-logger';
import {
    BackendApplication, BackendApplicationCliContribution, BackendApplicationContribution, EarlyExpressMiddleware, RootContainer
} from '../backend-application';
import { NodeStopwatch } from '../performance/node-stopwatch';
import { ProcessUtils } from '../process-utils';

export const EXITING_BACKEND_EXIT_CODE = 3;

if (require.main === module) {
    const container = new Container();
    container.bind(RootContainer).toConstantValue(container);
    container.bind(ILogger).to(MockLogger).inSingletonScope();
    container.bind(Stopwatch).to(NodeStopwatch).inSingletonScope();
    container.bind(ProcessUtils).toSelf().inSingletonScope();
    container.bind(BackendApplicationCliContribution).toSelf().inSingletonScope();
    container.bind(EarlyExpressMiddleware).toSelf().inSingletonScope();
    bindContributionProvider(container, BackendApplicationContribution);
    container.bind(BackendApplication).toSelf().inSingletonScope();
    container.get(BackendApplication);

    const child = cp.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    child.on('spawn', () => process.stdout.write(`${child.pid}\n`, () => process.exit(EXITING_BACKEND_EXIT_CODE)));
}
