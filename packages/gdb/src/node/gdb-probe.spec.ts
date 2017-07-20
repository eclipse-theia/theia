/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import * as chai from 'chai';
import 'mocha';
import * as chaiAsPromised from 'chai-as-promised'
import { testContainer } from './inversify.spec-config';
import { GDBProbe } from './gdb-probe';

chai.use(chaiAsPromised);

/**
 * Globals
 */

let expect = chai.expect;


describe('GDBProbe', function () {

    let gdbProbe: GDBProbe;
    beforeEach(function () {
        gdbProbe = testContainer.get<GDBProbe>(GDBProbe);
    });

    it('test for GDB new-ui support', function () {
        return expect(gdbProbe.probeCommand('new-ui')).to.eventually.equal(true);
    });
});