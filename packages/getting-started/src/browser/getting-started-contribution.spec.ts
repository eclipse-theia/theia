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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from 'chai';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { Command, CommandHandler } from '@theia/core/lib/common/command';
import { QuickPickItem } from '@theia/core/lib/common/quick-pick-service';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';

/** The configuration lives on `window`, so it has to be set again for every fresh JSDOM instance. */
function ensureFrontendConfig(): void {
    try {
        FrontendApplicationConfigProvider.get();
    } catch {
        FrontendApplicationConfigProvider.set({});
    }
}

// Some of the modules loaded below read the configuration while they are being loaded.
ensureFrontendConfig();

import { Walkthrough } from '../common/walkthrough-types';
import { WalkthroughCommands } from '../common/walkthrough-commands';
import { GettingStartedContribution } from './getting-started-contribution';

describe('GettingStartedContribution', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
        ensureFrontendConfig();
    });
    after(() => disableJSDOM());

    let contribution: GettingStartedContribution;
    let handlers: Map<string, CommandHandler>;
    let walkthroughs: Walkthrough[];
    let resetCalls: string[];
    let selectCalls: string[];
    let openedView: boolean;
    let offeredItems: QuickPickItem[];
    /** The walkthrough the user picks, or `undefined` for a cancelled pick. */
    let pickedId: string | undefined;
    let reportedInfos: string[];

    function createWalkthrough(id: string, title: string, steps: { isComplete: boolean }[] = []): Walkthrough {
        return {
            id,
            title,
            description: `${title} description`,
            steps: steps.map((step, index) => ({ id: `s${index}`, title: `S${index}`, description: 'd', isComplete: step.isComplete })),
            pluginId: 'test.plugin'
        };
    }

    beforeEach(() => {
        handlers = new Map();
        walkthroughs = [];
        resetCalls = [];
        selectCalls = [];
        openedView = false;
        offeredItems = [];
        pickedId = undefined;
        reportedInfos = [];

        contribution = new GettingStartedContribution();
        (contribution as any).walkthroughService = {
            getWalkthroughs: () => walkthroughs,
            getStepProgress: (id: string) => {
                const walkthrough = walkthroughs.find(w => w.id === id)!;
                return { completed: walkthrough.steps.filter(s => s.isComplete).length, total: walkthrough.steps.length };
            },
            resetProgress: (id: string) => { resetCalls.push(id); return Promise.resolve(); },
            selectWalkthrough: (id: string) => { selectCalls.push(id); },
            selectStep: () => { }
        };
        (contribution as any).quickInputService = {
            showQuickPick: (items: QuickPickItem[]) => {
                offeredItems = items;
                return Promise.resolve(items.find(item => item.id === pickedId));
            }
        };
        (contribution as any).messageService = {
            info: (message: string) => { reportedInfos.push(message); return Promise.resolve(undefined); }
        };
        (contribution as any).openView = () => { openedView = true; return Promise.resolve(undefined); };

        contribution.registerCommands({
            registerCommand: (command: Command, handler: CommandHandler) => handlers.set(command.id, handler),
            registerAlias: () => { }
        } as any);
    });

    describe('walkthrough.resetProgress', () => {
        it('should offer the available walkthroughs when called without an argument', async () => {
            walkthroughs = [createWalkthrough('wt1', 'First'), createWalkthrough('wt2', 'Second')];
            pickedId = 'wt2';

            await handlers.get(WalkthroughCommands.RESET_WALKTHROUGH_PROGRESS.id)!.execute();

            expect(offeredItems.map(item => item.label)).to.deep.equal(['First', 'Second']);
            expect(resetCalls).to.deep.equal(['wt2']);
        });

        it('should reset the given walkthrough without asking', async () => {
            walkthroughs = [createWalkthrough('wt1', 'First')];

            await handlers.get(WalkthroughCommands.RESET_WALKTHROUGH_PROGRESS.id)!.execute('wt1');

            expect(offeredItems).to.be.empty;
            expect(resetCalls).to.deep.equal(['wt1']);
        });

        it('should reset nothing when the pick is cancelled', async () => {
            walkthroughs = [createWalkthrough('wt1', 'First')];

            await handlers.get(WalkthroughCommands.RESET_WALKTHROUGH_PROGRESS.id)!.execute();

            expect(resetCalls).to.be.empty;
        });

        it('should report that there is nothing to reset', async () => {
            await handlers.get(WalkthroughCommands.RESET_WALKTHROUGH_PROGRESS.id)!.execute();

            expect(reportedInfos).to.have.lengthOf(1);
            expect(resetCalls).to.be.empty;
        });
    });

    describe('walkthrough.open', () => {
        it('should offer the walkthroughs with their progress and open the picked one', async () => {
            walkthroughs = [
                createWalkthrough('wt1', 'Pending', [{ isComplete: true }, { isComplete: false }]),
                createWalkthrough('wt2', 'Finished', [{ isComplete: true }])
            ];
            pickedId = 'wt1';

            await handlers.get(WalkthroughCommands.OPEN_WALKTHROUGH.id)!.execute();

            expect(offeredItems.map(item => item.description)).to.deep.equal(['1 of 2', 'Completed']);
            expect(selectCalls).to.deep.equal(['wt1']);
            expect(openedView).to.be.true;
        });

        it('should open the given walkthrough without asking', async () => {
            walkthroughs = [createWalkthrough('wt1', 'First')];

            await handlers.get(WalkthroughCommands.OPEN_WALKTHROUGH.id)!.execute('wt1');

            expect(offeredItems).to.be.empty;
            expect(selectCalls).to.deep.equal(['wt1']);
        });

        it('should accept the argument object of the VS Code command', async () => {
            walkthroughs = [createWalkthrough('wt1', 'First')];

            await handlers.get(WalkthroughCommands.OPEN_WALKTHROUGH_VSCODE.id)!.execute({ category: 'test.plugin#wt1' });

            expect(selectCalls).to.deep.equal(['test.plugin#wt1']);
        });

        it('should not open the view when the pick is cancelled', async () => {
            walkthroughs = [createWalkthrough('wt1', 'First')];

            await handlers.get(WalkthroughCommands.OPEN_WALKTHROUGH.id)!.execute();

            expect(selectCalls).to.be.empty;
            expect(openedView).to.be.false;
        });
    });
});
