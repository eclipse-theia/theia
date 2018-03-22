/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as express from 'express';
import { injectable } from 'inversify';
import { BackendApplicationContribution } from './backend-application';

@injectable()
export class BackendConnectionStatusEndpoint implements BackendApplicationContribution {

    configure(app: express.Application): void {
        app.get('/alive', (request, response) => {
            response.contentType('application/json');
            return response.send();
        });
    }

}
