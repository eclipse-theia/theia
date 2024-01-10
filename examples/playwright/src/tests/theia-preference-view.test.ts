// *****************************************************************************
// Copyright (C) 2021 logi.cals GmbH, EclipseSource and others.
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
import { TheiaApp } from '../theia-app';
import { TheiaAppLoader } from '../theia-app-loader';
import { DefaultPreferences, PreferenceIds, TheiaPreferenceView } from '../theia-preference-view';

test.describe('Preference View', () => {

    let app: TheiaApp;

    test.beforeAll(async ({ playwright, browser }) => {
        app = await TheiaAppLoader.load({ playwright, browser });
    });

    test.afterAll(async () => {
        await app.page.close();
    });

    test('should be visible and active after being opened', async () => {
        const preferenceView = await app.openPreferences(TheiaPreferenceView);
        expect(await preferenceView.isTabVisible()).toBe(true);
        expect(await preferenceView.isDisplayed()).toBe(true);
        expect(await preferenceView.isActive()).toBe(true);
    });

    test('should be able to read, set, and reset String preferences', async () => {
        const preferences = await app.openPreferences(TheiaPreferenceView);
        const preferenceId = PreferenceIds.DiffEditor.MaxComputationTime;

        await preferences.resetPreferenceById(preferenceId);
        expect(await preferences.getStringPreferenceById(preferenceId)).toBe(DefaultPreferences.DiffEditor.MaxComputationTime);

        await preferences.setStringPreferenceById(preferenceId, '8000');
        await preferences.waitForModified(preferenceId);
        expect(await preferences.getStringPreferenceById(preferenceId)).toBe('8000');

        await preferences.resetPreferenceById(preferenceId);
        expect(await preferences.getStringPreferenceById(preferenceId)).toBe(DefaultPreferences.DiffEditor.MaxComputationTime);
    });

    test('should be able to read, set, and reset Boolean preferences', async () => {
        const preferences = await app.openPreferences(TheiaPreferenceView);
        const preferenceId = PreferenceIds.Explorer.AutoReveal;

        await preferences.resetPreferenceById(preferenceId);
        expect(await preferences.getBooleanPreferenceById(preferenceId)).toBe(DefaultPreferences.Explorer.AutoReveal.Enabled);

        await preferences.setBooleanPreferenceById(preferenceId, false);
        await preferences.waitForModified(preferenceId);
        expect(await preferences.getBooleanPreferenceById(preferenceId)).toBe(false);

        await preferences.resetPreferenceById(preferenceId);
        expect(await preferences.getBooleanPreferenceById(preferenceId)).toBe(DefaultPreferences.Explorer.AutoReveal.Enabled);
    });

    test('should be able to read, set, and reset Options preferences', async () => {
        const preferences = await app.openPreferences(TheiaPreferenceView);
        const preferenceId = PreferenceIds.Editor.RenderWhitespace;

        await preferences.resetPreferenceById(preferenceId);
        expect(await preferences.getOptionsPreferenceById(preferenceId)).toBe(DefaultPreferences.Editor.RenderWhitespace.Selection);

        await preferences.setOptionsPreferenceById(preferenceId, DefaultPreferences.Editor.RenderWhitespace.Boundary);
        await preferences.waitForModified(preferenceId);
        expect(await preferences.getOptionsPreferenceById(preferenceId)).toBe(DefaultPreferences.Editor.RenderWhitespace.Boundary);

        await preferences.resetPreferenceById(preferenceId);
        expect(await preferences.getOptionsPreferenceById(preferenceId)).toBe(DefaultPreferences.Editor.RenderWhitespace.Selection);
    });

    test('should throw an error if we try to read, set, or reset a non-existing preference', async () => {
        const preferences = await app.openPreferences(TheiaPreferenceView);

        preferences.customTimeout = 500;
        try {
            await expect(preferences.getBooleanPreferenceById('not.a.real.preference')).rejects.toThrowError();
            await expect(preferences.setBooleanPreferenceById('not.a.real.preference', true)).rejects.toThrowError();
            await expect(preferences.resetPreferenceById('not.a.real.preference')).rejects.toThrowError();

            await expect(preferences.getStringPreferenceById('not.a.real.preference')).rejects.toThrowError();
            await expect(preferences.setStringPreferenceById('not.a.real.preference', 'a')).rejects.toThrowError();
            await expect(preferences.resetPreferenceById('not.a.real.preference')).rejects.toThrowError();

            await expect(preferences.getOptionsPreferenceById('not.a.real.preference')).rejects.toThrowError();
            await expect(preferences.setOptionsPreferenceById('not.a.real.preference', 'a')).rejects.toThrowError();
            await expect(preferences.resetPreferenceById('not.a.real.preference')).rejects.toThrowError();
        } finally {
            preferences.customTimeout = undefined;
        }
    });

    test('should throw an error if we try to read, or set a preference with the wrong type', async () => {
        const preferences = await app.openPreferences(TheiaPreferenceView);
        const stringPreference = PreferenceIds.DiffEditor.MaxComputationTime;
        const booleanPreference = PreferenceIds.Explorer.AutoReveal;

        preferences.customTimeout = 500;
        try {
            await expect(preferences.getBooleanPreferenceById(stringPreference)).rejects.toThrowError();
            await expect(preferences.setBooleanPreferenceById(stringPreference, true)).rejects.toThrowError();
            await expect(preferences.setStringPreferenceById(booleanPreference, 'true')).rejects.toThrowError();
            await expect(preferences.setOptionsPreferenceById(booleanPreference, 'true')).rejects.toThrowError();
        } finally {
            preferences.customTimeout = undefined;
        }
    });
});
