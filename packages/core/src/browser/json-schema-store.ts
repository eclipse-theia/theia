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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, named } from 'inversify';
import { ContributionProvider } from '../common/contribution-provider';
import { FrontendApplicationContribution } from './frontend-application-contribution';
import { Emitter, MaybePromise, URI } from '../common';
import { timeout, Deferred } from '../common/promise-util';
import { IJSONSchema } from '../common/json-schema';

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
export class JsonSchemaDataStore {

    protected readonly _schemas = new Map<string, string>();

    protected readonly onDidSchemaUpdateEmitter = new Emitter<URI>();
    readonly onDidSchemaUpdate = this.onDidSchemaUpdateEmitter.event;

    hasSchema(uri: URI): boolean {
        return this._schemas.has(uri.toString());
    }

    getSchema(uri: URI): string | undefined {
        return this._schemas.get(uri.toString());
    }

    setSchema(uri: URI, schema: IJSONSchema | string): void {
        this._schemas.set(uri.toString(), typeof schema === 'string' ? schema : JSON.stringify(schema));
        this.notifySchemaUpdate(uri);
    }

    deleteSchema(uri: URI): void {
        if (this._schemas.delete(uri.toString())) {
            this.notifySchemaUpdate(uri);
        }
    }

    notifySchemaUpdate(uri: URI): void {
        this.onDidSchemaUpdateEmitter.fire(uri);
    }

}

@injectable()
export class DefaultJsonSchemaContribution implements JsonSchemaContribution {

    private static excludedSchemaUrls = [
        'https://www.schemastore.org/task.json'
    ];

    async registerSchemas(context: JsonSchemaRegisterContext): Promise<void> {
        const catalog = require('./catalog.json') as { schemas: DefaultJsonSchemaContribution.SchemaData[] };
        for (const s of catalog.schemas) {
            if (s.fileMatch && this.shouldRegisterSchema(s)) {
                context.registerSchema({
                    fileMatch: s.fileMatch,
                    url: s.url
                });
            }
        }
    }

    protected shouldRegisterSchema(s: DefaultJsonSchemaContribution.SchemaData): boolean {
        return !DefaultJsonSchemaContribution.excludedSchemaUrls.includes(s.url);
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
