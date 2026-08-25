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

import { inject, injectable } from '@theia/core/shared/inversify';
import { PluginDirectoryNaming } from '../../common/plugin/plugin-directory-naming';
import { RegistryAutoUpdatePolicy } from '../auto-update/registry-auto-update-policy';
import { PluginInstallBackendService } from '../../common/plugin/plugin-install-protocol';
import {
    InstalledPluginInfo,
    PluginClassificationResult,
    ResolvedPluginEntry,
    StagedPluginInstall
} from '../../common/plugin/plugin-registry-types';

export const PluginInstallService = Symbol('PluginInstallService');
/** Frontend view of {@link PluginInstallBackendService}, plus the classification the cards render from. */
export interface PluginInstallService {
    stage(entry: ResolvedPluginEntry): Promise<StagedPluginInstall>;
    commit(stagingId: string, replaceExisting: boolean): Promise<InstalledPluginInfo>;
    discard(stagingId: string): Promise<void>;
    uninstall(pluginId: string): Promise<void>;
    /** Adopts an existing local directory by writing the provenance marker. */
    link(entry: ResolvedPluginEntry, directoryName: string): Promise<InstalledPluginInfo>;
    unlink(pluginId: string): Promise<void>;
    listInstalledPlugins(): Promise<InstalledPluginInfo[]>;
    getPluginsRoot(): Promise<string>;
    /** For the Installed view. */
    classifyInstalledPlugin(info: InstalledPluginInfo, entries: ResolvedPluginEntry[]): PluginClassificationResult;
    /** The marker-less directory Link should adopt for this entry, i.e. what `installed-manually` refers to. */
    findLinkDirectory(entry: ResolvedPluginEntry, installed: InstalledPluginInfo[]): string | undefined;
    /** For the Search view. */
    classifyRegistryEntry(entry: ResolvedPluginEntry, installed: InstalledPluginInfo[]): PluginClassificationResult;
}

@injectable()
export class PluginInstallServiceImpl implements PluginInstallService {

    @inject(PluginInstallBackendService)
    protected readonly backend: PluginInstallBackendService;

    @inject(PluginDirectoryNaming)
    protected readonly directoryNaming: PluginDirectoryNaming;

    @inject(RegistryAutoUpdatePolicy)
    protected readonly autoUpdatePolicy: RegistryAutoUpdatePolicy;

    stage(entry: ResolvedPluginEntry): Promise<StagedPluginInstall> {
        return this.backend.stage(entry);
    }

    commit(stagingId: string, replaceExisting: boolean): Promise<InstalledPluginInfo> {
        return this.backend.commit(stagingId, replaceExisting);
    }

    discard(stagingId: string): Promise<void> {
        return this.backend.discard(stagingId);
    }

    async uninstall(pluginId: string): Promise<void> {
        await this.backend.uninstall(pluginId);
        // The plugin is gone, so its override would linger with nothing left to apply it to.
        await this.autoUpdatePolicy.clearMode('plugin', pluginId);
    }

    link(entry: ResolvedPluginEntry, directoryName: string): Promise<InstalledPluginInfo> {
        return this.backend.link(entry, directoryName);
    }

    async unlink(pluginId: string): Promise<void> {
        // Unlinking is the other way a plugin stops being registry-managed, so it drops the
        // override for the same reason uninstall does. Re-linking starts from the default again.
        await this.backend.unlink(pluginId);
        await this.autoUpdatePolicy.clearMode('plugin', pluginId);
    }

    listInstalledPlugins(): Promise<InstalledPluginInfo[]> {
        return this.backend.listInstalledPlugins();
    }

    getPluginsRoot(): Promise<string> {
        return this.backend.getPluginsRoot();
    }

    classifyInstalledPlugin(info: InstalledPluginInfo, entries: ResolvedPluginEntry[]): PluginClassificationResult {
        if (info.pluginId !== undefined) {
            const matched = entries.find(entry => entry.pluginId === info.pluginId);
            if (!matched) {
                // The provenance marker names a pluginId the registry no longer lists.
                return { kind: 'installed-link-stale' };
            }
            return this.classifyLinked(matched.contentHash, info);
        }
        // No provenance marker: a hand-placed directory. Offer Link only when the registry knows it.
        return entries.some(entry => this.matchesUnlinked(entry, info))
            ? { kind: 'installed-manually' }
            : { kind: 'installed-user-added' };
    }

    classifyRegistryEntry(entry: ResolvedPluginEntry, installed: InstalledPluginInfo[]): PluginClassificationResult {
        const linked = installed.find(info => info.pluginId === entry.pluginId);
        if (linked) {
            return this.classifyLinked(entry.contentHash, linked);
        }
        // Marker-less directory - offer Link, since Install would refuse to overwrite it.
        return this.findLinkDirectory(entry, installed) !== undefined
            ? { kind: 'installed-manually' }
            : { kind: 'not-installed' };
    }

    /**
     * Drift takes precedence over Update, mirroring the skill and MCP classifiers: a plugin whose
     * root no longer matches what was installed must be fixed before it counts as updatable, and
     * that is also what keeps the auto-updater from silently replacing edited content. Nothing is
     * lost by fixing first - Fix and Update are the same clean replace, so a single Fix already
     * lands the current registry content.
     *
     * Both are decided against the one recorded hash, which is always the endorsed one: an update
     * means the registry published a different hash, drift means the tree on disk no longer
     * produces it.
     */
    protected classifyLinked(registryHash: string, info: InstalledPluginInfo): PluginClassificationResult {
        if (info.drifted) {
            return { kind: 'fix-plugin' };
        }
        if (registryHash !== info.contentHash) {
            return { kind: 'installed-from-registry', updateAvailable: true };
        }
        return { kind: 'installed-from-registry', updateAvailable: false };
    }

    findLinkDirectory(entry: ResolvedPluginEntry, installed: InstalledPluginInfo[]): string | undefined {
        return installed.find(info => info.pluginId === undefined && this.matchesUnlinked(entry, info))?.directoryName;
    }

    /**
     * A marker-less directory carries no identifier, so only the canonical name counts: adopting any
     * other would make Update or Fix create a second directory beside the adopted one.
     */
    protected matchesUnlinked(entry: ResolvedPluginEntry, info: InstalledPluginInfo): boolean {
        return info.directoryName === this.directoryNaming.directoryName(entry.pluginId);
    }
}
