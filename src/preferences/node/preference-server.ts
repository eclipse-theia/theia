/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify'
import { IPreferenceServer } from '../common/preference-protocol'


/**
 * This class presents an API that composes the json preference service and the
 * default preference service. Services can then use it to get preference values(without having to
 * know if they're coming from the json file or the contribution providers).
 */
@injectable()
export class PreferenceServer implements IPreferenceServer {

    constructor(
        @inject(IPreferenceServer) protected readonly jsonPrefServer: IPreferenceServer,
        @inject(IPreferenceServer) protected readonly defaultPrefServer: IPreferenceServer,
    ) {
    }

    has(preferenceName: string): Promise<boolean> {
        const hasJsonPref = this.jsonPrefServer.has(preferenceName);
        const hasDefaultPref = this.defaultPrefServer.has(preferenceName);

        return Promise.all([hasJsonPref, hasDefaultPref]).then((values) => {
            for (let value of values) {
                if (value) {
                    return Promise.resolve(true);
                }
            }
            return Promise.resolve(false);
        });
    }

    get<T>(preferenceName: string): Promise<T | undefined> {
        const hasJsonPref = this.jsonPrefServer.get(preferenceName);
        const hasDefaultPref = this.defaultPrefServer.get(preferenceName);

        return Promise.all([hasJsonPref, hasDefaultPref]).then((values) => {

            if (values[0] !== undefined) { // The pref in JSON
                return Promise.resolve(values[0]);
            } else if (values[1] !== undefined) { // The default pref
                return Promise.resolve(values[1]);
            }
            return Promise.resolve(undefined); // Pref doesn't exist in JSON nor is contributed to the defaults
        });
    }
}





