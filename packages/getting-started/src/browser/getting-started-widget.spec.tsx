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

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as assert from 'assert';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';

/** The configuration lives on `window`, so it has to be set again for every fresh JSDOM instance. */
function ensureFrontendConfig(): void {
    try {
        FrontendApplicationConfigProvider.get();
    } catch {
        FrontendApplicationConfigProvider.set({});
    }
}

// Some of the modules loaded below read the configuration while they are being loaded.
ensureFrontendConfig();

import { Walkthrough } from '../common/walkthrough-types';
import { GettingStartedWidget } from './getting-started-widget';

describe('GettingStartedWidget', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
        ensureFrontendConfig();
    });
    after(() => disableJSDOM());

    function createWidget(selectedWalkthrough?: Walkthrough): GettingStartedWidget {
        const widget = new GettingStartedWidget();
        (widget as any).walkthroughService = { selectedWalkthrough };
        return widget;
    }

    function createWalkthrough(title: string): Walkthrough {
        return { id: 'test.plugin.wt', title, description: 'desc', steps: [], pluginId: 'test.plugin' };
    }

    describe('title', () => {
        it('should be the welcome label while no walkthrough is selected', () => {
            const widget = createWidget();

            (widget as any).updateTitle();

            assert.strictEqual(widget.title.label, GettingStartedWidget.LABEL);
            assert.strictEqual(widget.title.caption, GettingStartedWidget.LABEL);
        });

        it('should name the walkthrough that is shown', () => {
            const widget = createWidget(createWalkthrough('Get Started with Python'));

            (widget as any).updateTitle();

            assert.strictEqual(widget.title.label, 'Walkthrough: Get Started with Python');
            assert.strictEqual(widget.title.caption, 'Walkthrough: Get Started with Python');
        });

        it('should return to the welcome label once the walkthrough is closed', () => {
            const widget = createWidget(createWalkthrough('Some Walkthrough'));
            (widget as any).updateTitle();

            (widget as any).walkthroughService = { selectedWalkthrough: undefined };
            (widget as any).updateTitle();

            assert.strictEqual(widget.title.label, GettingStartedWidget.LABEL);
        });
    });
});
