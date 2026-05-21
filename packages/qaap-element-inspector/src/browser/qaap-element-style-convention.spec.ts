// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import type { PickedElement } from './element-inspector-types';
import { detectTailwindClasses, detectCssModuleClasses, resolveStyleEditTargets } from './qaap-element-style-convention';

function minimalPicked(overrides: Partial<PickedElement> = {}): PickedElement {
    return {
        pickedId: 'p1',
        tagName: 'div',
        classes: [],
        attributes: [],
        textPreview: '',
        outerHTML: '<div></div>',
        domPath: 'div',
        position: { top: 0, left: 0, width: 10, height: 10 },
        computedStyles: {},
        ancestors: [],
        pageUrl: 'http://localhost:5173/',
        ...overrides,
    };
}

describe('qaap-element-style-convention', () => {
    it('detects Tailwind utilities on class list', () => {
        const picked = minimalPicked({ classes: ['flex', 'text-slate-600', 'p-4', 'not-a-utility-xyz'] });
        const tw = detectTailwindClasses(picked);
        expect(tw).to.include('flex');
        expect(tw).to.include('text-slate-600');
        expect(tw).to.include('p-4');
    });

    it('detects CSS module class names', () => {
        const picked = minimalPicked({
            classes: ['Button_button__a1b2c'],
            attributes: [{ name: 'className', value: 'styles.primary' }],
        });
        const mods = detectCssModuleClasses(picked);
        expect(mods.length).to.be.greaterThan(0);
    });

    it('resolves at least one style target', () => {
        const picked = minimalPicked({ classes: ['bg-white', 'rounded-lg'] });
        const targets = resolveStyleEditTargets(picked);
        expect(targets.length).to.be.greaterThan(0);
        expect(targets.some(t => t.kind === 'tailwind')).to.be.true;
    });
});
