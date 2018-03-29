/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import { PROMETHEUS_REGEXP, toPrometheusValidName } from './prometheus';

const expect = chai.expect;

// tslint:disable:no-unused-expression

describe("Prometheus helper module", () => {
    /* According to https://prometheus.io/docs/concepts/data_model/ */

    const validName = 'theia_extension3242-:';
    const invalidTheiaName = '@theia/something';
    const validTheiaName = 'theia_something';
    const invalidName2 = '@theia/?$%^ ';

    it("Should correctly validate a metric name", () => {
        expect(PROMETHEUS_REGEXP.test(validName)).to.be.true;

        expect(PROMETHEUS_REGEXP.test(invalidTheiaName)).to.be.false;

        expect(PROMETHEUS_REGEXP.test(invalidName2)).to.be.false;

    });

    it("Should correctly return a valid name from an otherwise invalid prometheus string", () => {
        expect(PROMETHEUS_REGEXP.test(invalidTheiaName)).to.be.false;

        const newName = toPrometheusValidName(invalidTheiaName);
        expect(PROMETHEUS_REGEXP.test(newName)).to.be.true;
        expect(newName).to.be.equal(validTheiaName);

        const newName2 = toPrometheusValidName(invalidName2);
        expect(PROMETHEUS_REGEXP.test(newName2)).to.be.true;
    });
});
