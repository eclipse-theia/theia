/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { expect } from 'chai';
import { OutputUri } from './output-uri';
import { fail } from 'assert';

describe('output-uri', () => {

    it('should fail when output channel name is an empty string', () => {
        try {
            OutputUri.create('');
            fail('Expected failure.');
        } catch (e) {
            expect(e.message).to.be.equal("'name' must be defined.");
        }
    });

    it('should fail when output channel name contains whitespace only', () => {
        try {
            OutputUri.create('  \t');
            fail('Expected failure.');
        } catch (e) {
            expect(e.message).to.be.equal("'name' must contain at least one non-whitespace character.");
        }
    });

    it('should handle whitespace', () => {
        const uri = OutputUri.create('foo bar');
        const name = OutputUri.channelName(uri);
        expect(name).to.be.equal('foo bar');
    });

    it('should handle special characters (:) gracefully', () => {
        const uri = OutputUri.create('foo: bar');
        const name = OutputUri.channelName(uri);
        expect(name).to.be.equal('foo: bar');
    });

});
