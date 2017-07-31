/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { PreferenceServer, PreferenceClient, PreferenceChangedEvent } from './preference-protocol';

export class CompoundPreferenceServer implements PreferenceServer {

    protected readonly servers: PreferenceServer[];
    protected client: PreferenceClient | undefined;

    constructor(
        ...servers: PreferenceServer[],
    ) {
        this.servers = servers;
        for (const server of servers) {
            server.setClient({
                onDidChangePreference: event => this.onDidChangePreference(event)
            });
        }
    }

    // TODO scope management should happen here
    protected onDidChangePreference(event: PreferenceChangedEvent): void {

        // TODO only fire when all pref servers are ready (scope management)
        if (this.client) {
            this.client.onDidChangePreference(event);
        }

    }

    dispose(): void {
        for (const server of this.servers) {
            server.dispose();
        }
    }

    setClient(client: PreferenceClient | undefined) {
        this.client = client;
    }
}