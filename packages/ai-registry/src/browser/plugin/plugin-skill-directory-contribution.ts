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

import { Disposable, DisposableCollection, Emitter, Event, ILogger } from '@theia/core';
import { Path } from '@theia/core/lib/common/path';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { SkillDirectoryContribution } from '@theia/ai-core/lib/browser/skill-service';
import { SkillDirectoryEntry } from '@theia/ai-core/lib/common/skill';
import { InstalledPluginInfo } from '../../common/plugin/plugin-registry-types';
import { PluginInstallClientImpl } from './plugin-install-client';
import { PluginInstallService } from './plugin-install-service';

/** Fixed component location of the specification; not configurable. */
const PLUGIN_SKILLS_DIRECTORY = 'skills';

/**
 * One skill root per installed Agent Plugin, carrying the qualifier that keeps two plugins' skills
 * from colliding by name. Only plugins carrying our provenance marker are contributed: qualification
 * needs an identifier, and a hand-placed directory has none until it is linked.
 */
@injectable()
export class PluginSkillDirectoryContribution implements SkillDirectoryContribution, Disposable {

    @inject(PluginInstallService)
    protected readonly installService: PluginInstallService;

    @inject(PluginInstallClientImpl)
    protected readonly installClient: PluginInstallClientImpl;

    @inject(ILogger) @named('ai-registry:PluginSkillDirectoryContribution')
    protected readonly logger: ILogger;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.installClient.onDidChangeInstalledPlugins(() => this.onDidChangeEmitter.fire()));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    /**
     * The qualifier comes from the marker, chosen once when the plugin was installed or linked, so
     * installing another plugin never renames these skills.
     */
    async getSkillDirectories(): Promise<SkillDirectoryEntry[]> {
        return (await this.listManagedPlugins()).map(info => ({
            path: new Path(info.root).join(PLUGIN_SKILLS_DIRECTORY).fsPath(),
            tier: 'plugin' as const,
            qualifier: info.qualifier ?? info.directoryName
        }));
    }

    /**
     * Ordered by identifier so the contributed roots do not depend on `readdir` order. A backend
     * failure yields no roots rather than propagating, so every other skill tier keeps loading.
     */
    protected async listManagedPlugins(): Promise<InstalledPluginInfo[]> {
        try {
            const installed = await this.installService.listInstalledPlugins();
            return installed
                .filter(info => info.pluginId !== undefined)
                .sort((left, right) => left.pluginId!.localeCompare(right.pluginId!));
        } catch (error) {
            this.logger.warn('Could not list installed Agent Plugins; no plugin skill roots are contributed.', error);
            return [];
        }
    }
}
