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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { AttachContainerArgs, RemoteContainerConnectionProvider } from '../electron-common/remote-container-connection-provider';
import { AbstractRemoteRegistryContribution } from '@theia/remote/lib/electron-browser/remote-registry-contribution';
import { ContributionProvider, ILogger, nls } from '@theia/core';
import { RemoteCliArgsContribution } from '@theia/core/lib/common/remote-cli-args-contribution';
import { ATTACH_PENDING_PARAM, SECOND_INSTANCE_ARGS_PARAM, SecondInstanceArgv } from '@theia/core/lib/common/window';
import { RemotePreferences } from '@theia/remote/lib/electron-common/remote-preferences';
import { ContainerOutputProvider } from './container-output-provider';
import { DevContainerAttachScreen } from './dev-container-attach-screen';

@injectable()
export class DevContainerStartupContribution extends AbstractRemoteRegistryContribution implements FrontendApplicationContribution {

    @inject(RemoteContainerConnectionProvider)
    protected readonly connectionProvider: RemoteContainerConnectionProvider;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(RemotePreferences)
    protected readonly remotePreferences: RemotePreferences;

    @inject(ContributionProvider) @named(RemoteCliArgsContribution)
    protected readonly remoteCliArgsContributions: ContributionProvider<RemoteCliArgsContribution>;

    @inject(ContainerOutputProvider)
    protected readonly containerOutputProvider: ContainerOutputProvider;

    @inject(DevContainerAttachScreen)
    protected readonly attachScreen: DevContainerAttachScreen;

    registerRemoteCommands(): void {
        // no commands to register — this contribution only handles startup
    }

    onStart(): void {
        // For a CLI-driven attach the window is opened empty and reloads into the container once the
        // attach completes. Show the "attaching" screen from the first paint so the user never
        // interacts with the transient local window, before the (possibly RPC-bound) container id is
        // even resolved.
        if (this.isAttachPending()) {
            this.attachScreen.showAttaching();
        }
        this.handleStartupAttach();
    }

    protected async handleStartupAttach(): Promise<void> {
        const args = await this.resolveAttachArgs();
        if (!args) {
            // Not attaching after all (e.g. a second-instance window without --attach-container):
            // make sure a preliminary screen is not left up.
            this.attachScreen.dispose();
            return;
        }
        await this.runStartupAttach(args);
    }

    protected async runStartupAttach(args: AttachContainerArgs): Promise<void> {
        const { containerId, scanForDevJson } = args;
        this.attachScreen.showAttaching(containerId);
        // Surface the backend's live status messages (RemoteStatusReport) on the attach screen.
        const statusSubscription = this.containerOutputProvider.onDidReportStatus(message => this.attachScreen.reportStage(message));
        try {
            this.logger.info(`CLI: --attach-container ${containerId}, initiating attach from frontend...`);
            this.attachScreen.reportStage(nls.localize('theia/remote/dev-container/attachScreen/locating', 'Locating container {0}…', containerId));

            const containers = await this.connectionProvider.listRunningContainers();
            // Match by ID prefix (either direction — user may pass a short prefix or a full 64-char ID
            // while listRunningContainers returns 12-char truncated IDs) or exact name.
            const matches = containers.filter(c => c.id.startsWith(containerId) || containerId.startsWith(c.id) || c.name === containerId);
            if (matches.length > 1) {
                this.logger.warn(`CLI: container identifier "${containerId}" matches ${matches.length} containers, using first match: ${matches[0].name || matches[0].id}`);
            }
            const target = matches[0];

            if (!target) {
                throw new Error(nls.localize('theia/remote/dev-container/cliContainerNotFound',
                    'Container "{0}" not found or not running.', containerId));
            }

            this.attachScreen.reportStage(nls.localize('theia/remote/dev-container/attachScreen/preparingWorkspace', 'Preparing workspace…'));
            const candidates = await this.connectionProvider.getWorkspaceCandidates(target.id);
            const workspacePath = candidates.length > 0 ? candidates[0].path : '/';

            const devcontainerFile = scanForDevJson
                ? await this.connectionProvider.scanForDevContainerConfig(target.id, workspacePath)
                : undefined;

            this.attachScreen.reportStage(nls.localize('theia/remote/dev-container/attachScreen/starting', 'Starting the application inside the container…'));
            const result = await this.connectionProvider.attachToContainer({
                containerId: target.id,
                workspacePath,
                devcontainerFile,
                nodeDownloadTemplate: this.remotePreferences['remote.nodeDownloadTemplate'],
                additionalArgs: await this.collectRemoteCliArgs(),
            });

            this.logger.info(`CLI: startup attach ready, proxy on port ${result.port}, workspace: ${result.workspacePath}`);
            // Reloads the window into the container; the attach screen is torn down by the navigation.
            this.openRemote(result.port, false, result.workspacePath);
        } catch (e) {
            this.logger.error('CLI: Failed to attach to container during startup:', e);
            const message = e instanceof Error ? e.message : String(e);
            this.attachScreen.reportError(message, {
                // Returns the promise so callers/tests can await a retry; the button handler ignores it.
                retry: () => this.runStartupAttach(args),
                close: () => this.attachScreen.dispose()
            });
        } finally {
            statusSubscription.dispose();
        }
    }

    /** Whether this window was opened to attach to a container from the CLI (see {@link ATTACH_PENDING_PARAM}). */
    protected isAttachPending(): boolean {
        return new URLSearchParams(location.search).get(ATTACH_PENDING_PARAM) !== null; // eslint-disable-line no-null/no-null
    }

    /**
     * Resolves the container to attach to on startup.
     *
     * A forwarded (second-instance) launch carries its CLI arguments in the window URL. For such
     * windows those arguments are the only source, because the shared backend still reflects the
     * original cold-start launch and cannot distinguish between windows. A cold-start window has no
     * forwarded arguments and reads them from the backend instead.
     */
    protected async resolveAttachArgs(): Promise<AttachContainerArgs | undefined> {
        const forwarded = this.getForwardedArgv();
        if (forwarded !== undefined) {
            const containerId = SecondInstanceArgv.getValue(forwarded, 'attach-container');
            if (!containerId) {
                return undefined;
            }
            return { containerId, scanForDevJson: !SecondInstanceArgv.isNegated(forwarded, 'dev-json') };
        }
        return this.connectionProvider.getAttachContainerArgs();
    }

    /**
     * Collects extra CLI arguments to pass to the container's remote backend from all
     * {@link RemoteCliArgsContribution}s. This carries per-window options (e.g. forwarded
     * `--session-preference` values) that the shared local backend cannot provide.
     */
    protected async collectRemoteCliArgs(): Promise<string[]> {
        const args: string[] = [];
        for (const contribution of this.remoteCliArgsContributions.getContributions()) {
            try {
                args.push(...await contribution.getRemoteCliArgs());
            } catch (e) {
                this.logger.warn('CLI: Failed to collect remote CLI args from a contribution:', e);
            }
        }
        return args;
    }

    /**
     * Returns the forwarded launch `argv` carried in the window URL, or `undefined` for a
     * cold-start window (where the parameter is absent).
     */
    protected getForwardedArgv(): string[] | undefined {
        const raw = new URLSearchParams(location.search).get(SECOND_INSTANCE_ARGS_PARAM);
        // eslint-disable-next-line no-null/no-null
        return raw === null ? undefined : SecondInstanceArgv.decode(raw);
    }
}
