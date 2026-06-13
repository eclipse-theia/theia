// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { parseListLaunchConfigurationArgs } from './qaap-launch-list-args';

describe('parseListLaunchConfigurationArgs', () => {

    it('treats empty tool args as no filter', () => {
        expect(parseListLaunchConfigurationArgs('')).to.deep.equal({});
        expect(parseListLaunchConfigurationArgs('   ')).to.deep.equal({});
    });

    it('parses explicit filter args', () => {
        expect(parseListLaunchConfigurationArgs('{"filter":"node"}')).to.deep.equal({ filter: 'node' });
    });
});
