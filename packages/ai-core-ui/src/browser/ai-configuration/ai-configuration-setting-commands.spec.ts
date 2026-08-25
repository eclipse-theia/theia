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

import { expect } from 'chai';
import { Command, CommandRegistry, PreferenceScope } from '@theia/core';
import {
    AiConfigurationSettingCommandArgs,
    AiConfigurationSettingCommandContribution,
    AiConfigurationSettingCommands
} from './ai-configuration-setting-commands';

interface Handler { execute(args: unknown): unknown; isVisible?(args: unknown): boolean; isEnabled?(args: unknown): boolean }

function setup(): { handlers: Map<string, Handler>; setCalls: Array<[string, unknown, PreferenceScope, string | undefined]>; copied: string[] } {
    const setCalls: Array<[string, unknown, PreferenceScope, string | undefined]> = [];
    const copied: string[] = [];
    const contribution = new AiConfigurationSettingCommandContribution();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (contribution as any).aiConfigurationService = {
        set: (id: string, value: unknown, scope: PreferenceScope, resourceUri?: string) => { setCalls.push([id, value, scope, resourceUri]); return Promise.resolve(); }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (contribution as any).clipboardService = { writeText: (text: string) => { copied.push(text); } };
    const handlers = new Map<string, Handler>();
    contribution.registerCommands({ registerCommand: (command: Command, handler: Handler) => handlers.set(command.id, handler) } as unknown as CommandRegistry);
    return { handlers, setCalls, copied };
}

const args: AiConfigurationSettingCommandArgs = { id: 'ai-features.chat.foo', value: true, scope: PreferenceScope.User };

describe('AiConfigurationSettingCommandContribution', () => {

    it('resets a setting in the row scope via AiConfigurationService (not the Settings widget)', () => {
        const { handlers, setCalls } = setup();
        handlers.get(AiConfigurationSettingCommands.RESET.id)!.execute({ ...args, scope: PreferenceScope.Workspace, resourceUri: 'file:///ws' });
        expect(setCalls).to.deep.equal([['ai-features.chat.foo', undefined, PreferenceScope.Workspace, 'file:///ws']]);
    });

    it('resets via the supplied callback for non-preference (e.g. per-agent) rows, without touching AiConfigurationService', () => {
        const { handlers, setCalls } = setup();
        let called = 0;
        const reset = handlers.get(AiConfigurationSettingCommands.RESET.id)!;
        expect(reset.isVisible!({ reset: () => called++ })).to.equal(true);
        reset.execute({ reset: () => called++ });
        expect(called).to.equal(1);
        expect(setCalls).to.be.empty;
    });

    it('hides the copy commands for non-preference (callback-only) rows', () => {
        const { handlers } = setup();
        expect(handlers.get(AiConfigurationSettingCommands.COPY_ID.id)!.isVisible!({ reset: () => undefined })).to.equal(false);
        expect(handlers.get(AiConfigurationSettingCommands.COPY_JSON.id)!.isVisible!({ reset: () => undefined })).to.equal(false);
    });

    it('copies the setting id and the JSON entry', () => {
        const { handlers, copied } = setup();
        handlers.get(AiConfigurationSettingCommands.COPY_ID.id)!.execute(args);
        handlers.get(AiConfigurationSettingCommands.COPY_JSON.id)!.execute(args);
        expect(copied).to.deep.equal(['ai-features.chat.foo', '"ai-features.chat.foo": true']);
    });

    it('guards the commands against malformed arguments', () => {
        const { handlers } = setup();
        const reset = handlers.get(AiConfigurationSettingCommands.RESET.id)!;
        expect(reset.isVisible!(args)).to.equal(true);
        expect(reset.isVisible!({ id: 'x' })).to.equal(false); // missing scope
        expect(reset.isVisible!(undefined)).to.equal(false);
    });
});
