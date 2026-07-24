// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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

import { expect } from 'chai';
import { updateActivationEvents } from '../plugin-activation-events';
import type { PluginManifest } from '../manifest-types';

function manifest(partial: Pick<PluginManifest, 'contributes' | 'activationEvents'>): Pick<PluginManifest, 'contributes' | 'activationEvents'> {
    return {
        activationEvents: partial.activationEvents ? [...partial.activationEvents] : undefined,
        contributes: partial.contributes
    };
}

describe('plugin-activation-events', () => {

    it('no-ops when contributes is missing or invalid', () => {
        const empty = manifest({});
        updateActivationEvents(empty);
        expect(empty.activationEvents).to.equal(undefined);

        const invalid = manifest({ contributes: 'bad' as unknown as PluginManifest['contributes'] });
        updateActivationEvents(invalid);
        expect(invalid.activationEvents).to.equal(undefined);
    });

    it('derives activation events from contributed commands and languages', () => {
        const pkg = manifest({
            activationEvents: ['onStartupFinished'],
            contributes: {
                commands: [{ command: 'sample.run', title: 'Run' }],
                languages: [{ id: 'typescript', extensions: ['.ts'] }]
            }
        });

        updateActivationEvents(pkg);

        expect(pkg.activationEvents).to.include.members([
            'onStartupFinished',
            'onCommand:sample.run',
            'onLanguage:typescript'
        ]);
    });

    it('derives activation events from views, custom editors, auth, and notebooks', () => {
        const pkg = manifest({
            contributes: {
                views: {
                    explorer: [{ id: 'sample.view', name: 'Sample' }]
                },
                customEditors: [{ viewType: 'sample.editor', displayName: 'Editor', selector: [] }],
                authentication: [{ id: 'github', label: 'GitHub' }],
                notebooks: [{ type: 'sample-notebook', displayName: 'Notebook' }]
            }
        });

        updateActivationEvents(pkg);

        expect(pkg.activationEvents).to.include.members([
            'onView:sample.view',
            'onCustomEditor:sample.editor',
            'onAuthenticationRequest:github',
            'onNotebookSerializer:sample-notebook'
        ]);
    });

    it('supports a single command object instead of an array', () => {
        const pkg = manifest({
            contributes: {
                commands: { command: 'solo.run', title: 'Solo' } as unknown as { command: string; title: string }
            }
        });

        updateActivationEvents(pkg);

        expect(pkg.activationEvents).to.include('onCommand:solo.run');
    });

    it('ignores malformed views contributions that are not plain objects', () => {
        const pkg = manifest({
            contributes: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                views: 'not-an-object' as any
            }
        });

        updateActivationEvents(pkg);

        expect(pkg.activationEvents ?? []).to.be.empty;
    });
});
