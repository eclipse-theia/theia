// *****************************************************************************
// Copyright (C) 2026 CodeSignal and others.
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

describe('AI preferences', function () {
    const { assert } = chai;
    const { PreferenceSchemaService } = require('@theia/core/lib/common/preferences');
    const { container } = window.theia;
    /** @type {import('@theia/core/lib/common/preferences').PreferenceSchemaService} */
    const schemaService = container.get(PreferenceSchemaService);

    /**
     * AI preferences that the settings of an untrusted workspace may set. Every other `ai-features.*` preference
     * must be `restricted`, which a schema gets for all its properties with `defaultRestricted: true`.
     * @type {string[]}
     */
    const SAFE_IN_UNTRUSTED_WORKSPACES = [];

    /** @returns {[string, import('@theia/core/lib/common/preferences').PreferenceDataProperty][]} */
    function aiPreferences() {
        return Array.from(schemaService.getSchemaProperties().entries()).filter(([name]) => name.startsWith('ai-features.'));
    }

    before(() => schemaService.ready);

    it('finds the AI preferences of the application', () => {
        assert.isAbove(aiPreferences().length, 50);
        assert.isDefined(schemaService.getSchemaProperty('ai-features.AiEnable.enableAI'));
    });

    it('are restricted, unless listed as safe for an untrusted workspace to set', () => {
        const unrestricted = aiPreferences()
            .filter(([name, property]) => !property.restricted && !SAFE_IN_UNTRUSTED_WORKSPACES.includes(name))
            .map(([name]) => name);

        assert.deepEqual(unrestricted, []);
    });
});
