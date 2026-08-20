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
import { ScmHistoryGraphModel } from './scm-history-graph-model';
import { ScmHistoryProvider } from './scm-provider';

disableJSDOM();

interface ContributionInternals {
    scmService: { selectedRepository: { provider: { historyProvider?: ScmHistoryProvider } } | undefined };
    modelProvider: () => ScmHistoryGraphModel;
    quickInputService: unknown;
}

function createContribution(historyProvider: ScmHistoryProvider | undefined): {
    handlers: Map<string, CommandHandler>;
    modelResolved(): boolean;
} {
    const contribution = new ScmHistoryGraphContribution();
    let resolved = false;
    const internals = contribution as unknown as ContributionInternals;
    internals.scmService = {
        selectedRepository: historyProvider ? { provider: { historyProvider } } : undefined,
    };
    internals.modelProvider = () => {
        resolved = true;
        return { historyItemRefFilter: undefined } as unknown as ScmHistoryGraphModel;
    };
    internals.quickInputService = {};

    const handlers = new Map<string, CommandHandler>();
    const registry = {
        registerCommand: (command: Command, handler: CommandHandler): Disposable => {
            handlers.set(command.id, handler);
            return Disposable.NULL;
        },
    } as unknown as CommandRegistry;
    contribution.registerCommands(registry);
    return { handlers, modelResolved: () => resolved };
}

describe('ScmHistoryGraphContribution', () => {

    it('does not resolve the graph model for enablement and visibility checks', () => {
        const { handlers, modelResolved } = createContribution({} as ScmHistoryProvider);
        for (const command of [ScmHistoryGraphCommands.REFRESH, ScmHistoryGraphCommands.PICK_HISTORY_ITEM_REFS]) {
            const handler = handlers.get(command.id)!;
            expect(handler.isEnabled!()).to.be.true;
            expect(handler.isVisible!()).to.be.true;
        }
        expect(modelResolved()).to.be.false;
    });

    it('disables the commands when the selected repository has no history provider', () => {
        const { handlers, modelResolved } = createContribution(undefined);
        for (const command of [ScmHistoryGraphCommands.REFRESH, ScmHistoryGraphCommands.PICK_HISTORY_ITEM_REFS]) {
            const handler = handlers.get(command.id)!;
            expect(handler.isEnabled!()).to.be.false;
            expect(handler.isVisible!()).to.be.false;
        }
        expect(modelResolved()).to.be.false;
    });
});
