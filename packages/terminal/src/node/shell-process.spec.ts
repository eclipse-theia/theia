/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import * as chai from 'chai';
import { mergeProcessEnv } from './shell-process';

const expect = chai.expect;

describe('ShellProcess', function (): void {

    describe('#mergeProcessEnv', function (): void {

        this.timeout(5000);
        const PATH = 'PATH';

        it('should validate the presence of a known process variable', async function (): Promise<void> {
            const mergedEnv = mergeProcessEnv();
            expect(mergedEnv[PATH]).length.greaterThan(0);
        });

        it('should be possible to remove a known process variable', async function (): Promise<void> {
            // eslint-disable-next-line no-null/no-null
            const customizedEnv = { [PATH]: null };
            const mergedEnv = mergeProcessEnv(customizedEnv);
            expect(mergedEnv[PATH]).to.equal(undefined);
        });

        it('should be possible to override the value of a known process variable', async function (): Promise<void> {
            const expectedValue = '/path/to/one';
            const customizedEnv = { [PATH]: expectedValue };

            const mergedEnv = mergeProcessEnv(customizedEnv);
            expect(mergedEnv[PATH]).equals(expectedValue);
        });

        it('should not produce a different result when merging a previous result', async function (): Promise<void> {
            const variableName = 'NEW_VARIABLE';
            const expectedValue = 'true';
            const customizedEnv = { [variableName]: expectedValue };

            const mergedEnv = mergeProcessEnv(customizedEnv);
            expect(mergedEnv[variableName]).equals(expectedValue);
        });

        it('should not produce a different result when performing multiple merges', async function (): Promise<void> {
            const variableName = 'NEW_VARIABLE';
            const expectedValue = 'true';
            const customizedEnv = { [variableName]: expectedValue };

            const mergedEnv = mergeProcessEnv(customizedEnv);
            const mergedSecondPass = mergeProcessEnv(mergedEnv);
            expect(mergedEnv).to.deep.equal(mergedSecondPass);
        });
    });
});
