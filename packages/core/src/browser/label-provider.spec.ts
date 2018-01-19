/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { expect } from 'chai';
import { DefaultUriLabelProviderContribution } from './label-provider';
import URI from '../common/uri';

describe("DefaultUriLabelProviderContribution", function () {

    it("should return a short name", function () {
        const prov = new DefaultUriLabelProviderContribution();
        const shortName = prov.getName(new URI('file:///tmp/hello/you.txt'));

        expect(shortName).eq('you.txt');
    });

    it("should return a long name", function () {
        const prov = new DefaultUriLabelProviderContribution();
        const longName = prov.getLongName(new URI('file:///tmp/hello/you.txt'));

        expect(longName).eq('/tmp/hello/you.txt');
    });

    it("should return icon class for something that seems to be a file", function () {
        const prov = new DefaultUriLabelProviderContribution();
        const icon = prov.getIcon(new URI('file:///tmp/hello/you.txt'));

        expect(icon).eq('text-icon');
    });

    it("should return icon class for something that seems to be a directory", function () {
        const prov = new DefaultUriLabelProviderContribution();
        const icon = prov.getIcon(new URI('file:///tmp/hello'));

        expect(icon).eq('fa fa-folder');
    });
});
