/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import * as chai from 'chai';
import 'mocha';
import * as chaiAsPromised from 'chai-as-promised'
import { testContainer } from '../inversify.spec-config';
import { IMIDebugger } from './mi-debugger';
import * as yargs from 'yargs';

chai.use(chaiAsPromised);

/**
 * Globals
 */


const expect = chai.expect;

const debuggerPath = 'gdb';
const debuggerArgs: string[] = yargs.parse('-i=mi').argv;


describe('MIDebugger', function () {
    let miDebugger: IMIDebugger;
    beforeEach(function () {
        miDebugger = testContainer.get<IMIDebugger>(IMIDebugger);
    });

    it('should not start GDB, invalid path', function () {
        const promise = miDebugger.start({ command: '/non-existing-1', args: [] });
        return expect(promise).to.eventually.be.rejectedWith(Error);
    });

    it('should not start GDB, invalid args', function () {
        const promise = miDebugger.start({ command: debuggerPath, args: ['-non-existing'] });
        return expect(promise).to.eventually.be.rejectedWith(Error, 'Exited with code: 1');
    });

    it('should start GDB', function () {
        const promise = miDebugger.start({ command: debuggerPath, args: debuggerArgs });
        // FIXME this should be digested by the debugger, for now return the raw mi output
        return expect(promise).to.eventually.deep.equal(
            {
                "properties": [
                    [
                        "features",
                        [
                            "frozen-varobjs",
                            "pending-breakpoints",
                            "thread-info",
                            "data-read-memory-bytes",
                            "breakpoint-notifications",
                            "ada-task-info",
                            "language-option",
                            "info-gdb-mi-command",
                            "undefined-command-error-code",
                            "exec-run-start-option",
                            "python"
                        ]
                    ]
                ],
                "resultClass": "done",
                "token": 0,
                "type": "ResultRecord",
            }
        );
    });
});
