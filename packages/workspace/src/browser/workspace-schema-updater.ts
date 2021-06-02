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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { JsonSchemaContribution, JsonSchemaRegisterContext } from '@theia/core/lib/browser/json-schema-store';
import { InMemoryResources } from '@theia/core/lib/common';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import URI from '@theia/core/lib/common/uri';
import { Deferred } from '@theia/core/lib/common/promise-util';

export interface SchemaUpdateMessage {
    key: string,
    schema?: IJSONSchema,
    deferred: Deferred<boolean>;
}

export namespace AddKeyMessage {
    export const is = (message: SchemaUpdateMessage | undefined): message is Required<SchemaUpdateMessage> => !!message && message.schema !== undefined;
}

@injectable()
export class WorkspaceSchemaUpdater implements JsonSchemaContribution {

    protected readonly uri = new URI(workspaceSchemaId);
    protected readonly editQueue: SchemaUpdateMessage[] = [];
    protected safeToHandleQueue = new Deferred();

    @inject(InMemoryResources) protected readonly inmemoryResources: InMemoryResources;

    @postConstruct()
    protected init(): void {
        this.inmemoryResources.add(this.uri, JSON.stringify(workspaceSchema));
        this.safeToHandleQueue.resolve();
    }

    registerSchemas(context: JsonSchemaRegisterContext): void {
        context.registerSchema({
            fileMatch: ['*.theia-workspace', '*.code-workspace'],
            url: this.uri.toString()
        });
    }

    protected async retrieveCurrent(): Promise<WorkspaceSchema> {
        const current = await this.inmemoryResources.resolve(this.uri).readContents();

        const content = JSON.parse(current);

        if (!WorkspaceSchema.is(content)) {
            throw new Error('Failed to retrieve current workspace schema.');
        }

        return content;
    }

    async updateSchema(message: Omit<SchemaUpdateMessage, 'deferred'>): Promise<boolean> {
        const doHandle = this.editQueue.length === 0;
        const deferred = new Deferred<boolean>();
        this.editQueue.push({ ...message, deferred });
        if (doHandle) {
            this.handleQueue();
        }
        return deferred.promise;
    }

    protected async handleQueue(): Promise<void> {
        await this.safeToHandleQueue.promise;
        this.safeToHandleQueue = new Deferred();
        const cache = await this.retrieveCurrent();
        while (this.editQueue.length) {
            const nextMessage = this.editQueue.shift();
            if (AddKeyMessage.is(nextMessage)) {
                this.addKey(nextMessage, cache);
            } else if (nextMessage) {
                this.removeKey(nextMessage, cache);
            }
        }
        this.inmemoryResources.update(this.uri, JSON.stringify(cache));
        this.safeToHandleQueue.resolve();
    }

    protected addKey({ key, schema, deferred }: Required<SchemaUpdateMessage>, cache: WorkspaceSchema): void {
        if (key in cache.properties) {
            return deferred.resolve(false);
        }

        cache.properties[key] = schema;
        deferred.resolve(true);
    }

    protected removeKey({ key, deferred }: SchemaUpdateMessage, cache: WorkspaceSchema): void {
        const canDelete = !cache.required.includes(key);
        if (!canDelete) {
            return deferred.resolve(false);
        }

        const keyPresent = delete cache.properties[key];
        deferred.resolve(keyPresent);
    }
}

export type WorkspaceSchema = Required<Pick<IJSONSchema, 'properties' | 'required'>>;

export namespace WorkspaceSchema {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export const is = (candidate: any): candidate is WorkspaceSchema => !!candidate
        && typeof candidate === 'object'
        && 'properties' in candidate
        && typeof candidate.properties === 'object'
        && 'required' in candidate
        && Array.isArray(candidate.required);
}

export const workspaceSchemaId = 'vscode://schemas/workspace';
export const workspaceSchema: IJSONSchema = {
    $id: workspaceSchemaId,
    type: 'object',
    title: 'Workspace File',
    required: ['folders'],
    default: { folders: [{ path: '' }], settings: {} },
    properties: {
        folders: {
            description: 'Root folders in the workspace',
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                    }
                },
                required: ['path']
            }
        }
    },
};
