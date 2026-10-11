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

import { Disposable, DisposableCollection, ILogger } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { PluginInstallClientImpl } from './plugin-install-client';
import { PluginInstallService } from './plugin-install-service';
import { PluginMcpRegistrar } from './plugin-mcp-registrar';

/**
 * Keeps `ai-features.mcp.mcpServers` in step with what is actually in the plugins root, so that an
 * `mcp.json` added, changed or removed after the install shows up the way a skill does.
 *
 * Installing registers a plugin's servers directly; this exists for every other way the root can
 * change - an edit on disk, a plugin directory removed by hand, or an `mcp.json` added while the
 * application was not running, which is why it also runs once at startup.
 */
@injectable()
export class PluginMcpReconciler implements FrontendApplicationContribution, Disposable {

    @inject(PluginInstallService)
    protected readonly installService: PluginInstallService;

    @inject(PluginInstallClientImpl)
    protected readonly installClient: PluginInstallClientImpl;

    @inject(PluginMcpRegistrar)
    protected readonly registrar: PluginMcpRegistrar;

    @inject(ILogger) @named('ai-registry:PluginMcpReconciler')
    protected readonly logger: ILogger;

    protected readonly toDispose = new DisposableCollection();

    /** Serialises overlapping runs; two reconciles writing the same preference would race. */
    protected pending: Promise<void> = Promise.resolve();

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.installClient.onDidChangeInstalledPlugins(() => this.reconcile()));
    }

    onStart(): void {
        this.reconcile();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected reconcile(): void {
        this.pending = this.pending.then(async () => {
            try {
                await this.registrar.reconcile(await this.installService.listInstalledPlugins());
            } catch (error) {
                // Logged, not surfaced: this runs on every filesystem event, and a notification per
                // event would be worse than a stale entry the next successful run repairs.
                this.logger.warn('Could not reconcile the MCP servers of the installed Agent Plugins.', error);
            }
        });
    }
}
