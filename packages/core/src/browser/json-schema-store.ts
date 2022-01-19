// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, named } from 'inversify';
import { ContributionProvider } from '../common/contribution-provider';
import { FrontendApplicationContribution } from './frontend-application';
import { MaybePromise } from '../common';
import { Endpoint } from './endpoint';
import { timeout, Deferred } from '../common/promise-util';
import { RequestContext, RequestService } from '@theia/request-service';

export interface JsonSchemaConfiguration {
    fileMatch: string | string[];
    url: string;
}

export interface JsonSchemaRegisterContext {
    registerSchema(config: JsonSchemaConfiguration): void;
}

export const JsonSchemaContribution = Symbol('JsonSchemaContribution');
export interface JsonSchemaContribution {
    registerSchemas(store: JsonSchemaRegisterContext): MaybePromise<void>
}

@injectable()
export class JsonSchemaStore implements FrontendApplicationContribution {

    @inject(ContributionProvider) @named(JsonSchemaContribution)
    protected readonly contributions: ContributionProvider<JsonSchemaContribution>;

    protected readonly _schemas = new Deferred<JsonSchemaConfiguration[]>();
    get schemas(): Promise<JsonSchemaConfiguration[]> {
        return this._schemas.promise;
    }

    onStart(): void {
        const pendingRegistrations = [];
        const schemas: JsonSchemaConfiguration[] = [];
        const freeze = () => {
            Object.freeze(schemas);
            this._schemas.resolve(schemas);
        };
        const registerTimeout = this.getRegisterTimeout();
        const frozenErrorCode = 'JsonSchemaRegisterContext.frozen';
        const context: JsonSchemaRegisterContext = {
            registerSchema: schema => {
                if (Object.isFrozen(schemas)) {
                    throw new Error(frozenErrorCode);
                }
                schemas.push(schema);
            }
        };
        for (const contribution of this.contributions.getContributions()) {
            const result = contribution.registerSchemas(context);
            if (result) {
                pendingRegistrations.push(result.then(() => { }, e => {
                    if (e instanceof Error && e.message === frozenErrorCode) {
                        console.error(`${contribution.constructor.name}.registerSchemas is taking more than ${registerTimeout.toFixed(1)} ms, new schemas are ignored.`);
                    } else {
                        console.error(e);
                    }
                }));
            }
        }
        if (pendingRegistrations.length) {
            let pending = Promise.all(pendingRegistrations).then(() => { });
            if (registerTimeout) {
                pending = Promise.race([pending, timeout(registerTimeout)]);
            }
            pending.then(freeze);
        } else {
            freeze();
        }
    }

    protected getRegisterTimeout(): number {
        return 500;
    }

}

@injectable()
export class DefaultJsonSchemaContribution implements JsonSchemaContribution {

    @inject(RequestService)
    protected readonly requestService: RequestService;

    async registerSchemas(context: JsonSchemaRegisterContext): Promise<void> {
        const url = `${new Endpoint().httpScheme}//schemastore.azurewebsites.net/api/json/catalog.json`;
        const response = await this.requestService.request({ url });
        const schemas = RequestContext.asJson<{ schemas: DefaultJsonSchemaContribution.SchemaData[] }>(response).schemas;
        for (const s of schemas) {
            if (s.fileMatch) {
                context.registerSchema({
                    fileMatch: s.fileMatch,
                    url: s.url
                });
            }
        }
    }

}
export namespace DefaultJsonSchemaContribution {
    export interface SchemaData {
        name: string;
        description: string;
        fileMatch?: string[];
        url: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: any;
    }
}

