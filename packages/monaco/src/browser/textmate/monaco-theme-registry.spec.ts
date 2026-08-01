// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { MonacoThemeRegistry } from './monaco-theme-registry';

disableJSDOM();

describe('MonacoThemeRegistry', () => {

    /**
     * All workbench colors are read from Monaco's current color theme, so defaulting a light
     * theme to a dark editor theme renders the whole window inverted.
     */
    it('should default to the editor theme matching the theme type', () => {
        expect(MonacoThemeRegistry.getDefaultTheme('light')).to.equal(MonacoThemeRegistry.LIGHT_DEFAULT_THEME);
        expect(MonacoThemeRegistry.getDefaultTheme('dark')).to.equal(MonacoThemeRegistry.DARK_DEFAULT_THEME);
        expect(MonacoThemeRegistry.getDefaultTheme('hc')).to.equal(MonacoThemeRegistry.HC_DEFAULT_THEME);
        expect(MonacoThemeRegistry.getDefaultTheme('hcLight')).to.equal(MonacoThemeRegistry.HC_LIGHT_THEME);
    });
});
