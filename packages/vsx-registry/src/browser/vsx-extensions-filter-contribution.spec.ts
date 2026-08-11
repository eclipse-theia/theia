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

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core';
import { CommandRegistry, MenuModelRegistry } from '@theia/core/lib/common';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { ExtensionsSourceContribution } from './extensions-source-contribution';
import { VSXExtensionsSearchModel } from './vsx-extensions-search-model';
import { VSXExtensionsFilterContribution } from './vsx-extensions-filter-contribution';

class StubContribution implements ExtensionsSourceContribution {
    readonly onDidChange = new Emitter<void>().event;
    constructor(readonly type: string, readonly displayName: string, readonly searchToken: string, readonly priority = 0) { }
}

function defaultContributions(): StubContribution[] {
    return [
        new StubContribution('extension', 'Extensions', '@extensions'),
        new StubContribution('mcp-server', 'MCP Servers', '@mcp', 100),
        new StubContribution('skill', 'Skills', '@skills', 200)
    ];
}

function buildContribution(types: StubContribution[] = defaultContributions()): { contribution: VSXExtensionsFilterContribution; searchModel: VSXExtensionsSearchModel } {
    const container = new Container();
    const provider: ContributionProvider<ExtensionsSourceContribution> = { getContributions: () => types };
    container.bind(ContributionProvider).toConstantValue(provider).whenTargetNamed(ExtensionsSourceContribution);
    container.bind(VSXExtensionsSearchModel).toSelf().inSingletonScope();
    container.bind(VSXExtensionsFilterContribution).toSelf().inSingletonScope();
    return {
        contribution: container.get(VSXExtensionsFilterContribution),
        searchModel: container.get(VSXExtensionsSearchModel)
    };
}

class FakeCommandRegistry {
    readonly commands = new Map<string, { execute: () => void; isToggled?: () => boolean }>();
    registerCommand(command: { id: string }, handler: { execute: () => void; isToggled?: () => boolean }): void {
        this.commands.set(command.id, handler);
    }
}

class FakeMenuRegistry {
    readonly menus = new Map<string, { commandId: string; label?: string; order?: string }[]>();
    registerMenuAction(menuPath: string[], action: { commandId: string; label?: string; order?: string }): void {
        const key = menuPath.join('/');
        const list = this.menus.get(key) ?? [];
        list.push(action);
        this.menus.set(key, list);
    }
}

describe('VSXExtensionsFilterContribution type filter toggles', () => {

    it('starts with nothing ticked (no token in query) so the funnel shows "no filter"', () => {
        const { contribution, searchModel } = buildContribution();
        const commands = new FakeCommandRegistry();
        contribution.registerCommands(commands as unknown as CommandRegistry);

        expect(commands.commands.get('vsxExtensions.filterByType:extension')?.isToggled?.()).to.equal(false);
        expect(commands.commands.get('vsxExtensions.filterByType:mcp-server')?.isToggled?.()).to.equal(false);
        expect(commands.commands.get('vsxExtensions.filterByType:skill')?.isToggled?.()).to.equal(false);
        expect(searchModel.query).to.equal('');
    });

    it('narrows to a single type with one click, ticking only it', () => {
        const { contribution, searchModel } = buildContribution();
        const commands = new FakeCommandRegistry();
        contribution.registerCommands(commands as unknown as CommandRegistry);

        // From the empty (no-filter) state, clicking MCP includes only MCP - a single click.
        commands.commands.get('vsxExtensions.filterByType:mcp-server')?.execute();

        expect(searchModel.query).to.equal('@mcp');
        expect(commands.commands.get('vsxExtensions.filterByType:mcp-server')?.isToggled?.()).to.equal(true);
        expect(commands.commands.get('vsxExtensions.filterByType:extension')?.isToggled?.()).to.equal(false);
        expect(commands.commands.get('vsxExtensions.filterByType:skill')?.isToggled?.()).to.equal(false);
    });

    it('unticking the only ticked type returns to the no-filter state', () => {
        const { contribution, searchModel } = buildContribution();
        const commands = new FakeCommandRegistry();
        contribution.registerCommands(commands as unknown as CommandRegistry);

        commands.commands.get('vsxExtensions.filterByType:mcp-server')?.execute();
        commands.commands.get('vsxExtensions.filterByType:mcp-server')?.execute();

        // First click includes MCP (`@mcp`); clicking it again removes the only token, so the
        // query goes back to empty (no filter).
        expect(searchModel.query).to.equal('');
    });

    it('widens the selection when a second type is ticked', () => {
        const { contribution, searchModel } = buildContribution();
        const commands = new FakeCommandRegistry();
        contribution.registerCommands(commands as unknown as CommandRegistry);

        commands.commands.get('vsxExtensions.filterByType:mcp-server')?.execute();
        commands.commands.get('vsxExtensions.filterByType:skill')?.execute();

        // Order should mirror the contribution iteration order, so `@mcp @skills`, not `@skills @mcp`.
        expect(searchModel.query).to.equal('@mcp @skills');
        expect(commands.commands.get('vsxExtensions.filterByType:mcp-server')?.isToggled?.()).to.equal(true);
        expect(commands.commands.get('vsxExtensions.filterByType:skill')?.isToggled?.()).to.equal(true);
        expect(commands.commands.get('vsxExtensions.filterByType:extension')?.isToggled?.()).to.equal(false);
    });

    it('unticks one type from an explicit subset (typed-by-hand query) leaving the others alone', () => {
        const { contribution, searchModel } = buildContribution();
        const commands = new FakeCommandRegistry();
        contribution.registerCommands(commands as unknown as CommandRegistry);

        // User explicitly typed two tokens; unticking one of them removes only that one.
        searchModel.query = '@mcp @skills';
        commands.commands.get('vsxExtensions.filterByType:mcp-server')?.execute();

        expect(searchModel.query).to.equal('@skills');
    });

    it('keeps the existing mode token and free text intact when ticking a type', () => {
        const { contribution, searchModel } = buildContribution();
        const commands = new FakeCommandRegistry();
        contribution.registerCommands(commands as unknown as CommandRegistry);

        searchModel.query = '@installed alpha';
        commands.commands.get('vsxExtensions.filterByType:mcp-server')?.execute();

        // Mode first, then type tokens, then free text. Ticking MCP narrows to it while the
        // `@installed` mode and the `alpha` search text stay put.
        expect(searchModel.query).to.equal('@installed @mcp alpha');
    });

    it('ticking every type spells out all tokens (no auto-collapse) while keeping all results visible', () => {
        const { contribution, searchModel } = buildContribution();
        const commands = new FakeCommandRegistry();
        contribution.registerCommands(commands as unknown as CommandRegistry);

        commands.commands.get('vsxExtensions.filterByType:extension')?.execute();
        commands.commands.get('vsxExtensions.filterByType:mcp-server')?.execute();
        commands.commands.get('vsxExtensions.filterByType:skill')?.execute();

        // Each click toggles exactly one checkbox - no surprising mass-untick - so all three
        // tokens are spelled out in contribution-priority order.
        expect(searchModel.query).to.equal('@extensions @mcp @skills');
        expect(commands.commands.get('vsxExtensions.filterByType:extension')?.isToggled?.()).to.equal(true);
        expect(commands.commands.get('vsxExtensions.filterByType:mcp-server')?.isToggled?.()).to.equal(true);
        expect(commands.commands.get('vsxExtensions.filterByType:skill')?.isToggled?.()).to.equal(true);
        // Every type is still enabled for the result set (all three explicitly included).
        expect(searchModel.isTokenEnabled('@extensions')).to.equal(true);
        expect(searchModel.isTokenEnabled('@mcp')).to.equal(true);
        expect(searchModel.isTokenEnabled('@skills')).to.equal(true);
    });
});

describe('VSXExtensionsFilterContribution mode shortcut toggles', () => {

    it('adds the mode token when toggled on and reports the matching checkmark', () => {
        const { contribution, searchModel } = buildContribution();
        const commands = new FakeCommandRegistry();
        contribution.registerCommands(commands as unknown as CommandRegistry);

        commands.commands.get('vsxExtensions.filterByMode:installed')?.execute();
        expect(searchModel.query).to.equal('@installed');
        expect(commands.commands.get('vsxExtensions.filterByMode:installed')?.isToggled?.()).to.equal(true);
        expect(commands.commands.get('vsxExtensions.filterByMode:builtin')?.isToggled?.()).to.equal(false);
    });

    it('removes the mode token when the active mode is clicked again', () => {
        const { contribution, searchModel } = buildContribution();
        const commands = new FakeCommandRegistry();
        contribution.registerCommands(commands as unknown as CommandRegistry);

        commands.commands.get('vsxExtensions.filterByMode:installed')?.execute();
        commands.commands.get('vsxExtensions.filterByMode:installed')?.execute();

        expect(searchModel.query).to.equal('');
    });

    it('replaces the active mode when a different mode is selected (modes are mutually exclusive)', () => {
        const { contribution, searchModel } = buildContribution();
        const commands = new FakeCommandRegistry();
        contribution.registerCommands(commands as unknown as CommandRegistry);

        commands.commands.get('vsxExtensions.filterByMode:installed')?.execute();
        commands.commands.get('vsxExtensions.filterByMode:builtin')?.execute();

        expect(searchModel.query).to.equal('@builtin');
    });

    it('composes with type tokens and free text', () => {
        const { contribution, searchModel } = buildContribution();
        const commands = new FakeCommandRegistry();
        contribution.registerCommands(commands as unknown as CommandRegistry);

        searchModel.query = '@mcp asana';
        commands.commands.get('vsxExtensions.filterByMode:installed')?.execute();

        expect(searchModel.query).to.equal('@installed @mcp asana');
    });
});

describe('VSXExtensionsFilterContribution menu registration', () => {

    it('registers one menu entry per contribution and one per mode shortcut, in distinct groups', () => {
        const { contribution } = buildContribution();
        const menus = new FakeMenuRegistry();
        contribution.registerMenus(menus as unknown as MenuModelRegistry);

        const typeEntries = menus.menus.get('vsx-extensions-filter-by-type-context-menu/1_types') ?? [];
        const modeEntries = menus.menus.get('vsx-extensions-filter-by-type-context-menu/2_modes') ?? [];

        expect(typeEntries.map(e => e.commandId)).to.deep.equal([
            'vsxExtensions.filterByType:extension',
            'vsxExtensions.filterByType:mcp-server',
            'vsxExtensions.filterByType:skill'
        ]);
        expect(modeEntries.map(e => e.commandId)).to.deep.equal([
            'vsxExtensions.filterByMode:installed',
            'vsxExtensions.filterByMode:builtin',
            'vsxExtensions.filterByMode:recommended'
        ]);
    });
});
