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

import { InstalledPluginInfo, ResolvedPluginEntry, StagedPluginInstall } from './plugin-registry-types';

export const PluginInstallBackendServicePath = '/services/ai-registry/plugin-install';

export const PluginInstallClient = Symbol('PluginInstallClient');
export interface PluginInstallClient {
    notifyDidChangeInstalledPlugins(): void;
    /** The watcher stopped after an error; no further change notifications arrive until reload. */
    notifyWatcherStopped(): void;
}

export const PluginInstallBackendService = Symbol('PluginInstallBackendService');

/**
 * Performs all Agent Plugin filesystem and network work: the plugins root lives outside the browser
 * FileService sandbox.
 *
 * Installing is two-phase so that a content-hash mismatch is an explicit user decision rather than
 * something discovered after the plugin is already in place: {@link stage} downloads and verifies
 * without touching the final location, and the frontend then {@link commit}s or {@link discard}s.
 * Registering the resolved components is the frontend's job, after {@link commit} returns.
 */
export interface PluginInstallBackendService {
    /** @throws when the source cannot be downloaded, or `plugin.json` is missing or invalid. */
    stage(entry: ResolvedPluginEntry): Promise<StagedPluginInstall>;
    /**
     * @param replaceExisting true for update and fix, where the existing root is removed first. The
     * plugin's data directory is preserved either way, as the specification requires.
     */
    commit(stagingId: string, replaceExisting: boolean): Promise<InstalledPluginInfo>;
    discard(stagingId: string): Promise<void>;
    /** Only removes roots carrying our provenance marker. */
    uninstall(pluginId: string): Promise<void>;
    /** Adopts an existing directory by writing the provenance marker, leaving its content untouched. */
    link(entry: ResolvedPluginEntry, directoryName: string): Promise<InstalledPluginInfo>;
    unlink(pluginId: string): Promise<void>;
    listInstalledPlugins(): Promise<InstalledPluginInfo[]>;
    getPluginsRoot(): Promise<string>;
}
