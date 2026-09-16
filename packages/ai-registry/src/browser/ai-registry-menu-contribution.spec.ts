// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { Command, CommandHandler, CommandRegistry, PreferenceService } from '@theia/core';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { Container } from '@theia/core/shared/inversify';
import { AUTO_UPDATE_OVERRIDES_PREF, AUTO_UPDATE_PREF } from '../common/ai-registry-preferences';
import { AIRegistryCommands, AIRegistryMenuContribution } from './ai-registry-menu-contribution';
import { RegistryAutoUpdatePolicy, RegistryAutoUpdatePolicyImpl } from './auto-update/registry-auto-update-policy';
import { RegistryEntryContext } from './registry-entry-context';

/** Collects the handlers the contribution registers so the tests can invoke them directly. */
class StubCommandRegistry {
    readonly handlers = new Map<string, CommandHandler>();
    registerCommand(command: Command, handler: CommandHandler): void {
        this.handlers.set(command.id, handler);
    }
}

class FakePreferenceService {
    private readonly store = new Map<string, unknown>();
    get<T>(key: string, defaultValue?: T): T | undefined {
        return (this.store.has(key) ? this.store.get(key) : defaultValue) as T | undefined;
    }
    async set(key: string, value: unknown): Promise<void> {
        this.store.set(key, value);
    }
    snapshot<T>(key: string): T | undefined {
        return this.store.get(key) as T | undefined;
    }
}

/** An entry that is installed and linked to a live registry entry, so it can take a policy. */
const eligible: RegistryEntryContext = {
    artifactKind: 'skill',
    copyableId: 'io.github.example/example-skill',
    autoUpdateId: 'io.github.example/example-skill'
};

/** A card that cannot receive updates - drifted, unlinked, stale-linked or not installed. */
const notEligible: RegistryEntryContext = {
    artifactKind: 'skill',
    copyableId: 'io.github.example/example-skill',
    autoUpdateId: undefined
};

describe('AIRegistryMenuContribution', () => {

    /** The mode items shown when their mode is not the current global default. */
    const plainIds = [
        AIRegistryCommands.AUTO_UPDATE_OFF.id,
        AIRegistryCommands.AUTO_UPDATE_ASK.id,
        AIRegistryCommands.AUTO_UPDATE_ON.id
    ];
    /** The mode items shown when their mode is the current global default. */
    const defaultIds = [
        AIRegistryCommands.AUTO_UPDATE_OFF_DEFAULT.id,
        AIRegistryCommands.AUTO_UPDATE_ASK_DEFAULT.id,
        AIRegistryCommands.AUTO_UPDATE_ON_DEFAULT.id
    ];
    const autoUpdateCommandIds = [...plainIds, ...defaultIds];

    let prefs: FakePreferenceService;
    let copied: string[];
    let registry: StubCommandRegistry;

    beforeEach(() => {
        const container = new Container();
        prefs = new FakePreferenceService();
        copied = [];
        container.bind(PreferenceService).toConstantValue(prefs);
        container.bind(ClipboardService).toConstantValue({
            readText: () => '',
            writeText: (value: string) => { copied.push(value); }
        } as ClipboardService);
        container.bind(RegistryAutoUpdatePolicyImpl).toSelf().inSingletonScope();
        container.bind(RegistryAutoUpdatePolicy).toService(RegistryAutoUpdatePolicyImpl);
        container.bind(AIRegistryMenuContribution).toSelf().inSingletonScope();
        registry = new StubCommandRegistry();
        container.get(AIRegistryMenuContribution).registerCommands(registry as unknown as CommandRegistry);
    });

    function handler(command: Command | string): CommandHandler {
        return registry.handlers.get(typeof command === 'string' ? command : command.id)!;
    }

    function isVisible(command: Command | string, ...args: unknown[]): boolean {
        return !!handler(command).isVisible?.(...args);
    }

    /** The mode items the menu actually renders. */
    function visibleModes(...args: unknown[]): string[] {
        return autoUpdateCommandIds.filter(id => isVisible(id, ...args));
    }

    /** The mode items the menu renders with a check mark. */
    function checkedModes(...args: unknown[]): string[] {
        return visibleModes(...args).filter(id => handler(id).isToggled?.(...args));
    }

    it('registers a command per auto-update mode variant plus Copy ID', () => {
        expect([...registry.handlers.keys()]).to.have.members([...autoUpdateCommandIds, AIRegistryCommands.COPY_ID.id]);
    });

    it('offers every mode exactly once, as the variant that names the current default', () => {
        expect(visibleModes(eligible)).to.have.members([
            AIRegistryCommands.AUTO_UPDATE_OFF.id,
            AIRegistryCommands.AUTO_UPDATE_ASK_DEFAULT.id,
            AIRegistryCommands.AUTO_UPDATE_ON.id
        ]);
    });

    it('moves the default variant along when the global default changes', async () => {
        await prefs.set(AUTO_UPDATE_PREF, 'on');
        expect(visibleModes(eligible)).to.have.members([
            AIRegistryCommands.AUTO_UPDATE_OFF.id,
            AIRegistryCommands.AUTO_UPDATE_ASK.id,
            AIRegistryCommands.AUTO_UPDATE_ON_DEFAULT.id
        ]);
    });

    it('hides the auto-update modes for an entry that cannot receive updates', () => {
        expect(visibleModes(notEligible)).to.be.empty;
    });

    it('hides every command when invoked without an entry, as from the command palette', () => {
        for (const id of [...autoUpdateCommandIds, AIRegistryCommands.COPY_ID.id]) {
            expect(isVisible(id), id).to.be.false;
        }
    });

    it('checks the default variant when the entry has no override, so the mode reads as inherited', () => {
        expect(checkedModes(eligible)).to.deep.equal([AIRegistryCommands.AUTO_UPDATE_ASK_DEFAULT.id]);
    });

    it('checks a plain variant once an override is set, so the mode reads as explicitly set', async () => {
        await prefs.set(AUTO_UPDATE_OVERRIDES_PREF, { [`skill:${eligible.autoUpdateId}`]: 'on' });
        expect(checkedModes(eligible)).to.deep.equal([AIRegistryCommands.AUTO_UPDATE_ON.id]);
    });

    it('checks nothing for an entry the menu cannot apply a policy to', () => {
        expect(checkedModes(notEligible)).to.be.empty;
    });

    it('writes an override for the picked mode', async () => {
        await handler(AIRegistryCommands.AUTO_UPDATE_ON).execute(eligible);
        expect(prefs.snapshot(AUTO_UPDATE_OVERRIDES_PREF)).to.deep.equal({ [`skill:${eligible.autoUpdateId}`]: 'on' });
    });

    it('picking the default variant clears the override instead of pinning it', async () => {
        await prefs.set(AUTO_UPDATE_PREF, 'ask');
        await prefs.set(AUTO_UPDATE_OVERRIDES_PREF, { [`skill:${eligible.autoUpdateId}`]: 'on' });

        await handler(AIRegistryCommands.AUTO_UPDATE_ASK_DEFAULT).execute(eligible);

        expect(prefs.snapshot(AUTO_UPDATE_OVERRIDES_PREF)).to.deep.equal({});
    });

    it('does nothing when a mode is picked without an entry', async () => {
        await handler(AIRegistryCommands.AUTO_UPDATE_ON).execute();
        expect(prefs.snapshot(AUTO_UPDATE_OVERRIDES_PREF)).to.be.undefined;
    });

    it('copies the entry id to the clipboard', async () => {
        await handler(AIRegistryCommands.COPY_ID).execute(eligible);
        expect(copied).to.deep.equal(['io.github.example/example-skill']);
    });

    it('hides Copy ID for an entry without any identifier', () => {
        expect(isVisible(AIRegistryCommands.COPY_ID, { artifactKind: 'mcp', copyableId: undefined, autoUpdateId: undefined })).to.be.false;
    });

    it('offers Copy ID for an entry that has no auto-update policy but does have an id', () => {
        expect(isVisible(AIRegistryCommands.COPY_ID, notEligible)).to.be.true;
    });
});
