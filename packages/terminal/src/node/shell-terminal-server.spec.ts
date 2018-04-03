/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';

import { testContainer } from './test/inversify.spec-config';
import { IShellTerminalServer } from '../common/shell-terminal-protocol';

describe('ShellServer', () => {
    const shellTerminalServer = testContainer.get<IShellTerminalServer>(IShellTerminalServer);

    test('test shell terminal create', async () => {
        const createResult = await shellTerminalServer.create({});
        await expect(createResult).toBeGreaterThan(-1);
        shellTerminalServer.close(createResult);
    }, 5000);
});
