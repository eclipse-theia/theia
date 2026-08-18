// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

    stage(entry: ResolvedPluginEntry): Promise<StagedPluginInstall> {
        return this.backend.stage(entry);
    }

    commit(stagingId: string, replaceExisting: boolean): Promise<InstalledPluginInfo> {
        return this.backend.commit(stagingId, replaceExisting);
    }

    discard(stagingId: string): Promise<void> {
        return this.backend.discard(stagingId);
    }

    uninstall(pluginId: string): Promise<void> {
        return this.backend.uninstall(pluginId);
    }

    link(entry: ResolvedPluginEntry, directoryName: string): Promise<InstalledPluginInfo> {
        return this.backend.link(entry, directoryName);
    }

    unlink(pluginId: string): Promise<void> {
        return this.backend.unlink(pluginId);
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
     * Update takes precedence over Fix: only when the registry offers nothing new do local edits
     * surface. Both are decided against the one recorded hash, which is always the endorsed one -
     * an update means the registry published a different hash, drift means the tree on disk no
     * longer produces it.
     */
    protected classifyLinked(registryHash: string, info: InstalledPluginInfo): PluginClassificationResult {
        if (registryHash !== info.contentHash) {
            return { kind: 'installed-from-registry', updateAvailable: true };
        }
        if (info.drifted) {
            return { kind: 'fix-plugin' };
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
