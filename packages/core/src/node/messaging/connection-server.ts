/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable, named, postConstruct } from 'inversify';
import { ContributionProvider } from '../../common/contribution-provider';
import { Emitter, Event } from '../../common/event';
import { Connection } from '../../common/messaging/connection';

/**
 * Central connection handler.
 */
export const ConnectionServer = Symbol('ConnectionServer');
export interface ConnectionServer {
    readonly onConnection: Event<Connection>
    accept(connection: Connection, options?: object): Promise<boolean>
}

export const ConnectionServerContribution = Symbol('ConnectionServerContribution');
export interface ConnectionServerContribution { }

@injectable()
export class ConnectionServerImpl implements ConnectionServer {

    protected onConnectionEmitter = new Emitter<Connection>();

    get onConnection(): Event<Connection> {
        return this.onConnectionEmitter.event;
    }

    async accept(connection: Connection, options: object = {}): Promise<boolean> {
        this.onConnectionEmitter.fire(connection);
        return true;
    }
}

/**
 * By binding this class as a BackendApplicationContribution we can force-resolve
 * `ConnectionServerContribution` Inversify bindings.
 */
@injectable()
export class ConnectionServerContributionLoader {

    @inject(ContributionProvider) @named(ConnectionServerContribution)
    protected contributions: ContributionProvider<ConnectionServerContribution>;

    @postConstruct()
    protected postConstruct(): void {
        this.contributions.getContributions(); // force-resolve contributions
    }
}
