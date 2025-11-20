// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { ContributionProvider, MaybePromise, URI } from '@theia/core';
import { ChangeSetElement } from './change-set';
import { SerializableChangeSetElement } from './chat-model-serialization';

export const ChangeSetElementDeserializer = Symbol('ChangeSetElementDeserializer');

export interface ChangeSetElementDeserializer<T = unknown> {
    readonly kind: string;
    deserialize(serialized: SerializableChangeSetElement, context: ChangeSetDeserializationContext): ChangeSetElement | Promise<ChangeSetElement>;
}

export interface ChangeSetDeserializationContext {
    chatSessionId: string;
    requestId: string;
}

export interface ChangeSetElementDeserializerContribution {
    registerDeserializers(registry: ChangeSetElementDeserializerRegistry): void;
}
export const ChangeSetElementDeserializerContribution = Symbol('ChangeSetElementDeserializerContribution');
export interface ChangeSetElementDeserializerRegistry {
    register(deserializer: ChangeSetElementDeserializer): void;
    deserialize(serialized: SerializableChangeSetElement, context: ChangeSetDeserializationContext): MaybePromise<ChangeSetElement>;
}
export const ChangeSetElementDeserializerRegistry = Symbol('ChangeSetElementDeserializerRegistry');

@injectable()
export class ChangeSetElementDeserializerRegistryImpl implements ChangeSetElementDeserializerRegistry {
    protected deserializers = new Map<string, ChangeSetElementDeserializer>();

    @inject(ContributionProvider) @named(ChangeSetElementDeserializerContribution)
    protected readonly changeSetElementDeserializerContributions: ContributionProvider<ChangeSetElementDeserializerContribution>;

    @postConstruct() init(): void {
        for (const contribution of this.changeSetElementDeserializerContributions.getContributions()) {
            contribution.registerDeserializers(this);
        }
    }

    register(deserializer: ChangeSetElementDeserializer): void {
        this.deserializers.set(deserializer.kind, deserializer);
    }

    deserialize(serialized: SerializableChangeSetElement, context: ChangeSetDeserializationContext): MaybePromise<ChangeSetElement> {
        const deserializer = this.deserializers.get(serialized.kind || 'generic');
        if (!deserializer) {
            return this.createFallbackElement(serialized);
        }
        return deserializer.deserialize(serialized, context);
    }

    private createFallbackElement(serialized: SerializableChangeSetElement): ChangeSetElement {
        return {
            uri: new URI(serialized.uri),
            name: serialized.name,
            icon: serialized.icon,
            additionalInfo: serialized.additionalInfo,
            state: serialized.state,
            type: serialized.type,
            data: serialized.data,
            toSerializable: (): SerializableChangeSetElement => ({
                kind: serialized.kind || 'generic',
                uri: serialized.uri,
                name: serialized.name,
                icon: serialized.icon,
                additionalInfo: serialized.additionalInfo,
                state: serialized.state,
                type: serialized.type,
                data: serialized.data
            })
        };
    }
}
