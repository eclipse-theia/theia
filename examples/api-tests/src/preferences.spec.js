// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

// @ts-check

describe('Preferences', function () {
    this.timeout(5_000);
    const { assert } = chai;
    const { PreferenceProvider } = require('@theia/core/lib/browser/preferences/preference-provider');
    const { PreferenceService, PreferenceScope } = require('@theia/core/lib/browser/preferences/preference-service');
    const { FileService } = require('@theia/filesystem/lib/browser/file-service');
    const { PreferenceLanguageOverrideService } = require('@theia/core/lib/browser/preferences/preference-language-override-service');
    const { MonacoTextModelService } = require('@theia/monaco/lib/browser/monaco-text-model-service');
    const { PreferenceSchemaProvider } = require('@theia/core/lib/browser/preferences/preference-contribution')
    const { container } = window.theia;
    /** @type {import ('@theia/core/lib/browser/preferences/preference-service').PreferenceService} */
    const preferenceService = container.get(PreferenceService);
    /** @type {import ('@theia/core/lib/browser/preferences/preference-language-override-service').PreferenceLanguageOverrideService} */
    const overrideService = container.get(PreferenceLanguageOverrideService);
    const fileService = container.get(FileService);
    /** @type {import ('@theia/core/lib/common/uri').default} */
    const uri = preferenceService.getConfigUri(PreferenceScope.Workspace);
    /** @type {import('@theia/preferences/lib/browser/folders-preferences-provider').FoldersPreferencesProvider} */
    const folderPreferences = container.getNamed(PreferenceProvider, PreferenceScope.Folder);
    /** @type PreferenceSchemaProvider */
    const schemaProvider = container.get(PreferenceSchemaProvider);
    const modelService = container.get(MonacoTextModelService);

    const overrideIdentifier = 'bargle-noddle-zaus'; // Probably not in our preference files...
    const tabSize = 'editor.tabSize';
    const fontSize = 'editor.fontSize';
    const override = overrideService.markLanguageOverride(overrideIdentifier);
    const overriddenTabSize = overrideService.overridePreferenceName({ overrideIdentifier, preferenceName: tabSize });
    const overriddenFontSize = overrideService.overridePreferenceName({ overrideIdentifier, preferenceName: fontSize });
    /**
     * @returns {Promise<Record<string, any>>}
     */
    async function getPreferences() {
        try {
            const content = (await fileService.read(uri)).value;
            return JSON.parse(content);
        } catch (e) {
            return {};
        }
    }

    /**
     * @param {string} key
     * @param {unknown} value
     */
    async function setPreference(key, value) {
        return preferenceService.set(key, value, PreferenceScope.Workspace);
    }

    async function deleteAllValues() {
        return setValueTo(undefined);
    }

    /**
     * @param {any} value - A JSON value to write to the workspace preference file.
     */
    async function setValueTo(value) {
        const reference = await modelService.createModelReference(uri);
        if (reference.object.dirty) {
            await reference.object.revert();
        }
        /** @type {import ('@theia/preferences/lib/browser/folder-preference-provider').FolderPreferenceProvider} */
        const provider = Array.from(folderPreferences['providers'].values()).find(candidate => candidate.getConfigUri().isEqual(uri));
        assert.isDefined(provider);
        await provider['doSetPreference']('', [], value);
        reference.dispose();
    }

    let fileExistsBeforehand = false;
    let contentBeforehand = '';

    before(async function () {
        assert.isDefined(uri, 'The workspace config URI should be defined!');
        fileExistsBeforehand = await fileService.exists(uri);
        contentBeforehand = await fileService.read(uri).then(({ value }) => value).catch(() => '');
        schemaProvider.registerOverrideIdentifier(overrideIdentifier);
        await deleteAllValues();
    });

    after(async function () {
        if (!fileExistsBeforehand) {
            await fileService.delete(uri, { fromUserGesture: false }).catch(() => { });
        } else {
            let content = '';
            try { content = JSON.parse(contentBeforehand); } catch { }
            // Use the preference service because its promise is guaranteed to resolve after the file change is complete.
            await setValueTo(content);
        }
    });

    beforeEach(async function () {
        const prefs = await getPreferences();
        for (const key of [tabSize, fontSize, override, overriddenTabSize, overriddenFontSize]) {
            shouldBeUndefined(prefs[key], key);
        }
    });

    afterEach(async function () {
        await deleteAllValues();
    });

    /**
     * @param {unknown} value
     * @param {string} key
     */
    function shouldBeUndefined(value, key) {
        assert.isUndefined(value, `There should be no ${key} object or value in the preferences.`);
    }

    /**
     * @returns {Promise<{newTabSize: number, newFontSize: number, startingTabSize: number, startingFontSize: number}>}
     */
    async function setUpOverride() {
        const startingTabSize = preferenceService.get(tabSize);
        const startingFontSize = preferenceService.get(fontSize);
        assert.equal(preferenceService.get(overriddenTabSize), startingTabSize, 'The overridden value should equal the default.');
        assert.equal(preferenceService.get(overriddenFontSize), startingFontSize, 'The overridden value should equal the default.');
        const newTabSize = startingTabSize + 2;
        const newFontSize = startingFontSize + 2;
        await Promise.all([
            setPreference(overriddenTabSize, newTabSize),
            setPreference(overriddenFontSize, newFontSize),
        ]);
        assert.equal(preferenceService.get(overriddenTabSize), newTabSize, 'After setting, the new value should be active for the override.');
        assert.equal(preferenceService.get(overriddenFontSize), newFontSize, 'After setting, the new value should be active for the override.');
        return { newTabSize, newFontSize, startingTabSize, startingFontSize };
    }

    it('Sets language overrides as objects', async function () {
        const { newTabSize, newFontSize } = await setUpOverride();
        const prefs = await getPreferences();
        assert.isObject(prefs[override], 'The override should be a key in the preference object.');
        assert.equal(prefs[override][tabSize], newTabSize, 'editor.tabSize should be a key in the override object and have the correct value.');
        assert.equal(prefs[override][fontSize], newFontSize, 'editor.fontSize should be a key in the override object and should have the correct value.');
        shouldBeUndefined(prefs[overriddenTabSize], overriddenTabSize);
        shouldBeUndefined(prefs[overriddenFontSize], overriddenFontSize);
    });

    it('Allows deletion of individual keys in the override object.', async function () {
        const { startingTabSize } = await setUpOverride();
        await setPreference(overriddenTabSize, undefined);
        assert.equal(preferenceService.get(overriddenTabSize), startingTabSize);
        const prefs = await getPreferences();
        shouldBeUndefined(prefs[override][tabSize], tabSize);
        shouldBeUndefined(prefs[overriddenFontSize], overriddenFontSize);
        shouldBeUndefined(prefs[overriddenTabSize], overriddenTabSize);
    });

    it('Allows deletion of the whole override object', async function () {
        const { startingFontSize, startingTabSize } = await setUpOverride();
        await setPreference(override, undefined);
        assert.equal(preferenceService.get(overriddenTabSize), startingTabSize, 'The overridden value should revert to the default.');
        assert.equal(preferenceService.get(overriddenFontSize), startingFontSize, 'The overridden value should revert to the default.');
        const prefs = await getPreferences();
        shouldBeUndefined(prefs[override], override);
    });

    it('Handles many synchronous settings of preferences gracefully', async function () {
        let settings = 0;
        const promises = [];
        const searchPref = 'search.searchOnTypeDebouncePeriod'
        const channelPref = 'output.maxChannelHistory'
        const hoverPref = 'workbench.hover.delay';
        let searchDebounce;
        let channelHistory;
        let hoverDelay;
        /** @type import ('@theia/core/src/browser/preferences/preference-service').PreferenceChanges | undefined */
        let event;
        const toDispose = preferenceService.onPreferencesChanged(e => event = e);
        while (settings++ < 50) {
            searchDebounce = 100 + Math.floor(Math.random() * 500);
            channelHistory = 200 + Math.floor(Math.random() * 800);
            hoverDelay = 250 + Math.floor(Math.random() * 2_500);
            promises.push(
                preferenceService.set(searchPref, searchDebounce),
                preferenceService.set(channelPref, channelHistory),
                preferenceService.set(hoverPref, hoverDelay)
            );
        }
        const results = await Promise.allSettled(promises);
        const expectedValues = { [searchPref]: searchDebounce, [channelPref]: channelHistory, [hoverPref]: hoverDelay };
        const actualValues = { [searchPref]: preferenceService.get(searchPref), [channelPref]: preferenceService.get(channelPref), [hoverPref]: preferenceService.get(hoverPref), }
        const eventValues = event && Object.keys(event).reduce((accu, key) => { accu[key] = event[key].newValue; return accu; }, {});
        toDispose.dispose();
        assert(results.every(setting => setting.status === 'fulfilled'), 'All promises should have resolved rather than rejected.');
        assert.deepEqual(actualValues, eventValues, 'The event should reflect the current state of the service.');
        assert.deepEqual(expectedValues, actualValues, 'The service state should reflect the most recent setting');
    });
});
