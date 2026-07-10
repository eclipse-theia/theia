// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject, named, postConstruct, interfaces } from '@theia/core/shared/inversify';
import { DebugSession, DebugSessionData } from './debug-session';
import { DebugConfigurationSessionOptions, DebugSessionOptions } from './debug-session-options';
import { OutputChannelManager, OutputChannel } from '@theia/output/lib/browser/output-channel';
import { DebugPreferences } from '../common/debug-preferences';
import { DebugSessionConnection } from './debug-session-connection';
import { DebugChannel, DebugAdapterPath, ForwardingDebugChannel } from '../common/debug-service';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';

/**
 * DebugSessionContribution symbol for DI.
 */
export const DebugSessionContribution = Symbol('DebugSessionContribution');
/**
 * The [debug session](#DebugSession) contribution.
 * Can be used to instantiate a specific debug sessions.
 */
export interface DebugSessionContribution {
    /**
     * The debug type.
     */
    debugType: string;

    /**
     * The [debug session](#DebugSession) factory.
     */
    debugSessionFactory(): DebugSessionFactory;
}
/**
 * DebugSessionContributionRegistry symbol for DI.
 */
export const DebugSessionContributionRegistry = Symbol('DebugSessionContributionRegistry');
/**
 * Debug session contribution registry.
 */
export interface DebugSessionContributionRegistry {
    get(debugType: string): DebugSessionContribution | undefined;
}

@injectable()
export class DebugSessionContributionRegistryImpl implements DebugSessionContributionRegistry {
    protected readonly contribs = new Map<string, DebugSessionContribution>();

    @inject(ContributionProvider) @named(DebugSessionContribution)
    protected readonly contributions: ContributionProvider<DebugSessionContribution>;

    @postConstruct()
    protected init(): void {
        for (const contrib of this.contributions.getContributions()) {
            this.contribs.set(contrib.debugType, contrib);
        }
    }

    get(debugType: string): DebugSessionContribution | undefined {
        return this.contribs.get(debugType);
    }
}

/**
 * DebugSessionFactory symbol for DI.
 */
export const DebugSessionFactory = Symbol('DebugSessionFactory');

/**
 * The [debug session](#DebugSession) factory.
 */
export interface DebugSessionFactory {
    createSession(sessionId: string, options: DebugSessionOptions, parentSession?: DebugSession): DebugSession;
}

export class DefaultDebugSessionFactory implements DebugSessionFactory {
    protected readonly container: interfaces.Container;

    constructor(container: interfaces.Container) {
        this.container = container;
    }

    createSession(sessionId: string, options: DebugConfigurationSessionOptions, parentSession?: DebugSession): DebugSession {
        const connectionProvider: ServiceConnectionProvider = this.container.get(RemoteConnectionProvider);
        const connection = new DebugSessionConnection(
            sessionId,
            () => new Promise<DebugChannel>(resolve =>
                connectionProvider.listen(`${DebugAdapterPath}/${sessionId}`, (_, wsChannel) => {
                    resolve(new ForwardingDebugChannel(wsChannel));
                }, false)
            ),
            this.getTraceOutputChannel());
        const data: DebugSessionData = {
            id: sessionId,
            options,
            parentSession,
        };
        const child = DebugSession.createContainer(this.container, data, connection);
        return child.get(DebugSession);
    }

    protected getTraceOutputChannel(): OutputChannel | undefined {
        const outputChannelManager: OutputChannelManager = this.container.get(OutputChannelManager);
        const debugPreferences: DebugPreferences = this.container.get(DebugPreferences);
        if (debugPreferences['debug.trace']) {
            return outputChannelManager.getChannel('Debug adapters');
        }
    }
}
