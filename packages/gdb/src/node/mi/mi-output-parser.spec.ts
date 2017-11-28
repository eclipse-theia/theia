/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import 'mocha';
import * as chaiAsPromised from 'chai-as-promised'
import { MIOutputParser } from './mi-output-parser';
import { MIProtocol as MI } from './mi-protocol';
import { testContainer } from '../inversify.spec-config'

chai.use(chaiAsPromised);
/**
 * Globals
 */

const expect = chai.expect;

describe('MIOutputParser', function () {

    let miParser: MIOutputParser;
    before(function () {
        miParser = testContainer.get<MIOutputParser>(MIOutputParser);
    });

    it('should make a simple exec-continue MICommand ', function () {
        const command = new MI.MICommand('exec-continue', 1);

        const miCommand = command.toMI();
        expect(miCommand).to.equal('1-exec-continue\n');

        const parsed = miParser.parse(command.toMI());
        expect(parsed).to.deep.equal({ token: 1, operation: 'exec-continue', options: [], parameters: [] });
    });

    it('should make an exec-continue with reverse option MICommand ', function () {
        const command = new MI.MICommand('exec-continue', 1);
        command.pushOption('reverse');

        const miCommand = command.toMI();
        expect(miCommand).to.equal('1-exec-continue -reverse\n');

        const parsed = miParser.parse(miCommand);
        expect(parsed).to.deep.equal({ token: 1, operation: 'exec-continue', options: [['reverse', undefined]], parameters: [] });
    });

    it('should make an exec-continue with reverse option and thread-group MICommand ', function () {
        const command = new MI.MICommand('exec-continue', 1);
        command.pushOption('reverse');
        command.pushOptionWithParameter(['thread-group', '1']);

        const miCommand = command.toMI();
        expect(miCommand).to.equal('1-exec-continue -reverse -thread-group 1\n');

        const parsed = miParser.parse(miCommand);
        expect(parsed).to.deep.equal({ token: 1, operation: 'exec-continue', options: [['reverse', undefined], ['thread-group', '1']], parameters: [] });
    });

    it('should make a break-after with 2 parameters MICommand ', function () {
        const command = new MI.MICommand('break-after', 1);
        command.pushParameters(['1', '3']);

        const miCommand = command.toMI();
        expect(miCommand).to.equal('1-break-after 1 3\n');

        const parsed = miParser.parse(miCommand);
        expect(parsed).to.deep.equal({ token: 1, operation: 'break-after', options: [], parameters: ['1', '3'] });
    });

    it('should make a break-after one option and 2 parameters MICommand ', function () {
        const command = new MI.MICommand('break-after', 1);
        command.pushOption('test');
        command.pushParameters(['1', '3']);

        const miCommand = command.toMI();
        expect(miCommand).to.equal('1-break-after -test -- 1 3\n');

        const parsed = miParser.parse(miCommand);
        expect(parsed).to.deep.equal({ token: 1, operation: 'break-after', options: [["test", undefined]], parameters: ['1', '3'] });
    });

    it('should make a simple info breakpoints CLICommand ', function () {
        const command = new MI.CLICommand('info breakpoints', 1);

        const miCommand = command.toMI();
        expect(miCommand).to.equal('1info breakpoints\n');

        const parsed = miParser.parse(miCommand);
        expect(parsed).to.deep.equal({ token: 1, command: 'info breakpoints' });
    });

});
