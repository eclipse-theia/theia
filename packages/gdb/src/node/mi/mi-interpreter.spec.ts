/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import * as chai from 'chai';
import 'mocha';
import * as chaiAsPromised from 'chai-as-promised'
import * as stream from 'stream';

import { testContainer } from '../inversify.spec-config';
import { MIInterpreter } from './mi-interpreter';
import { MIProtocol as MI } from './mi-protocol';
import { MIUtils } from './mi-spec-utils';

chai.use(chaiAsPromised);
/**
 * Globals
 */

const expect = chai.expect;

describe('MIInterpreter', function () {

    let miInterpreter: MIInterpreter;
    beforeEach(function () {
        miInterpreter = testContainer.get<MIInterpreter>(MIInterpreter);
    });

    it('should return a ConsoleStreamOutput Event', function () {
        const input = '~"this is an output string"\n(gdb) \n';

        const promise = MIUtils.waitForNamedEvent(miInterpreter, 'ConsoleStreamOutput');

        MIUtils.startWithInput(input,
            (inStream: stream.Readable, outStream: stream.PassThrough) => {
                miInterpreter.start(inStream, outStream);
            });

        return expect(promise).to.eventually.deep.equal(<MI.ConsoleStreamOutput>{
            type: "ConsoleStreamOutput",
            output: "this is an output string"
        });
    });

    it('should return multiple ConsoleStreamOutput Events', function () {
        let input = '~"this is an output string"\n';
        input = input.concat('~"this is an output string"\n');
        input = input.concat('(gdb) \n');

        const promise = MIUtils.waitForNamedEventCount(miInterpreter, 'ConsoleStreamOutput', 2);

        MIUtils.startWithInput(input,
            (inStream: stream.Readable, outStream: stream.PassThrough) => {
                miInterpreter.start(inStream, outStream);
            });

        return expect(promise).to.eventually.be.deep.equal([
            <MI.ConsoleStreamOutput>{
                type: "ConsoleStreamOutput",
                output: "this is an output string"
            },
            <MI.ConsoleStreamOutput>{
                type: "ConsoleStreamOutput",
                output: "this is an output string"
            }
        ]
        );
    });

    it('should return a ConsoleStreamOutput even if the message is split', function () {

        /* Setup in out stream for start */
        const inStream = new stream.Readable;
        const outStream = new stream.PassThrough();

        const firstInput = '~"this is an output';
        const secondInput = ' string"\n(gdb) \n';

        const promise = MIUtils.waitForNamedEvent(miInterpreter, 'ConsoleStreamOutput');

        inStream.push(firstInput);

        miInterpreter.start(inStream, outStream);

        inStream.push(secondInput);
        inStream.push(null);

        return expect(promise).to.eventually.deep.equal(<MI.ConsoleStreamOutput>{
            type: "ConsoleStreamOutput",
            output: "this is an output string"
        });
    });

    it('should return two ConsoleStreamOutput even if the message is split', function () {

        /* Setup in out stream for start */
        const inStream = new stream.Readable;
        const outStream = new stream.PassThrough();

        const firstInput = '~"this is an output';
        const secondInput = ' string"\n(gdb) \n~"this is an output';
        const thirdInput = ' string"\n(gdb) \n';
        const promise = MIUtils.waitForNamedEventCount(miInterpreter, 'ConsoleStreamOutput', 2);

        inStream.push(firstInput);

        miInterpreter.start(inStream, outStream);

        inStream.push(secondInput);
        inStream.push(thirdInput);
        inStream.push(null);

        return expect(promise).to.eventually.be.deep.equal([
            <MI.ConsoleStreamOutput>{
                type: "ConsoleStreamOutput",
                output: "this is an output string"
            },
            <MI.ConsoleStreamOutput>{
                type: "ConsoleStreamOutput",
                output: "this is an output string"
            }
        ]
        );
    });
});
