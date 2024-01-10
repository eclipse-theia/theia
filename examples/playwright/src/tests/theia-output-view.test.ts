// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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

import { expect, test } from '@playwright/test';
import { TheiaOutputViewChannel } from '../theia-output-channel';
import { TheiaApp } from '../theia-app';
import { TheiaAppLoader } from '../theia-app-loader';
import { TheiaOutputView } from '../theia-output-view';

let app: TheiaApp; let outputView: TheiaOutputView; let testChannel: TheiaOutputViewChannel;
test.describe('Theia Output View', () => {

    test.beforeAll(async ({ playwright, browser }) => {
        app = await TheiaAppLoader.load({ playwright, browser });
    });

    test.afterAll(async () => {
        await app.page.close();
    });

    test('should open the output view and check if is visible and active', async () => {
        outputView = await app.openView(TheiaOutputView);
        expect(await outputView.isTabVisible()).toBe(true);
        expect(await outputView.isDisplayed()).toBe(true);
        expect(await outputView.isActive()).toBe(true);
    });
    test('should be opened at the bottom and have the title "Output"', async () => {
        expect(await outputView.isInSidePanel()).toBe(false);
        expect(await outputView.side()).toBe('bottom');
        expect(await outputView.title()).toBe('Output');
    });
    test('should be closable', async () => {
        expect(await outputView.isClosable()).toBe(true);
        await outputView.close();
        expect(await outputView.isTabVisible()).toBe(false);
        expect(await outputView.isDisplayed()).toBe(false);
        expect(await outputView.isActive()).toBe(false);
    });
    test('should select a test output channel', async () => {
        outputView = await app.openView(TheiaOutputView);
        expect(await outputView.isTabVisible()).toBe(true);
        expect(await outputView.isDisplayed()).toBe(true);
        expect(await outputView.isActive()).toBe(true);

        const testChannelName = 'API Sample: my test channel';
        expect(await outputView.selectOutputChannel(testChannelName)).toBe(true);
    });
    test('should check if the output view of the test output channel', async () => {
        const testChannelName = 'API Sample: my test channel';
        expect(await outputView.isOutputChannelSelected(testChannelName));
        const channel = await outputView.getOutputChannel(testChannelName);
        expect(channel).toBeDefined;
        testChannel = channel!;
        expect(await testChannel!.isDisplayed()).toBe(true);
    });
    test('should check if the output view test channel shows the test output', async () => {
        expect(await testChannel.numberOfLines()).toBe(5);
        expect(await testChannel.textContentOfLineByLineNumber(1)).toMatch('hello info1');
        expect(await testChannel.maxSeverityOfLineByLineNumber(1)).toMatch('info');
        expect(await testChannel.textContentOfLineByLineNumber(2)).toMatch('hello info2');
        expect(await testChannel.maxSeverityOfLineByLineNumber(2)).toMatch('info');
        expect(await testChannel.textContentOfLineByLineNumber(3)).toMatch('hello error');
        expect(await testChannel.maxSeverityOfLineByLineNumber(3)).toMatch('error');
        expect(await testChannel.textContentOfLineByLineNumber(4)).toMatch('hello warning');
        expect(await testChannel.maxSeverityOfLineByLineNumber(4)).toMatch('warning');
        expect(await testChannel.textContentOfLineByLineNumber(5)).toMatch(
            'inlineInfo1 inlineWarning inlineError inlineInfo2'
        );
        expect(await testChannel.maxSeverityOfLineByLineNumber(5)).toMatch('error');
    });

});
