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

import { MutableChatRequestModel } from '@theia/ai-chat';
import { Container } from '@theia/core/shared/inversify';
import { expect } from 'chai';
import { DefaultFileChangeSetTitleProvider } from './file-changeset-functions';

disableJSDOM();

describe('DefaultFileChangeSetTitleProvider', () => {
    let provider: DefaultFileChangeSetTitleProvider;

    before(() => {
        const container = new Container();
        container.bind(DefaultFileChangeSetTitleProvider).toSelf();

        provider = container.get(DefaultFileChangeSetTitleProvider);
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    it('should provide the title', () => {
        const ctx = {
            agentId: 'test-agent',
        } as MutableChatRequestModel;

        const title = provider.getChangeSetTitle(ctx);
        expect(title).to.equal('Changes proposed');
    });
});
