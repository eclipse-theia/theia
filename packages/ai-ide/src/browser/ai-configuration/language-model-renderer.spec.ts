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
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import { flushSync } from '@theia/core/shared/react-dom';
import { createRoot } from '@theia/core/shared/react-dom/client';
import { ReasoningSupport } from '@theia/ai-core/lib/common';
import { AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';
import { ReasoningRow } from './language-model-renderer';

disableJSDOM();

describe('ReasoningRow', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    const support: ReasoningSupport = { supportedLevels: ['off', 'low', 'high'], defaultLevel: 'low' };

    function render(props: Partial<React.ComponentProps<typeof ReasoningRow>>): { container: HTMLElement; dispose: () => void } {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => root.render(React.createElement(ReasoningRow, {
            support,
            inheritedLevel: 'low',
            onSelect: () => { },
            onReset: () => { },
            settingsRowService: { openResetMenu: () => { } } as unknown as AiSettingsRowService,
            ...props
        })));
        return { container, dispose: () => { flushSync(() => root.unmount()); container.remove(); } };
    }

    it('marks the select with the effective level, which is what draws the shared lightbulb glyph', () => {
        const stored = render({ savedLevel: 'high' });
        try {
            const select = stored.container.querySelector('.theia-ReasoningLevelSelector');
            expect(select?.classList.contains('reasoning-level-high')).to.equal(true);
        } finally {
            stored.dispose();
        }

        // Nothing stored: the row shows the inherited level, so the glyph matches what the model will do.
        const inherited = render({ savedLevel: undefined, inheritedLevel: 'off' });
        try {
            const select = inherited.container.querySelector('.theia-ReasoningLevelSelector');
            expect(select?.classList.contains('reasoning-level-off')).to.equal(true);
        } finally {
            inherited.dispose();
        }
    });

    for (const [level, label] of [['none', 'None'], ['xhigh', 'Extra High'], ['max', 'Maximum']] as const) {
        it(`labels the native ${level} effort and marks its glyph`, () => {
            const rendered = render({ support: { supportedLevels: [level] }, inheritedLevel: level });
            try {
                expect(rendered.container.textContent).to.include(label);
                expect(rendered.container.querySelector('.theia-ReasoningLevelSelector')?.classList.contains(`reasoning-level-${level}`)).to.equal(true);
            } finally {
                rendered.dispose();
            }
        });
    }

    for (const origin of ['saved', 'inherited'] as const) {
        it(`clamps an unsupported ${origin} level without changing the preference`, () => {
            let writes = 0;
            const props: Partial<React.ComponentProps<typeof ReasoningRow>> = {
                support: { supportedLevels: ['off', 'low', 'medium', 'high', 'xhigh', 'auto'], defaultLevel: 'auto' },
                ...(origin === 'saved' ? { savedLevel: 'max' } : { inheritedLevel: 'max' }),
                onSelect: () => { writes++; }
            };
            const rendered = render(props);
            try {
                const select = rendered.container.querySelector('.theia-ReasoningLevelSelector');
                expect(select?.querySelector('.theia-select-component-label')?.textContent).to.equal('Extra High');
                expect(select?.classList.contains('reasoning-level-xhigh')).to.equal(true);
                expect(select?.classList.contains('reasoning-level-max')).to.equal(false);
                expect(Boolean(rendered.container.querySelector('.ai-settings-row.modified'))).to.equal(origin === 'saved');
                expect(props.savedLevel ?? props.inheritedLevel).to.equal('max');
                expect(writes).to.equal(0);
                if (origin === 'inherited') {
                    expect(rendered.container.textContent).to.include('so "Extra High" applies').and.not.include('Maximum');
                }
            } finally {
                rendered.dispose();
            }
        });
    }

    it('offers a reset only once a level is stored for the agent', () => {
        const stored = render({ savedLevel: 'high' });
        try {
            expect(Boolean(stored.container.querySelector('.ai-settings-row-gear'))).to.equal(true);
            expect(Boolean(stored.container.querySelector('.ai-settings-row.modified'))).to.equal(true);
        } finally {
            stored.dispose();
        }

        const inherited = render({ savedLevel: undefined });
        try {
            expect(Boolean(inherited.container.querySelector('.ai-settings-row-gear'))).to.equal(false);
            expect(Boolean(inherited.container.querySelector('.ai-settings-row.modified'))).to.equal(false);
        } finally {
            inherited.dispose();
        }
    });

    it('names the inherited level while nothing is stored, so the effective value is not a guess', () => {
        const inherited = render({ savedLevel: undefined, inheritedLevel: 'high' });
        try {
            expect(inherited.container.textContent).to.include('High');
        } finally {
            inherited.dispose();
        }
    });
});
