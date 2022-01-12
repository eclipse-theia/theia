/********************************************************************************
 * Copyright (C) 2022 TypeFox and others.
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
import { compareVersion, parseVersion } from './vsx-version';

describe('parseVersion', () => {

    it('should succesfully parse 2', () => {
        expect(parseVersion('2')).to.be.deep.equal([2]);
    });

    it('should succesfully parse 2.4.3', () => {
        expect(parseVersion('2.4.3')).to.be.deep.equal([2, 4, 3]);
    });

    it('should fail parsing when non-numeric version is given', () => {
        expect(parseVersion('2.3-preview4')).to.be.equal(undefined);
    });
});

describe('compareVersion', () => {

    it('should correctly identify version equality', () => {
        const a = parseVersion('2.4.3')!;
        const b = parseVersion('2.4.3')!;
        expect(compareVersion(a, b)).to.be.equals(0);
    });

    it('should correctly identify larger version', () => {
        const larger = parseVersion('1.42.0')!;
        const smaller = parseVersion('1.14.4')!;
        expect(compareVersion(larger, smaller)).to.be.equals(1);
        expect(compareVersion(smaller, larger)).to.be.equals(-1);
    });

    it('should correctly identify larger version with less specificity', () => {
        const larger = parseVersion('1.42')!;
        const smaller = parseVersion('1.14.4')!;
        expect(compareVersion(larger, smaller)).to.be.equals(1);
        expect(compareVersion(smaller, larger)).to.be.equals(-1);
    });

    it('should correctly identify larger version with more specificity', () => {
        const larger = parseVersion('1.42.1')!;
        const smaller = parseVersion('1.42')!;
        expect(compareVersion(larger, smaller)).to.be.equals(1);
        expect(compareVersion(smaller, larger)).to.be.equals(-1);
    });

    it('should correctly identify version equality with more specificity', () => {
        const a = parseVersion('1.42.0')!;
        const b = parseVersion('1.42')!;
        expect(compareVersion(a, b)).to.be.equals(0);
    });
});
