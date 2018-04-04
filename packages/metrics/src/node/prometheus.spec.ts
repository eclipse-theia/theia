/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { PROMETHEUS_REGEXP, toPrometheusValidName } from './prometheus';

// tslint:disable:no-unused-expression

describe("Prometheus helper module", () => {
    /* According to https://prometheus.io/docs/concepts/data_model/ */

    const validName = 'theia_extension3242-:';
    const invalidTheiaName = '@theia/something';
    const validTheiaName = 'theia_something';
    const invalidName2 = '@theia/?$%^ ';

    test("Should correctly validate a metric name", () => {
        expect(PROMETHEUS_REGEXP.test(validName)).toEqual(true);

        expect(PROMETHEUS_REGEXP.test(invalidTheiaName)).toEqual(false);

        expect(PROMETHEUS_REGEXP.test(invalidName2)).toEqual(false);

    });

    test("Should correctly return a valid name from an otherwise invalid prometheus string", () => {
        expect(PROMETHEUS_REGEXP.test(invalidTheiaName)).toEqual(false);

        const newName = toPrometheusValidName(invalidTheiaName);
        expect(PROMETHEUS_REGEXP.test(newName)).toEqual(true);
        expect(newName).toEqual(validTheiaName);

        const newName2 = toPrometheusValidName(invalidName2);
        expect(PROMETHEUS_REGEXP.test(newName2)).toEqual(true);
    });
});
