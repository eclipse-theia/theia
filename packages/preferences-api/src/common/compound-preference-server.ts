/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { PreferenceServer, PreferenceClient } from './preference-protocol'

export class CompoundPreferenceServer implements PreferenceServer {

    protected readonly servers: PreferenceServer[];
    constructor(
        ...servers: PreferenceServer[]
    ) {
        this.servers = servers;
    }

    dispose(): void {
        for (const server of this.servers) {
            server.dispose();
        }
    }

    async has(preferenceName: string): Promise<boolean> {
        for (const server of this.servers) {
            if (await server.has(preferenceName)) {
                return true;
            }
        }
        return false;
    }

    async get<T>(preferenceName: string): Promise<T | undefined> {
        for (const server of this.servers) {
            const result = await server.get<T>(preferenceName);
            if (result !== undefined) {
                return result;
            }
        }
        return undefined;
    }

    setClient(client: PreferenceClient | undefined) {
        for (const server of this.servers) {
            server.setClient(client);
        }
    }
}