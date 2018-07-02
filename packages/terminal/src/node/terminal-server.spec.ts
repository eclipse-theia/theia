/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as chai from 'chai';
import { createTerminalTestContainer } from './test/terminal-test-container';
import { TerminalWatcher } from '../common/terminal-watcher';
import { ITerminalServer } from '../common/terminal-protocol';
import { IBaseTerminalExitEvent } from '../common/base-terminal-protocol';
import { isWindows } from "@theia/core/lib/common";

/**
 * Globals
 */

const expect = chai.expect;

describe('TermninalServer', function () {

    this.timeout(5000);
    let terminalServer: ITerminalServer;
    let terminalWatcher: TerminalWatcher;

    beforeEach(() => {
        const container = createTerminalTestContainer();
        terminalServer = container.get(ITerminalServer);
        terminalWatcher = container.get(TerminalWatcher);
    });

    it('test terminal create', async function () {
        const args = ['--version'];
        const createResult = terminalServer.create({ command: process.execPath, 'args': args });
        expect(await createResult).to.be.greaterThan(-1);
    });

    it('test terminal create from non-existant path', async function () {
        const createResult = terminalServer.create({ command: '/non-existant' });
        if (isWindows) {
            expect(await createResult).to.be.equal(-1);
        } else {
            const errorPromise = new Promise<void>((resolve, reject) => {
                createResult.then((termId: number) => {
                    terminalWatcher.onTerminalExit((event: IBaseTerminalExitEvent) => {
                        if (event.terminalId === termId) {
                            if (event.code === 1) {
                                resolve();
                            } else {
                                reject();
                            }
                        }
                    });
                });
            });

            expect(await createResult).to.be.greaterThan(-1);
            await errorPromise;
        }
    });
});
