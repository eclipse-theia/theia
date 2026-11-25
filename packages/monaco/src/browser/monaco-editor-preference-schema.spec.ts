// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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
import { expect } from 'chai';
import type { PreferenceDataProperty } from '@theia/core/lib/common/preferences/preference-schema';
import { editorGeneratedPreferenceProperties } from '@theia/editor/lib/common/editor-generated-preference-schema';

/**
 * @monaco-uplift
 *
 * Checks that `editor-generated-preference-schema.ts` matches the editor options that Monaco registers.
 * If this suite fails after an uplift, regenerate the schema as described in the "Monaco Uplifts" section of the README.
 */
describe('editor preference schema', () => {

    /** Options that Monaco registers only on some platforms. The extractor always adds them. */
    const platformOptions = ['editor.find.globalFindClipboard', 'editor.selectionClipboard'];
    /** Options with platform-dependent defaults. The schema computes them at runtime. */
    const platformDefaults = ['editor.fontFamily', 'editor.fontSize'];
    /** Diff algorithms that need the `@vscode/diff` package, which Theia does not ship. */
    const unsupportedDiffAlgorithms = ['advanced-external', 'advanced-wasm'];

    let monacoProperties: Record<string, PreferenceDataProperty>;
    const theiaProperties = editorGeneratedPreferenceProperties as Record<string, PreferenceDataProperty>;
    let disableJSDOM: () => void;

    before(async function (): Promise<void> {
        this.timeout(30000);
        // Load Monaco only once this suite runs, see `monaco-outline-decorator.spec.ts`.
        disableJSDOM = enableJSDOM();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const global = globalThis as any;
        if (!global.DragEvent) {
            global.DragEvent = class DragEvent extends global.Event { };
        }
        await import('@theia/monaco-editor-core');
        const { Registry } = await import('@theia/monaco-editor-core/esm/vs/platform/registry/common/platform.js');
        const { Extensions } = await import('@theia/monaco-editor-core/esm/vs/platform/configuration/common/configurationRegistry.js');
        type ConfigurationRegistry = import('@theia/monaco-editor-core/esm/vs/platform/configuration/common/configurationRegistry.js').IConfigurationRegistry;
        monacoProperties = {};
        for (const configuration of Registry.as<ConfigurationRegistry>(Extensions.Configuration).getConfigurations()) {
            if (configuration.id === 'editor' && configuration.properties) {
                Object.assign(monacoProperties, configuration.properties);
            }
        }
    });

    after(() => disableJSDOM());

    function commonKeys(): string[] {
        return Object.keys(theiaProperties).filter(key => key in monacoProperties);
    }

    it('contains every editor option of Monaco', () => {
        const missing = Object.keys(monacoProperties).filter(key => !(key in theiaProperties));
        expect(missing, `Monaco options missing in the schema:\n${missing.join('\n')}\n`).to.be.empty;
    });

    it('contains no option that Monaco does not register', () => {
        const obsolete = Object.keys(theiaProperties).filter(key => !(key in monacoProperties) && !platformOptions.includes(key));
        expect(obsolete, `schema options that Monaco no longer registers:\n${obsolete.join('\n')}\n`).to.be.empty;
    });

    it('has the same types and enum values as Monaco', () => {
        const mismatches: string[] = [];
        for (const key of commonKeys()) {
            const monacoProperty = monacoProperties[key];
            const theiaProperty = theiaProperties[key];
            const monacoEnum = key === 'diffEditor.diffAlgorithm'
                ? monacoProperty.enum?.filter(value => !unsupportedDiffAlgorithms.includes(value as string))
                : monacoProperty.enum;
            if (JSON.stringify(theiaProperty.type) !== JSON.stringify(monacoProperty.type)) {
                mismatches.push(`${key}: type ${JSON.stringify(theiaProperty.type)} instead of ${JSON.stringify(monacoProperty.type)}`);
            }
            if (JSON.stringify(theiaProperty.enum) !== JSON.stringify(monacoEnum)) {
                mismatches.push(`${key}: enum ${JSON.stringify(theiaProperty.enum)} instead of ${JSON.stringify(monacoEnum)}`);
            }
        }
        expect(mismatches, `types or enum values that differ from Monaco:\n${mismatches.join('\n')}\n`).to.be.empty;
    });

    it('has the same defaults as Monaco', () => {
        const mismatches: string[] = [];
        for (const key of commonKeys().filter(name => !platformDefaults.includes(name))) {
            const theiaDefault = JSON.stringify(theiaProperties[key].default);
            const monacoDefault = JSON.stringify(monacoProperties[key].default);
            if (theiaDefault !== monacoDefault) {
                mismatches.push(`${key}: ${theiaDefault} instead of ${monacoDefault}`);
            }
        }
        expect(mismatches, `defaults that differ from Monaco:\n${mismatches.join('\n')}\n`).to.be.empty;
    });

    it('does not contain the tag of VS Code online experiments', () => {
        const tagged = Object.keys(theiaProperties).filter(key => theiaProperties[key].tags?.includes('onExP'));
        expect(tagged, `options tagged with onExP:\n${tagged.join('\n')}\n`).to.be.empty;
    });

    it('does not offer the diff algorithms that need @vscode/diff', () => {
        const values = theiaProperties['diffEditor.diffAlgorithm'].enum ?? [];
        expect(values).to.include('advanced');
        expect(values).to.not.include.members(unsupportedDiffAlgorithms);
    });
});
