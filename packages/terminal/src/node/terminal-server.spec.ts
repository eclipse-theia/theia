/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import * as chai from 'chai';
import 'mocha';
import * as chaiAsPromised from 'chai-as-promised';
import { testContainer } from './test/inversify.spec-config';
import { TerminalWatcher } from '../common/terminal-watcher';
import { ITerminalServer } from '../common/terminal-protocol';
import { IBaseTerminalExitEvent } from '../common/base-terminal-protocol';
import { isWindows } from "@theia/core/lib/common";

chai.use(chaiAsPromised);

/**
 * Globals
 */

const expect = chai.expect;

describe('TermninalServer', function () {

    this.timeout(5000);
    const terminalServer = testContainer.get<ITerminalServer>(ITerminalServer);
    const terminalWatcher = testContainer.get<TerminalWatcher>(TerminalWatcher);

    it('test terminal create', function () {
        const args = ['--version'];
        const createResult = terminalServer.create({ command: process.execPath, 'args': args });
        return expect(createResult).to.be.eventually.greaterThan(-1);
    });

    it('test terminal create from non-existant path', function () {
        terminalServer.setClient(terminalWatcher.getTerminalClient());
        const createResult = terminalServer.create({ command: '/non-existant' });
        if (isWindows) {
            return expect(createResult).to.eventually.equal(-1);
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

            return Promise.all([
                expect(createResult).to.be.eventually.greaterThan(-1),
                expect(errorPromise).to.be.eventually.fulfilled],
            );
        }
    });
});
