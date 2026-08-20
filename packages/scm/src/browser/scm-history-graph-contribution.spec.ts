// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { Command, CommandHandler, CommandRegistry } from '@theia/core/lib/common/command';
import { Disposable } from '@theia/core/lib/common/disposable';
import { ScmHistoryGraphContribution, ScmHistoryGraphCommands } from './scm-history-graph-contribution';
import { ScmHistoryGraphModel, ScmHistoryViewMode } from './scm-history-graph-model';
import { ScmHistoryProvider } from './scm-provider';

disableJSDOM();

interface ContributionInternals {
    scmService: { selectedRepository: { provider: { historyProvider?: ScmHistoryProvider } } | undefined };
    modelProvider: () => ScmHistoryGraphModel;
    quickInputService: unknown;
    scmContextKeys: unknown;
}

const ALL_COMMANDS = [
    ScmHistoryGraphCommands.REFRESH,
    ScmHistoryGraphCommands.PICK_HISTORY_ITEM_REFS,
    ScmHistoryGraphCommands.REVEAL_CURRENT_HISTORY_ITEM,
    ScmHistoryGraphCommands.SET_LIST_VIEW_MODE,
    ScmHistoryGraphCommands.SET_TREE_VIEW_MODE,
];

function createContribution(historyProvider: ScmHistoryProvider | undefined, currentRefInFilter = true): {
    handlers: Map<string, CommandHandler>;
    modelResolved(): boolean;
    revealCount(): number;
    viewMode(): ScmHistoryViewMode;
} {
    const contribution = new ScmHistoryGraphContribution();
    let resolved = false;
    let reveals = 0;
    let viewMode: ScmHistoryViewMode = 'list';
    const internals = contribution as unknown as ContributionInternals;
    internals.scmService = {
        selectedRepository: historyProvider ? { provider: { historyProvider } } : undefined,
    };
    internals.modelProvider = () => {
        resolved = true;
        return {
            historyItemRefFilter: undefined,
            revealCurrentHistoryItem: async () => { reveals++; return undefined; },
            get viewMode(): ScmHistoryViewMode { return viewMode; },
            setViewMode: (mode: ScmHistoryViewMode) => { viewMode = mode; },
        } as unknown as ScmHistoryGraphModel;
    };
    internals.quickInputService = {};
    internals.scmContextKeys = {
        scmCurrentHistoryItemRefInFilter: { get: () => currentRefInFilter },
    };

    const handlers = new Map<string, CommandHandler>();
    const registry = {
        registerCommand: (command: Command, handler: CommandHandler): Disposable => {
            handlers.set(command.id, handler);
            return Disposable.NULL;
        },
    } as unknown as CommandRegistry;
    contribution.registerCommands(registry);
    return { handlers, modelResolved: () => resolved, revealCount: () => reveals, viewMode: () => viewMode };
}

describe('ScmHistoryGraphContribution', () => {

    it('does not resolve the graph model for enablement and visibility checks', () => {
        const { handlers, modelResolved } = createContribution({} as ScmHistoryProvider);
        for (const command of ALL_COMMANDS) {
            const handler = handlers.get(command.id)!;
            expect(handler.isEnabled!()).to.be.true;
            expect(handler.isVisible!()).to.be.true;
        }
        expect(modelResolved()).to.be.false;
    });

    it('disables the commands when the selected repository has no history provider', () => {
        const { handlers, modelResolved } = createContribution(undefined);
        for (const command of ALL_COMMANDS) {
            const handler = handlers.get(command.id)!;
            expect(handler.isEnabled!()).to.be.false;
            expect(handler.isVisible!()).to.be.false;
        }
        expect(modelResolved()).to.be.false;
    });

    it('disables revealing the current history item when the filter excludes the current ref', () => {
        const { handlers } = createContribution({} as ScmHistoryProvider, false);
        const handler = handlers.get(ScmHistoryGraphCommands.REVEAL_CURRENT_HISTORY_ITEM.id)!;
        expect(handler.isEnabled!()).to.be.false;
    });

    it('keeps revealing the current history item visible when the filter excludes the current ref', () => {
        const { handlers } = createContribution({} as ScmHistoryProvider, false);
        const handler = handlers.get(ScmHistoryGraphCommands.REVEAL_CURRENT_HISTORY_ITEM.id)!;
        expect(handler.isVisible!()).to.be.true;
    });

    it('asks the model to reveal the current history item when executed', async () => {
        const { handlers, revealCount } = createContribution({} as ScmHistoryProvider);
        await handlers.get(ScmHistoryGraphCommands.REVEAL_CURRENT_HISTORY_ITEM.id)!.execute();
        expect(revealCount()).to.equal(1);
    });

    it('switches the model to the tree view mode', async () => {
        const { handlers, viewMode } = createContribution({} as ScmHistoryProvider);
        await handlers.get(ScmHistoryGraphCommands.SET_TREE_VIEW_MODE.id)!.execute();
        expect(viewMode()).to.equal('tree');
    });

    it('switches the model back to the list view mode', async () => {
        const { handlers, viewMode } = createContribution({} as ScmHistoryProvider);
        await handlers.get(ScmHistoryGraphCommands.SET_TREE_VIEW_MODE.id)!.execute();
        await handlers.get(ScmHistoryGraphCommands.SET_LIST_VIEW_MODE.id)!.execute();
        expect(viewMode()).to.equal('list');
    });

    it('toggles the view mode command matching the current view mode', async () => {
        const { handlers } = createContribution({} as ScmHistoryProvider);
        const list = handlers.get(ScmHistoryGraphCommands.SET_LIST_VIEW_MODE.id)!;
        const tree = handlers.get(ScmHistoryGraphCommands.SET_TREE_VIEW_MODE.id)!;
        expect(list.isToggled!()).to.be.true;
        expect(tree.isToggled!()).to.be.false;

        await tree.execute();

        expect(list.isToggled!()).to.be.false;
        expect(tree.isToggled!()).to.be.true;
    });
});
