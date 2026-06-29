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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});
import { expect } from 'chai';
import {
    DEFAULT_TOOL_CONFIRMATION_PREFERENCE,
    TOOL_CONFIRMATION_PREFERENCE,
    ToolConfirmationMode
} from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { AiAllowAllModeChatBanner } from './ai-allow-all-mode-chat-banner';
disableJSDOM();

describe('AiAllowAllModeChatBanner', () => {

    type Probe = AiAllowAllModeChatBanner & {
        isBypassValue(key: string, value: unknown): boolean;
    };

    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(() => {
        disableJSDOM();
    });

    function createBanner(): Probe {
        return new AiAllowAllModeChatBanner() as Probe;
    }

    describe('isBypassValue', () => {

        it('flags Allow-All only when the global default is forced to ALWAYS_ALLOW', () => {
            const banner = createBanner();
            expect(banner.isBypassValue(DEFAULT_TOOL_CONFIRMATION_PREFERENCE, ToolConfirmationMode.ALWAYS_ALLOW)).to.be.true;
            expect(banner.isBypassValue(DEFAULT_TOOL_CONFIRMATION_PREFERENCE, ToolConfirmationMode.CONFIRM)).to.be.false;
            expect(banner.isBypassValue(DEFAULT_TOOL_CONFIRMATION_PREFERENCE, ToolConfirmationMode.DISABLED)).to.be.false;
        });

        it('does not flag Allow-All for per-tool ALWAYS_ALLOW entries', () => {
            // Per-tool overrides are scoped exceptions and stay informational rather than
            // escalating the strip to the red Allow-All treatment.
            const banner = createBanner();
            expect(banner.isBypassValue(TOOL_CONFIRMATION_PREFERENCE, { shellExecute: ToolConfirmationMode.ALWAYS_ALLOW })).to.be.false;
            expect(banner.isBypassValue(TOOL_CONFIRMATION_PREFERENCE, {
                shellExecute: ToolConfirmationMode.ALWAYS_ALLOW,
                writeFile: ToolConfirmationMode.CONFIRM
            })).to.be.false;
            expect(banner.isBypassValue(TOOL_CONFIRMATION_PREFERENCE, {})).to.be.false;
        });

        it('returns false for unrelated keys', () => {
            const banner = createBanner();
            expect(banner.isBypassValue('ai-features.AiEnable.enableAI', true)).to.be.false;
            expect(banner.isBypassValue('ai-features.agentMode.enabled', true)).to.be.false;
            expect(banner.isBypassValue('ai-features.chat.defaultChatAgent', 'Coder')).to.be.false;
        });
    });
});
