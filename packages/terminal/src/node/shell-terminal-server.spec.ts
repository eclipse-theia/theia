/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import * as chai from 'chai';
import { createTerminalTestContainer } from './test/terminal-test-container';
import { IShellTerminalServer } from '../common/shell-terminal-protocol';

/**
 * Globals
 */

const expect = chai.expect;

describe('ShellServer', function () {

    this.timeout(5000);
    let shellTerminalServer: IShellTerminalServer;

    beforeEach(() => {
        shellTerminalServer = createTerminalTestContainer().get(IShellTerminalServer);
    });

    it('test shell terminal create', async function () {
        const createResult = shellTerminalServer.create({});

        expect(await createResult).to.be.greaterThan(-1);
    });
});
