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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { Container, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { Theme, ThemeChangeEvent } from '@theia/core/lib/common/theme';
import { TerminalThemeService } from './terminal-theme-service.js';

disableJSDOM();

class TestColorRegistry extends ColorRegistry {
    readonly colors = new Map<string, string>();

    override getCurrentColor(id: string): string | undefined {
        return this.colors.get(id);
    }

    set(id: string, value: string): void {
        this.colors.set(id, value);
        this.fireDidChange();
    }

    touch(): void {
        this.fireDidChange();
    }
}

@injectable()
class SubclassWithPostConstruct extends TerminalThemeService {
    @postConstruct()
    protected setup(): void { }
}

const DARK: Theme = { id: 'dark', type: 'dark', label: 'Dark' };

describe('TerminalThemeService', () => {

    let colors: TestColorRegistry;
    let themeChange: Emitter<ThemeChangeEvent>;
    let service: TerminalThemeService;
    let changes: ThemeChangeEvent[];

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    function create(serviceClass: typeof TerminalThemeService): TerminalThemeService {
        colors = new TestColorRegistry();
        themeChange = new Emitter<ThemeChangeEvent>();
        const themeService = { onDidColorThemeChange: themeChange.event, getCurrentTheme: () => DARK } as unknown as ThemeService;
        const container = new Container();
        container.bind(ColorRegistry).toConstantValue(colors);
        container.bind(ThemeService).toConstantValue(themeService);
        container.bind(TerminalThemeService).to(serviceClass).inSingletonScope();
        const created = container.get(TerminalThemeService);
        changes = [];
        created.onDidChange(event => changes.push(event));
        return created;
    }

    beforeEach(() => service = create(TerminalThemeService));

    it('should report a terminal color that changes in the color registry', () => {
        colors.set('terminal.selectionForeground', '#ff0000');

        expect(changes).to.have.lengthOf(1);
        expect(service.theme.selectionForeground).to.equal('#ff0000');
    });

    it('should not report color registry changes that leave the terminal colors as they are', () => {
        colors.set('editor.background', '#000000');
        colors.touch();

        expect(changes).to.be.empty;
    });

    it('should report color theme changes', () => {
        const event = { newTheme: DARK };
        themeChange.fire(event);

        expect(changes).to.deep.equal([event]);
    });

    it('should report each change once to each of several listeners', () => {
        const second: ThemeChangeEvent[] = [];
        service.onDidChange(event => second.push(event));

        colors.set('terminal.selectionForeground', '#ff0000');
        themeChange.fire({ newTheme: DARK });

        expect([changes.length, second.length]).to.deep.equal([2, 2]);
    });

    it('should report changes for a subclass with its own post-construct method', () => {
        service = create(SubclassWithPostConstruct);

        themeChange.fire({ newTheme: DARK });
        colors.set('terminal.selectionForeground', '#ff0000');

        expect(changes).to.have.lengthOf(2);
    });

    it('should not report a color registry change that a color theme change already applied', () => {
        colors.colors.set('terminal.background', '#111111');
        themeChange.fire({ newTheme: DARK });
        colors.touch();

        expect(changes).to.have.lengthOf(1);
    });
});
