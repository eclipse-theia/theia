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

import { enableJSDOM } from '../test/jsdom';
let disableJSDOM = enableJSDOM();
import { expect } from 'chai';

import { Widget } from '@lumino/widgets';
import { PreferenceService } from '../../common';
// load the shell first, loading it through the secondary window handler hits a circular import
import { ApplicationShell } from '../shell/application-shell';
import { ExtractableWidget } from '../widgets';
import { DefaultSecondaryWindowService } from './default-secondary-window-service';

disableJSDOM();

describe('DefaultSecondaryWindowService', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    it('should return undefined when the browser blocks the window', () => {
        const service = new DefaultSecondaryWindowService();
        (service as unknown as { preferenceService: Partial<PreferenceService> }).preferenceService = { get: () => undefined };
        const open = window.open;
        window.open = () => null; // eslint-disable-line no-null/no-null
        try {
            const widget = new Widget() as unknown as ExtractableWidget;
            const options = { position: { x: 0, y: 0 }, size: { width: 100, height: 100 } };
            const shell = Object.create(ApplicationShell.prototype) as ApplicationShell;
            expect(service.createSecondaryWindow(widget, shell, options)).to.be.undefined;
        } finally {
            window.open = open;
        }
    });
});
