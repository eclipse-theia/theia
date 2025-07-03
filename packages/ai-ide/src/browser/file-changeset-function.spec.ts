// *****************************************************************************
// Copyright (C) 2025 Lonti.com Pty Ltd.
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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
FrontendApplicationConfigProvider.set({});

import { ChatAgentServiceFactory, MutableChatRequestModel } from '@theia/ai-chat';
import { Container } from '@theia/core/shared/inversify';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { DefaultFileChangeSetTitleProvider } from './file-changeset-functions';

disableJSDOM();

describe('DefaultFileChangeSetTitleProvider', () => {
    let provider: DefaultFileChangeSetTitleProvider;
    const getAgentStub = sinon.stub();

    before(() => {
        const container = new Container();
        container.bind(DefaultFileChangeSetTitleProvider).toSelf();
        container.bind(ChatAgentServiceFactory).toFactory(() => () => ({
            getAgent: getAgentStub
        }));

        provider = container.get(DefaultFileChangeSetTitleProvider);
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    it('should provide the title for the current agent', () => {
        const ctx = {
            agentId: 'test-agent',
        } as MutableChatRequestModel;
        getAgentStub.withArgs('test-agent').returns({
            name: 'Test',
        });

        const title = provider.getChangeSetTitle(ctx);
        expect(title).to.equal('Changes proposed by Test');
    });

    it('should provide the default title if no agent is found', () => {
        const ctx = {
            agentId: 'test-agent',
        } as MutableChatRequestModel;
        getAgentStub.withArgs('test-agent').returns(undefined);

        const title = provider.getChangeSetTitle(ctx);
        expect(title).to.equal('Changes proposed by agent');
    });

    it('should provide the default title if no agent id is present', () => {
        const ctx = {
        } as MutableChatRequestModel;

        const title = provider.getChangeSetTitle(ctx);
        expect(title).to.equal('Changes proposed by agent');
    });
});
