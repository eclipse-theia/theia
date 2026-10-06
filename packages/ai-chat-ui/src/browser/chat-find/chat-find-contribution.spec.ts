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
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { CommandContribution, CommandRegistry, ContributionProvider } from '@theia/core';
import { CommonCommands } from '@theia/core/lib/browser';
import { ChatInputFocusService } from '../chat-input-focus-service';
import type { AIChatInputWidget } from '../chat-input-widget';
import type { ChatViewWidget } from '../chat-view-widget';
import { ChatFindContribution } from './chat-find-contribution';

disableJSDOM();

const MONACO_FIND_ACTION_ID = 'actions.find';

class TestChatFindContribution extends ChatFindContribution {
    chatViewWidget: ChatViewWidget | undefined;

    protected override findActiveChatViewWidget(): ChatViewWidget | undefined {
        return this.chatViewWidget;
    }
}

describe('ChatFindContribution', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    let commands: CommandRegistry;
    let contribution: TestChatFindContribution;
    let focusService: ChatInputFocusService;
    let monacoFindCalls: number;
    let showFindCalls: number;

    function createChatViewWidget(canFind: boolean): ChatViewWidget {
        return { treeWidget: { canFind, showFind: () => showFindCalls++ } } as unknown as ChatViewWidget;
    }

    async function pressFind(commandId: string): Promise<void> {
        await commands.getActiveHandler(commandId)?.execute();
    }

    beforeEach(() => {
        monacoFindCalls = 0;
        showFindCalls = 0;
        commands = new CommandRegistry({ getContributions: () => [] } as ContributionProvider<CommandContribution>);
        // Registered before the chat contribution, as core and Monaco are in the application.
        commands.registerCommand(CommonCommands.FIND, { execute: () => { } });
        const monacoFind = { execute: () => monacoFindCalls++ };
        commands.registerCommand({ id: MONACO_FIND_ACTION_ID }, monacoFind);
        commands.registerHandler(CommonCommands.FIND.id, monacoFind);

        focusService = new ChatInputFocusService();
        contribution = new TestChatFindContribution();
        (contribution as unknown as { chatInputFocusService: ChatInputFocusService }).chatInputFocusService = focusService;
        contribution.registerCommands(commands);
    });

    for (const commandId of [CommonCommands.FIND.id, MONACO_FIND_ACTION_ID]) {
        describe(commandId, () => {
            it('does nothing in a chat input', async () => {
                focusService.setFocused({} as AIChatInputWidget);
                contribution.chatViewWidget = createChatViewWidget(true);
                await pressFind(commandId);
                expect(monacoFindCalls).to.equal(0);
                expect(showFindCalls).to.equal(0);
            });

            it('does nothing in a chat input outside of a chat view', async () => {
                focusService.setFocused({} as AIChatInputWidget);
                await pressFind(commandId);
                expect(monacoFindCalls).to.equal(0);
            });

            it('opens Find in Chat in a chat view with content to search', async () => {
                contribution.chatViewWidget = createChatViewWidget(true);
                await pressFind(commandId);
                expect(showFindCalls).to.equal(1);
                expect(monacoFindCalls).to.equal(0);
            });

            it('does nothing in a chat view without content to search', async () => {
                contribution.chatViewWidget = createChatViewWidget(false);
                await pressFind(commandId);
                expect(showFindCalls).to.equal(0);
                expect(monacoFindCalls).to.equal(0);
            });

            it("leaves Monaco's find alone outside of the chat", async () => {
                await pressFind(commandId);
                expect(monacoFindCalls).to.equal(1);
                expect(showFindCalls).to.equal(0);
            });
        });
    }
});
