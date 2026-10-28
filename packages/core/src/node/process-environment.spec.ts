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

import * as chai from 'chai';
import { ILogger } from '../common/logger';
import { PROCESS_ENVIRONMENT_PENDING_VARIABLE, ProcessEnvironmentImpl, ProcessEnvironmentMessage } from './process-environment';

const expect = chai.expect;

/**
 * The service with the request made explicitly, a short timeout and the logger replaced, in a process that
 * pretends to have an IPC channel to its parent.
 */
class TestProcessEnvironment extends ProcessEnvironmentImpl {
    readonly warnings: string[] = [];
    protected override readonly timeoutMs = 50;
    protected override readonly logger = {
        warn: (message: string) => { this.warnings.push(message); }
    } as unknown as ILogger;

    constructor() {
        super();
        this.request();
    }
}

describe('ProcessEnvironmentImpl', () => {

    const variable = 'THEIA_PROCESS_ENVIRONMENT_SPEC_PATH';
    const sent: unknown[] = [];
    let originalSend: typeof process.send;

    beforeEach(() => {
        sent.length = 0;
        originalSend = process.send;
        process.send = (message: unknown) => {
            sent.push(message);
            return true;
        };
        delete process.env[PROCESS_ENVIRONMENT_PENDING_VARIABLE];
        delete process.env[variable];
    });

    afterEach(() => {
        process.send = originalSend;
        delete process.env[PROCESS_ENVIRONMENT_PENDING_VARIABLE];
        delete process.env[variable];
    });

    function answer(env: NodeJS.ProcessEnv): void {
        const response: ProcessEnvironmentMessage.Response = { type: ProcessEnvironmentMessage.Response.TYPE, env };
        process.emit('message', response, undefined);
    }

    it('is ready at once when the parent announced nothing', async () => {
        const environment = new TestProcessEnvironment();
        await environment.ready;
        expect(sent).to.deep.equal([]);
        expect(environment.warnings).to.deep.equal([]);
    });

    it('is ready at once without an IPC channel even if the environment is announced as pending', async () => {
        process.env[PROCESS_ENVIRONMENT_PENDING_VARIABLE] = 'pending';
        process.send = undefined;
        const environment = new TestProcessEnvironment();
        await environment.ready;
        expect(process.env[PROCESS_ENVIRONMENT_PENDING_VARIABLE]).to.equal(undefined);
    });

    it('requests the environment, applies the answer and drops the announcement', async () => {
        process.env[PROCESS_ENVIRONMENT_PENDING_VARIABLE] = 'pending';
        const environment = new TestProcessEnvironment();
        expect(sent).to.deep.equal([{ type: ProcessEnvironmentMessage.Request.TYPE }]);
        // the announcement is dropped as soon as it has been read, so that child processes do not inherit it
        expect(process.env[PROCESS_ENVIRONMENT_PENDING_VARIABLE]).to.equal(undefined);

        let ready = false;
        environment.ready.then(() => { ready = true; });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(ready).to.equal(false);

        process.emit('message', { type: 'something else' }, undefined);
        answer({ [variable]: '/from/login/shell' });
        await environment.ready;
        expect(process.env[variable]).to.equal('/from/login/shell');
        expect(environment.warnings).to.deep.equal([]);
    });

    it('gives up with a warning when the parent does not answer in time', async () => {
        process.env[PROCESS_ENVIRONMENT_PENDING_VARIABLE] = 'pending';
        const environment = new TestProcessEnvironment();
        await environment.ready;
        expect(environment.warnings).to.have.length(1);
        expect(process.env[PROCESS_ENVIRONMENT_PENDING_VARIABLE]).to.equal(undefined);

        // a late answer is ignored
        answer({ [variable]: '/too/late' });
        expect(process.env[variable]).to.equal(undefined);
    });
});
