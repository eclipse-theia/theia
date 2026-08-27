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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
// The service references the Extensions view command, which pulls in browser-side modules,
// so a DOM is required at import time.
const disableJSDOM = enableJSDOM();
try {
    FrontendApplicationConfigProvider.get();
} catch {
    FrontendApplicationConfigProvider.set({});
}

import { expect } from 'chai';
import { ILogger, MessageService, PreferenceService } from '@theia/core';
import { MCPServerDescription } from '@theia/ai-mcp/lib/common/mcp-server-manager';
import { AUTO_UPDATE_OVERRIDES_PREF, AUTO_UPDATE_PREF, AutoUpdateMode } from '../../common/ai-registry-preferences';
import { ResolvedRegistryEntry } from '../../common/mcp/mcp-registry-types';
import { InstalledSkillInfo, ResolvedSkillEntry } from '../../common/skill/skill-registry-types';
import { RegistryFetchService } from '../../common/registry-fetch-service';
import { MCPInstallService, MCPInstallServiceImpl } from '../mcp/mcp-install-service';
import { SkillInstallService, SkillInstallServiceImpl } from '../skill/skill-install-service';
import { RegistryAutoUpdatePolicy, RegistryAutoUpdatePolicyImpl } from './registry-auto-update-policy';
import { PluginDirectoryNamingImpl } from '../../common/plugin/plugin-directory-naming';
import { InstalledPluginInfo, ResolvedPluginEntry } from '../../common/plugin/plugin-registry-types';
import { PluginInstallService, PluginInstallServiceImpl } from '../plugin/plugin-install-service';
import { PluginInstaller } from '../plugin/plugin-installer';
import { RegistryAutoUpdateService } from './registry-auto-update-service';

after(() => disableJSDOM());

const skillEntry: ResolvedSkillEntry = {
    skillId: 'io.github.example/skill-a',
    name: 'Skill A',
    description: 'A skill',
    sourceUrl: 'https://github.com/example/skills',
    contentHash: 'hash-v2'
};

const otherSkillEntry: ResolvedSkillEntry = {
    skillId: 'io.github.example/skill-b',
    name: 'Skill B',
    description: 'Another skill',
    sourceUrl: 'https://github.com/example/skills',
    contentHash: 'hash-v2'
};

const mcpEntry: ResolvedRegistryEntry = {
    serverId: 'io.github.example/server-a',
    name: 'Server A',
    description: 'A server',
    localName: 'server-a',
    config: { command: 'npx', args: ['-y', 'server-a'] },
    configHash: 'hash-v2',
    mcpRegistryVerified: true
};

const pluginEntry: ResolvedPluginEntry = {
    pluginId: 'io.github.example/plugin-a',
    name: 'Plugin A',
    description: 'A plugin',
    sourceUrl: 'https://github.com/example/plugin-a',
    contentHash: 'hash-v2',
    endorsements: [{ organizationId: 'example', date: '2026-08-07' }],
    containedSkills: [],
    containedMcpServers: []
};

/** Installed skill whose recorded hash is behind the registry, i.e. an update is available. */
function outdatedSkill(entry: ResolvedSkillEntry, drifted = false): InstalledSkillInfo {
    return { name: entry.name, skillId: entry.skillId, contentHash: 'hash-v1', drifted };
}

/** Locally stored server linked to the registry entry but carrying an older config hash. */
function outdatedServer(entry: ResolvedRegistryEntry, drifted = false): MCPServerDescription {
    return {
        name: entry.localName,
        command: drifted ? 'tampered' : entry.config.command,
        args: entry.config.args,
        registryMetadata: { serverId: entry.serverId, configHash: 'hash-v1' }
    } as MCPServerDescription;
}

/** Installed plugin whose recorded hash is behind the registry, i.e. an update is available. */
function outdatedPlugin(entry: ResolvedPluginEntry, drifted = false): InstalledPluginInfo {
    const directoryName = 'io.github.example_plugin-a';
    return {
        directoryName,
        root: `/home/u/.agents/plugins/${directoryName}`,
        dataRoot: `/home/u/.agents/plugin-data/${directoryName}`,
        pluginId: entry.pluginId,
        contentHash: 'hash-v1',
        qualifier: 'plugin-a',
        drifted,
        skills: [],
        servers: [],
        skipped: []
    };
}

interface RecordedMessage {
    kind: 'info' | 'warn';
    text: string;
    actions: string[];
}

interface TestOptions {
    defaultMode?: AutoUpdateMode;
    overrides?: Record<string, AutoUpdateMode>;
    skillEntries?: ResolvedSkillEntry[];
    mcpEntries?: ResolvedRegistryEntry[];
    installedSkills?: InstalledSkillInfo[];
    installedServers?: MCPServerDescription[];
    pluginEntries?: ResolvedPluginEntry[];
    installedPlugins?: InstalledPluginInfo[];
    /** Registry ids whose update should throw. */
    failing?: string[];
    /** Action label the user "clicks" on any notification offering it. */
    answer?: string;
    /** When set, the registry fetch rejects. */
    fetchFails?: boolean;
    /** False when the user has never chosen a default, so the one-time policy prompt is due. */
    explicitDefault?: boolean;
}

class TestAutoUpdateService extends RegistryAutoUpdateService {
    readonly messages: RecordedMessage[] = [];
    readonly attempted: string[] = [];
    shown = 0;

    protected override async showInstalled(): Promise<void> {
        this.shown++;
    }

    /** Deterministic text: the real hints embed a command URI that is irrelevant here. */
    protected override settingsHint(): string {
        return '<settings>';
    }

    protected override settingsChangeHint(): string {
        return '<settings>';
    }
}

/**
 * @param explicitDefault whether the user has chosen the default, i.e. whether the one-time
 * policy prompt still has a question to ask.
 */
function createPolicy(defaultMode: AutoUpdateMode, overrides: Record<string, AutoUpdateMode>, explicitDefault = true): RegistryAutoUpdatePolicy {
    const values: Record<string, unknown> = {
        [AUTO_UPDATE_PREF]: defaultMode,
        [AUTO_UPDATE_OVERRIDES_PREF]: overrides
    };
    let userSetDefault = explicitDefault;
    const policy = new RegistryAutoUpdatePolicyImpl();
    Object.assign(policy, {
        preferenceService: {
            get: (name: string, defaultValue: unknown) => values[name] ?? defaultValue,
            inspect: (name: string) => ({
                globalValue: name === AUTO_UPDATE_PREF && !userSetDefault ? undefined : values[name]
            }),
            set: async (name: string, value: unknown) => {
                if (name === AUTO_UPDATE_PREF) {
                    userSetDefault = true;
                }
                values[name] = value;
            }
        } as unknown as PreferenceService
    });
    return policy;
}

function createService(options: TestOptions = {}): { service: TestAutoUpdateService; policy: RegistryAutoUpdatePolicy } {
    const skillEntries = options.skillEntries ?? [skillEntry, otherSkillEntry];
    const mcpEntries = options.mcpEntries ?? [mcpEntry];
    const installedSkills = options.installedSkills ?? [];
    const installedServers = options.installedServers ?? [];
    const pluginEntries = options.pluginEntries ?? [pluginEntry];
    const installedPlugins = options.installedPlugins ?? [];
    const failing = new Set(options.failing ?? []);
    const policy = createPolicy(options.defaultMode ?? 'ask', options.overrides ?? {}, options.explicitDefault ?? true);
    const service = new TestAutoUpdateService();

    // Classification is exercised through the real implementations so the drift rules stay
    // pinned end to end; only the I/O around them is faked.
    const realSkillService = new SkillInstallServiceImpl();
    const realMcpService = new MCPInstallServiceImpl();
    const realPluginService = new PluginInstallServiceImpl();
    Object.assign(realPluginService, { directoryNaming: new PluginDirectoryNamingImpl() });

    const record = async (id: string): Promise<void> => {
        service.attempted.push(id);
        if (failing.has(id)) {
            throw new Error(`update of ${id} failed`);
        }
    };
    const respond = async (kind: 'info' | 'warn', text: string, actions: string[]): Promise<string | undefined> => {
        service.messages.push({ kind, text, actions });
        return options.answer !== undefined && actions.includes(options.answer) ? options.answer : undefined;
    };

    Object.assign(service, {
        policy,
        fetchService: {
            getEntries: async () => {
                if (options.fetchFails) {
                    throw new Error('registry unreachable');
                }
                return mcpEntries;
            },
            getSkillEntries: async () => skillEntries,
            getPluginEntries: async () => pluginEntries
        } as unknown as RegistryFetchService,
        skillInstallService: {
            listInstalledSkills: async () => installedSkills,
            classifyInstalledSkill: (info: InstalledSkillInfo, entries: ResolvedSkillEntry[]) => realSkillService.classifyInstalledSkill(info, entries),
            update: (entry: ResolvedSkillEntry) => record(entry.skillId)
        } as unknown as SkillInstallService,
        mcpInstallService: {
            listInstalledServers: () => installedServers,
            classifyLocalServer: (local: MCPServerDescription, entries: ResolvedRegistryEntry[]) => realMcpService.classifyLocalServer(local, entries),
            update: (entry: ResolvedRegistryEntry) => record(entry.serverId)
        } as unknown as MCPInstallService,
        pluginInstallService: {
            listInstalledPlugins: async () => installedPlugins,
            classifyInstalledPlugin: (info: InstalledPluginInfo, entries: ResolvedPluginEntry[]) => realPluginService.classifyInstalledPlugin(info, entries)
        } as unknown as PluginInstallService,
        pluginInstaller: {
            install: (entry: ResolvedPluginEntry) => record(entry.pluginId).then(() => true)
        } as unknown as PluginInstaller,
        messageService: {
            info: (text: string, ...actions: string[]) => respond('info', text, actions),
            warn: (text: string, ...actions: string[]) => respond('warn', text, actions)
        } as unknown as MessageService,
        logger: {
            warn: () => { },
            error: () => { }
        } as unknown as ILogger
    });
    return { service, policy };
}

describe('RegistryAutoUpdateService', () => {

    describe('mode routing', () => {

        it('neither updates nor notifies when the mode is off', async () => {
            const { service } = createService({ defaultMode: 'off', installedSkills: [outdatedSkill(skillEntry)] });
            await service.check();
            expect(service.attempted).to.be.empty;
            expect(service.messages).to.be.empty;
        });

        it('updates without asking when the mode is on', async () => {
            const { service } = createService({ defaultMode: 'on', installedSkills: [outdatedSkill(skillEntry)] });
            await service.check();
            expect(service.attempted).to.deep.equal([skillEntry.skillId]);
            expect(service.messages).to.have.lengthOf(1);
            expect(service.messages[0].kind).to.equal('info');
            expect(service.messages[0].text).to.contain('Skill A');
            expect(service.messages[0].actions).to.be.empty;
        });

        it('reports one batched message when several artifacts update automatically', async () => {
            const { service } = createService({
                defaultMode: 'on',
                installedSkills: [outdatedSkill(skillEntry), outdatedSkill(otherSkillEntry)],
                installedServers: [outdatedServer(mcpEntry)]
            });
            await service.check();
            expect(service.attempted).to.have.lengthOf(3);
            expect(service.messages).to.have.lengthOf(1);
            expect(service.messages[0].text).to.contain('3');
        });

        it('applies a per-artifact override over the default', async () => {
            const { service } = createService({
                defaultMode: 'off',
                overrides: { [`skill:${skillEntry.skillId}`]: 'on' },
                installedSkills: [outdatedSkill(skillEntry), outdatedSkill(otherSkillEntry)]
            });
            await service.check();
            expect(service.attempted).to.deep.equal([skillEntry.skillId]);
        });

        it('does nothing when nothing has an update available', async () => {
            const current: InstalledSkillInfo = { name: 'Skill A', skillId: skillEntry.skillId, contentHash: skillEntry.contentHash, drifted: false };
            const { service } = createService({ defaultMode: 'on', installedSkills: [current] });
            await service.check();
            expect(service.attempted).to.be.empty;
            expect(service.messages).to.be.empty;
        });
    });

    describe('drift', () => {

        it('skips a drifted skill in on mode', async () => {
            const { service } = createService({ defaultMode: 'on', installedSkills: [outdatedSkill(skillEntry, true)] });
            await service.check();
            expect(service.attempted).to.be.empty;
            expect(service.messages).to.be.empty;
        });

        it('skips a drifted skill in ask mode', async () => {
            const { service } = createService({ defaultMode: 'ask', installedSkills: [outdatedSkill(skillEntry, true)] });
            await service.check();
            expect(service.messages).to.be.empty;
        });

        it('skips a drifted MCP server in on mode', async () => {
            const { service } = createService({ defaultMode: 'on', installedServers: [outdatedServer(mcpEntry, true)] });
            await service.check();
            expect(service.attempted).to.be.empty;
        });

        it('skips a drifted Agent Plugin in on mode', async () => {
            const { service } = createService({ defaultMode: 'on', installedPlugins: [outdatedPlugin(pluginEntry, true)] });
            await service.check();
            expect(service.attempted).to.be.empty;
        });
    });

    describe('Agent Plugins', () => {

        it('updates an outdated plugin without asking when the mode is on', async () => {
            const { service } = createService({ defaultMode: 'on', installedPlugins: [outdatedPlugin(pluginEntry)] });
            await service.check();
            expect(service.attempted).to.deep.equal([pluginEntry.pluginId]);
        });

        it('leaves a plugin alone when the mode is off', async () => {
            const { service } = createService({ defaultMode: 'off', installedPlugins: [outdatedPlugin(pluginEntry)] });
            await service.check();
            expect(service.attempted).to.be.empty;
            expect(service.messages).to.be.empty;
        });

        it('applies a per-plugin override over the default', async () => {
            const { service } = createService({
                defaultMode: 'off',
                overrides: { [`plugin:${pluginEntry.pluginId}`]: 'on' },
                installedPlugins: [outdatedPlugin(pluginEntry)]
            });
            await service.check();
            expect(service.attempted).to.deep.equal([pluginEntry.pluginId]);
        });

        it('leaves a plugin the registry no longer lists alone', async () => {
            const { service } = createService({ defaultMode: 'on', pluginEntries: [], installedPlugins: [outdatedPlugin(pluginEntry)] });
            await service.check();
            expect(service.attempted).to.be.empty;
        });

        it('names the plugin in the prompt, so the notification says what is about to change', async () => {
            const { service } = createService({ defaultMode: 'ask', installedPlugins: [outdatedPlugin(pluginEntry)] });
            await service.check();
            expect(service.messages[0].text).to.contain('Agent Plugin "Plugin A" has an update available.');
        });

        it('batches a plugin together with the other artifact kinds', async () => {
            const { service } = createService({
                defaultMode: 'on',
                installedSkills: [outdatedSkill(skillEntry)],
                installedServers: [outdatedServer(mcpEntry)],
                installedPlugins: [outdatedPlugin(pluginEntry)]
            });
            await service.check();
            expect(service.attempted).to.deep.equal([skillEntry.skillId, mcpEntry.serverId, pluginEntry.pluginId]);
            expect(service.messages.map(message => message.text)).to.deep.equal(['Updated 3 AI registry items.']);
        });

        it('reports the failure without aborting the rest of the batch', async () => {
            const { service } = createService({
                defaultMode: 'on',
                installedSkills: [outdatedSkill(skillEntry)],
                installedPlugins: [outdatedPlugin(pluginEntry)],
                failing: [pluginEntry.pluginId]
            });
            await service.check();
            expect(service.attempted).to.deep.equal([skillEntry.skillId, pluginEntry.pluginId]);
            expect(service.messages.map(message => message.kind)).to.deep.equal(['info', 'warn']);
        });
    });

    describe('update notification', () => {

        it('offers exactly Update and Show for a single pending update', async () => {
            const { service } = createService({ installedSkills: [outdatedSkill(skillEntry)] });
            await service.check();
            expect(service.messages).to.have.lengthOf(1);
            expect(service.messages[0].actions).to.deep.equal(['Update', 'Show']);
            expect(service.messages[0].text).to.contain('Skill A');
            expect(service.messages[0].text).to.contain('<settings>');
        });

        it('keeps the same action set for several pending updates, pluralizing only the label', async () => {
            const { service } = createService({ installedSkills: [outdatedSkill(skillEntry), outdatedSkill(otherSkillEntry)] });
            await service.check();
            expect(service.messages).to.have.lengthOf(1);
            expect(service.messages[0].actions).to.deep.equal(['Update All', 'Show']);
            expect(service.messages[0].text).to.contain('2');
        });

        it('offers no per-artifact policy actions', async () => {
            const { service } = createService({ installedSkills: [outdatedSkill(skillEntry)] });
            await service.check();
            const actions = service.messages[0].actions.join(' ');
            expect(actions).to.not.contain('Never');
            expect(actions).to.not.contain('Auto Update');
        });

        it('updates the single pending artifact for Update', async () => {
            const { service, policy } = createService({ installedSkills: [outdatedSkill(skillEntry)], answer: 'Update' });
            await service.check();
            expect(service.attempted).to.deep.equal([skillEntry.skillId]);
            // The notification never sets policy; the artifact keeps following the default.
            expect(policy.getMode('skill', skillEntry.skillId)).to.equal('ask');
        });

        it('updates everything for Update All', async () => {
            const { service } = createService({
                installedSkills: [outdatedSkill(skillEntry), outdatedSkill(otherSkillEntry)],
                answer: 'Update All'
            });
            await service.check();
            expect(service.attempted).to.have.lengthOf(2);
        });

        it('opens the installed view for Show', async () => {
            const { service } = createService({
                installedSkills: [outdatedSkill(skillEntry), outdatedSkill(otherSkillEntry)],
                answer: 'Show'
            });
            await service.check();
            expect(service.shown).to.equal(1);
            expect(service.attempted).to.be.empty;
        });

        it('updates nothing and persists nothing when dismissed', async () => {
            const { service, policy } = createService({ installedSkills: [outdatedSkill(skillEntry)] });
            await service.check();
            expect(service.attempted).to.be.empty;
            expect(policy.getMode('skill', skillEntry.skillId)).to.equal('ask');
        });
    });

    describe('one-time policy prompt', () => {

        it('is not shown once the user has chosen a default', async () => {
            const { service } = createService({ installedSkills: [outdatedSkill(skillEntry)] });
            await service.check();
            expect(service.messages).to.have.lengthOf(1);
        });

        it('follows the update notification when no default has been chosen', async () => {
            const { service } = createService({ explicitDefault: false, installedSkills: [outdatedSkill(skillEntry)] });
            await service.check();
            expect(service.messages).to.have.lengthOf(2);
            expect(service.messages[1].actions).to.deep.equal(['Enable Auto Update', 'Keep Asking', 'Never']);
            expect(service.messages[1].text).to.contain('<settings>');
        });

        it('follows a dismissed update notification too', async () => {
            const { service } = createService({ explicitDefault: false, installedSkills: [outdatedSkill(skillEntry)] });
            await service.check();
            expect(service.attempted).to.be.empty;
            expect(service.messages).to.have.lengthOf(2);
        });

        it('turns the default on for Enable Auto Update', async () => {
            const { service, policy } = createService({
                explicitDefault: false,
                installedSkills: [outdatedSkill(skillEntry)],
                answer: 'Enable Auto Update'
            });
            await service.check();
            expect(policy.getDefault()).to.equal('on');
            expect(policy.hasExplicitDefault()).to.be.true;
        });

        it('applies the updates the user left outstanding when they enable auto update', async () => {
            // The update notification was dismissed, so nothing has been applied when the policy
            // prompt appears; saying "yes, automatically" must not defer them to the next reload.
            const { service } = createService({
                explicitDefault: false,
                installedSkills: [outdatedSkill(skillEntry), outdatedSkill(otherSkillEntry)],
                answer: 'Enable Auto Update'
            });
            await service.check();
            expect(service.attempted).to.deep.equal([skillEntry.skillId, otherSkillEntry.skillId]);
        });

        it('does not re-apply updates the user already ran from the notification', async () => {
            // "Update" answers the first notification, so nothing is left outstanding for the
            // policy prompt to carry over.
            const { service } = createService({
                explicitDefault: false,
                installedSkills: [outdatedSkill(skillEntry)],
                answer: 'Update'
            });
            await service.check();
            expect(service.attempted).to.deep.equal([skillEntry.skillId]);
        });

        it('turns the default off for Never', async () => {
            const { service, policy } = createService({ explicitDefault: false, installedSkills: [outdatedSkill(skillEntry)], answer: 'Never' });
            await service.check();
            expect(policy.getDefault()).to.equal('off');
        });

        it('pins the default to ask for Keep Asking, so it is never asked again', async () => {
            const { service, policy } = createService({
                explicitDefault: false,
                installedSkills: [outdatedSkill(skillEntry)],
                answer: 'Keep Asking'
            });
            await service.check();
            expect(policy.getDefault()).to.equal('ask');
            expect(policy.hasExplicitDefault()).to.be.true;
        });

        it('persists nothing when dismissed, so it is asked again next window', async () => {
            const { service, policy } = createService({ explicitDefault: false, installedSkills: [outdatedSkill(skillEntry)] });
            await service.check();
            expect(policy.hasExplicitDefault()).to.be.false;
        });

        it('is not shown when there was nothing to notify about', async () => {
            const { service } = createService({ explicitDefault: false, defaultMode: 'on', installedSkills: [outdatedSkill(skillEntry)] });
            await service.check();
            // The artifact updated silently, so the user was never asked anything to follow up on.
            expect(service.messages.map(message => message.actions)).to.deep.equal([[]]);
        });
    });

    describe('failures', () => {

        it('warns once and still reports the successes when part of a batch fails', async () => {
            const { service } = createService({
                defaultMode: 'on',
                installedSkills: [outdatedSkill(skillEntry), outdatedSkill(otherSkillEntry)],
                failing: [otherSkillEntry.skillId]
            });
            await service.check();
            expect(service.attempted).to.have.lengthOf(2);
            expect(service.messages.map(message => message.kind)).to.deep.equal(['info', 'warn']);
            expect(service.messages[0].text).to.contain('Skill A');
            expect(service.messages[1].text).to.contain('1');
        });

        it('reports only the warning when every update fails', async () => {
            const { service } = createService({
                defaultMode: 'on',
                installedSkills: [outdatedSkill(skillEntry)],
                failing: [skillEntry.skillId]
            });
            await service.check();
            expect(service.messages.map(message => message.kind)).to.deep.equal(['warn']);
        });

        it('stays silent when the registry cannot be fetched', async () => {
            const { service } = createService({ defaultMode: 'on', installedSkills: [outdatedSkill(skillEntry)], fetchFails: true });
            await service.check();
            expect(service.attempted).to.be.empty;
            expect(service.messages).to.be.empty;
        });
    });
});
