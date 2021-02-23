/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { OpenerService } from '@theia/core/lib/browser/opener-service';
import { MockOpenerService } from '@theia/core/lib/browser/test/mock-opener-service';
import { NavigationLocationUpdater } from './navigation-location-updater';
import { NoopNavigationLocationUpdater } from './test/mock-navigation-location-updater';
import { NavigationLocationSimilarity } from './navigation-location-similarity';
import { CursorLocation, Position, NavigationLocation } from './navigation-location';
import { NavigationLocationService } from './navigation-location-service';

disableJSDOM();

/* eslint-disable no-unused-expressions */

describe('navigation-location-service', () => {

    let stack: NavigationLocationService;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        stack = init();
    });

    it('should not allow navigating back when the stack is empty', () => {
        expect(stack.canGoBack()).to.be.false;
    });

    it('should not allow navigating back when the stack has a single location', () => {
        stack.register(createCursorLocation());
        expect(stack.canGoBack()).to.be.false;
    });

    it('should allow navigating back when the stack has more than one locations', () => {
        stack.register(
            createCursorLocation(),
            createCursorLocation({ line: 100, character: 100 })
        );
        expect(stack.canGoBack()).to.be.true;
    });

    it('should not allow navigating forward when the stack is empty', () => {
        expect(stack.canGoForward()).to.be.false;
    });

    it('should not allow navigating forward when the pointer points to the end last element of the stack', () => {
        stack.register(
            createCursorLocation(),
            createCursorLocation({ line: 100, character: 100 })
        );
        expect(stack.canGoForward()).to.be.false;
    });

    it('should not exceed the max stack item', () => {
        stack.register(...[...Array(100).keys()].map(i => createCursorLocation({ line: i * 10, character: i }, `file://${i}`)));
        expect(stack.locations().length).to.be.lessThan(100);
    });

    describe('last-edit-location', async () => {

        it('should return with undefined if the stack contains no modifications', () => {
            stack.register(
                createCursorLocation(),
                createCursorLocation({ line: 100, character: 100 })
            );
            expect(stack.lastEditLocation()).to.be.undefined;
        });

        it('should return with the location of the last modification', () => {
            const expected = NavigationLocation.create('file://path/to/file', {
                text: '',
                range: { start: { line: 200, character: 0 }, end: { line: 500, character: 0 } },
                rangeLength: 0
            });
            stack.register(
                createCursorLocation(),
                expected,
                createCursorLocation({ line: 100, character: 100 })
            );
            expect(stack.lastEditLocation()).to.be.deep.equal(expected);
        });

        it('should return with the location of the last modification even if the pointer is not on the head', async () => {
            const modificationLocation = NavigationLocation.create('file://path/to/file', {
                text: '',
                range: { start: { line: 300, character: 0 }, end: { line: 500, character: 0 } },
                rangeLength: 0
            });
            const expected = NavigationLocation.create('file://path/to/file', {
                text: '',
                range: { start: { line: 700, character: 0 }, end: { line: 800, character: 0 } },
                rangeLength: 0
            });
            stack.register(
                createCursorLocation(),
                modificationLocation,
                createCursorLocation({ line: 100, character: 100 }),
                expected
            );
            await stack.back();
            await stack.back();
            expect(stack.currentLocation()).to.be.deep.equal(modificationLocation);
            expect(stack.lastEditLocation()).to.be.deep.equal(expected);
        });

    });

    function createCursorLocation(context: Position = { line: 0, character: 0, }, uri: string = 'file://path/to/file'): CursorLocation {
        return NavigationLocation.create(uri, context);
    }

    function init(): NavigationLocationService {
        const container = new Container({ defaultScope: 'Singleton' });
        container.bind(NavigationLocationService).toSelf();
        container.bind(NavigationLocationSimilarity).toSelf();
        container.bind(MockOpenerService).toSelf();
        container.bind(MockLogger).toSelf();
        container.bind(ILogger).toService(MockLogger);
        container.bind(NoopNavigationLocationUpdater).toSelf();
        container.bind(NavigationLocationUpdater).toService(NoopNavigationLocationUpdater);
        container.bind(OpenerService).toService(MockOpenerService);
        return container.get(NavigationLocationService);
    }

});
