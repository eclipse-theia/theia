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
        return this.jsonPrefServer.has(preferenceName).then((prefExists) => {
            if (prefExists) {
                return Promise.resolve(true);
            } else {
                return this.defaultPrefServer.has(preferenceName);
            }
        });
    }

    get<T>(preferenceName: string): Promise<T | undefined> {
        return this.jsonPrefServer.get<T>(preferenceName).then((pref) => {
            if (pref) {
                return Promise.resolve(pref);
            } else {
                return this.defaultPrefServer.get<T>(preferenceName);
            }
        });
    }
}





