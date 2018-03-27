/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { expect } from 'chai';
import { NavigationLocation } from './navigation-location';
import { NavigationLocationSimilarity } from './navigation-location-similarity';

// tslint:disable:no-unused-expression

describe('navigation-location-similarity', () => {

    const similarity = new NavigationLocationSimilarity();

    it('should never be similar if they belong to different resources', () => {
        expect(similarity.similar(
            NavigationLocation.create('file:///a', { line: 0, character: 0, }),
            NavigationLocation.create('file:///b', { line: 0, character: 0, })
        )).to.be.false;
    });

    it('should be true if the locations are withing the threshold', () => {
        expect(similarity.similar(
            NavigationLocation.create('file:///a', { start: { line: 0, character: 10 }, end: { line: 0, character: 15 } }),
            NavigationLocation.create('file:///a', { start: { line: 10, character: 3 }, end: { line: 0, character: 5 } })
        )).to.be.true;
    });

    it('should be false if the locations are outside of the threshold', () => {
        expect(similarity.similar(
            NavigationLocation.create('file:///a', { start: { line: 0, character: 10 }, end: { line: 0, character: 15 } }),
            NavigationLocation.create('file:///a', { start: { line: 11, character: 3 }, end: { line: 0, character: 5 } })
        )).to.be.true;
    });

});
