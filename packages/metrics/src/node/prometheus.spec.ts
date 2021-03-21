/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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
import { PROMETHEUS_REGEXP, toPrometheusValidName } from './prometheus';

const expect = chai.expect;

/* eslint-disable no-unused-expressions */

describe('Prometheus helper module', () => {
    /* According to https://prometheus.io/docs/concepts/data_model/ */

    const validName = 'theia_extension3242-:';
    const invalidTheiaName = '@theia/something';
    const validTheiaName = 'theia_something';
    const invalidName2 = '@theia/?$%^ ';

    it('Should correctly validate a metric name', () => {
        expect(PROMETHEUS_REGEXP.test(validName)).to.be.true;

        expect(PROMETHEUS_REGEXP.test(invalidTheiaName)).to.be.false;

        expect(PROMETHEUS_REGEXP.test(invalidName2)).to.be.false;

    });

    it('Should correctly return a valid name from an otherwise invalid prometheus string', () => {
        expect(PROMETHEUS_REGEXP.test(invalidTheiaName)).to.be.false;

        const newName = toPrometheusValidName(invalidTheiaName);
        expect(PROMETHEUS_REGEXP.test(newName)).to.be.true;
        expect(newName).to.be.equal(validTheiaName);

        const newName2 = toPrometheusValidName(invalidName2);
        expect(PROMETHEUS_REGEXP.test(newName2)).to.be.true;
    });
});
