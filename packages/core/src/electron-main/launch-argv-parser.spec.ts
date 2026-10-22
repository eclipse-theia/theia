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
import { LaunchArguments } from '../common/launch-arguments';
import { LaunchArgvParser } from './launch-argv-parser';

describe('LaunchArgvParser', () => {

    it('parses a "--name value" option', () => {
        const args = LaunchArgvParser.parse(['--attach-container', 'B']);
        expect(LaunchArguments.lastValue(args, 'attach-container')).to.equal('B');
    });

    it('parses a "--name=value" option', () => {
        const args = LaunchArgvParser.parse(['--attach-container=B']);
        expect(LaunchArguments.lastValue(args, 'attach-container')).to.equal('B');
    });

    it('keeps a value that itself contains "="', () => {
        const args = LaunchArgvParser.parse(['--session-preference=a=1']);
        expect(LaunchArguments.values(args, 'session-preference')).to.deep.equal(['a=1']);
    });

    it('collects repeated options in order, last winning for a single value', () => {
        const args = LaunchArgvParser.parse(['--session-preference', 'a=1', '--session-preference=b=2', '--other', 'x']);
        expect(LaunchArguments.values(args, 'session-preference')).to.deep.equal(['a=1', 'b=2']);
        expect(LaunchArguments.lastValue(args, 'session-preference')).to.equal('b=2');
    });

    it('does not consume a following option as a value', () => {
        const args = LaunchArgvParser.parse(['--attach-container', '--session-preference', 'a=1']);
        expect(LaunchArguments.lastValue(args, 'attach-container')).to.equal(undefined);
        expect(LaunchArguments.values(args, 'session-preference')).to.deep.equal(['a=1']);
    });

    it('reports an absent option as empty', () => {
        const args = LaunchArgvParser.parse(['--other']);
        expect(LaunchArguments.values(args, 'session-preference')).to.deep.equal([]);
        expect(LaunchArguments.lastValue(args, 'session-preference')).to.equal(undefined);
    });

    it('detects "--no-name" and "--name=false" negations', () => {
        expect(LaunchArguments.isNegated(LaunchArgvParser.parse(['--no-dev-json']), 'dev-json')).to.be.true;
        expect(LaunchArguments.isNegated(LaunchArgvParser.parse(['--dev-json=false']), 'dev-json')).to.be.true;
    });

    it('does not report a positive or absent flag as negated', () => {
        expect(LaunchArguments.isNegated(LaunchArgvParser.parse(['--dev-json']), 'dev-json')).to.be.false;
        expect(LaunchArguments.isNegated(LaunchArgvParser.parse([]), 'dev-json')).to.be.false;
    });

    it('ignores tokens that are not options', () => {
        const args = LaunchArgvParser.parse(['/path/to/app', 'positional', '--attach-container', 'B']);
        expect(LaunchArguments.lastValue(args, 'attach-container')).to.equal('B');
    });
});
