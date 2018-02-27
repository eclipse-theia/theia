/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import { testContainer } from './test/inversify.spec-config';
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
    const terminalServer = testContainer.get<ITerminalServer>(ITerminalServer);
    const terminalWatcher = testContainer.get<TerminalWatcher>(TerminalWatcher);

    it('test terminal create', async function () {
        const args = ['--version'];
        const createResult = terminalServer.create({ command: process.execPath, 'args': args });
        expect(await createResult).to.be.greaterThan(-1);
    });

    it('test terminal create from non-existant path', async function () {
        terminalServer.setClient(terminalWatcher.getTerminalClient());
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
