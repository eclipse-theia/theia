// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as assert from 'assert';
import { enableJSDOM } from './test/jsdom';

let disableJSDOM = enableJSDOM();

import { getActiveWindow } from './secondary-window-handler';
import { SecondaryWindowService } from './window/secondary-window-service';

describe('getActiveWindow', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('should return the main window when no secondary window service is provided', () => {
        const result = getActiveWindow();
        assert.strictEqual(result, window);
    });

    it('should return the main window when no secondary windows exist', () => {
        const mockService: Pick<SecondaryWindowService, 'getWindows'> = {
            getWindows: () => []
        };
        const result = getActiveWindow(mockService as SecondaryWindowService);
        assert.strictEqual(result, window);
    });

    it('should return the main window as fallback when no window has focus', () => {
        const mockSecondaryWindow = {
            document: {
                hasFocus: () => false
            }
        } as unknown as Window;

        const mockService: Pick<SecondaryWindowService, 'getWindows'> = {
            getWindows: () => [mockSecondaryWindow]
        };

        const result = getActiveWindow(mockService as SecondaryWindowService);
        assert.strictEqual(result, window);
    });
});
