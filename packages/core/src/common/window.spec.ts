// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { LaunchArgv } from './window';

describe('LaunchArgv', () => {

    describe('getValue', () => {
        it('reads a "--name value" option', () => {
            expect(LaunchArgv.getValue(['--attach-container', 'B'], 'attach-container')).to.equal('B');
        });

        it('reads a "--name=value" option', () => {
            expect(LaunchArgv.getValue(['--attach-container=B'], 'attach-container')).to.equal('B');
        });

        it('returns the last value when the option is repeated', () => {
            expect(LaunchArgv.getValue(['--attach-container', 'A', '--attach-container', 'B'], 'attach-container')).to.equal('B');
        });

        it('returns undefined when the option is absent', () => {
            expect(LaunchArgv.getValue(['--dev-json'], 'attach-container')).to.be.undefined;
        });

        it('does not treat a following flag as the value', () => {
            expect(LaunchArgv.getValue(['--attach-container', '--dev-json'], 'attach-container')).to.be.undefined;
        });
    });

    describe('getValues', () => {
        it('collects every occurrence of a repeatable option', () => {
            const argv = ['--session-preference', 'a=1', '--session-preference=b=2', '--other', 'x'];
            expect(LaunchArgv.getValues(argv, 'session-preference')).to.deep.equal(['a=1', 'b=2']);
        });

        it('returns an empty array when absent', () => {
            expect(LaunchArgv.getValues(['--other'], 'session-preference')).to.deep.equal([]);
        });
    });

    describe('isNegated', () => {
        it('detects a "--no-name" flag', () => {
            expect(LaunchArgv.isNegated(['--no-dev-json'], 'dev-json')).to.be.true;
        });

        it('detects a "--name=false" flag', () => {
            expect(LaunchArgv.isNegated(['--dev-json=false'], 'dev-json')).to.be.true;
        });

        it('is false when the flag is present positively or absent', () => {
            expect(LaunchArgv.isNegated(['--dev-json'], 'dev-json')).to.be.false;
            expect(LaunchArgv.isNegated([], 'dev-json')).to.be.false;
        });
    });
});
