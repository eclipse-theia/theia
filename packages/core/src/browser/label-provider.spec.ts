/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';

import { DefaultUriLabelProviderContribution } from './label-provider';
import URI from '../common/uri';

describe("DefaultUriLabelProviderContribution", () => {

    test("should return a short name", () => {
        const prov = new DefaultUriLabelProviderContribution();
        const shortName = prov.getName(new URI('file:///tmp/hello/you.txt'));

        expect(shortName).toEqual('you.txt');
    });

    test("should return a long name", () => {
        const prov = new DefaultUriLabelProviderContribution();
        const longName = prov.getLongName(new URI('file:///tmp/hello/you.txt'));

        expect(longName).toEqual('/tmp/hello/you.txt');
    });

    test(
        "should return icon class for something that seems to be a file",
        () => {
            const prov = new DefaultUriLabelProviderContribution();
            const icon = prov.getIcon(new URI('file:///tmp/hello/you.txt'));

            expect(icon).toEqual('text-icon');
        }
    );

    test(
        "should return icon class for something that seems to be a directory",
        () => {
            const prov = new DefaultUriLabelProviderContribution();
            const icon = prov.getIcon(new URI('file:///tmp/hello'));

            expect(icon).toEqual('fa fa-folder');
        }
    );
});
