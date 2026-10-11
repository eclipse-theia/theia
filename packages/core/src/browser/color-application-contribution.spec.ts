// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { enableJSDOM } from './test/jsdom';
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import './shell/application-shell'; // load first to avoid a circular import failure via `SecondaryWindowHandler`
import { ColorApplicationContribution } from './color-application-contribution';
import { ColorRegistry } from './color-registry';
import { ThemeService } from './theming';
disableJSDOM();

class TestColorRegistry extends ColorRegistry {

    readonly values = new Map<string, string>();

    override *getColors(): IterableIterator<string> {
        yield* this.values.keys();
    }

    override getCurrentColor(id: string): string | undefined {
        return this.values.get(id);
    }
}

class TestColorApplicationContribution extends ColorApplicationContribution {

    protected override readonly themeService = { getCurrentTheme: () => ({ type: 'dark' }) } as unknown as ThemeService;

    constructor(protected override readonly colors: ColorRegistry) {
        super();
    }

    updateWindowForTest(win: Window): void {
        this.updateWindow(win);
    }
}

describe('ColorApplicationContribution', () => {

    let colors: TestColorRegistry;
    let contribution: TestColorApplicationContribution;

    beforeEach(() => {
        disableJSDOM = enableJSDOM();
        colors = new TestColorRegistry();
        colors.values.set('editor.background', '#1e1e1e');
        colors.values.set('scmGraph.historyItemHoverAdditionsForeground', '#487e02');
        colors.values.set('unresolved.color', '');
        contribution = new TestColorApplicationContribution(colors);
    });

    afterEach(() => {
        disableJSDOM();
    });

    it('sets a --theia- and a --vscode- prefixed variable for every resolved color', () => {
        contribution.updateWindowForTest(window);
        const style = document.documentElement.style;
        expect(style.getPropertyValue('--theia-editor-background')).to.equal('#1e1e1e');
        expect(style.getPropertyValue('--vscode-editor-background')).to.equal('#1e1e1e');
        expect(style.getPropertyValue('--theia-scmGraph-historyItemHoverAdditionsForeground')).to.equal('#487e02');
        expect(style.getPropertyValue('--vscode-scmGraph-historyItemHoverAdditionsForeground')).to.equal('#487e02');
        expect(style.length).to.equal(4);
    });

    it('does not set variables for colors without a value', () => {
        contribution.updateWindowForTest(window);
        const style = document.documentElement.style;
        expect(style.getPropertyValue('--theia-unresolved-color')).to.equal('');
        expect(style.getPropertyValue('--vscode-unresolved-color')).to.equal('');
    });

    it('overwrites the variables in place on a subsequent update', () => {
        contribution.updateWindowForTest(window);
        colors.values.set('editor.background', '#ffffff');
        contribution.updateWindowForTest(window);
        const style = document.documentElement.style;
        expect(style.getPropertyValue('--theia-editor-background')).to.equal('#ffffff');
        expect(style.getPropertyValue('--vscode-editor-background')).to.equal('#ffffff');
        expect(style.length).to.equal(4);
    });

    it('removes both variables of a color that the current theme does not provide anymore', () => {
        contribution.updateWindowForTest(window);
        colors.values.delete('scmGraph.historyItemHoverAdditionsForeground');
        contribution.updateWindowForTest(window);
        const style = document.documentElement.style;
        expect(style.getPropertyValue('--theia-scmGraph-historyItemHoverAdditionsForeground')).to.equal('');
        expect(style.getPropertyValue('--vscode-scmGraph-historyItemHoverAdditionsForeground')).to.equal('');
        expect(style.getPropertyValue('--theia-editor-background')).to.equal('#1e1e1e');
        expect(style.length).to.equal(2);
    });
});
