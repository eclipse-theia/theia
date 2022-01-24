/********************************************************************************
 * Copyright (C) 2022 Ericsson and others.
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

import { inject, injectable, postConstruct } from 'inversify';
import { PreferenceSchema } from '../../common/preferences/preference-schema';
import { Disposable, DisposableCollection, Emitter, Event, MaybePromise } from '../../common';
import { PreferenceChangeEvent, PreferenceEventEmitter, PreferenceProxyOptions, PreferenceRetrieval } from './preference-proxy';
import { PreferenceChange, PreferenceScope, PreferenceService } from './preference-service';
import { OverridePreferenceName, PreferenceProxy } from '.';
import { JSONValue } from '@phosphor/coreutils';

export const PreferenceProxySchema = Symbol('PreferenceProxySchema');
export interface PreferenceProxyFactory {
    <T>(schema: MaybePromise<PreferenceSchema>, options?: PreferenceProxyOptions): PreferenceProxy<T>;
}
export const PreferenceProxyFactory = Symbol('PreferenceProxyFactory');

@injectable()
export class InjectablePreferenceProxy<T extends object> implements
    ProxyHandler<T>, ProxyHandler<Disposable>, ProxyHandler<PreferenceEventEmitter<T>>, ProxyHandler<PreferenceRetrieval<T>> {

    @inject(PreferenceProxyOptions) protected readonly options: PreferenceProxyOptions;
    @inject(PreferenceService) protected readonly preferences: PreferenceService;
    @inject(PreferenceProxySchema) protected readonly promisedSchema: PreferenceSchema | Promise<PreferenceSchema>;
    @inject(PreferenceProxyFactory) protected readonly factory: PreferenceProxyFactory;
    protected toDispose = new DisposableCollection();
    protected _onPreferenceChangedEmitter: Emitter<PreferenceChangeEvent<T>> | undefined;
    protected schema: PreferenceSchema | undefined;

    protected get prefix(): string {
        return this.options.prefix ?? '';
    }

    protected get style(): Required<PreferenceProxyOptions>['style'] {
        return this.options.style ?? 'flat';
    }

    protected get resourceUri(): PreferenceProxyOptions['resourceUri'] {
        return this.options.resourceUri;
    }

    protected get overrideIdentifier(): PreferenceProxyOptions['overrideIdentifier'] {
        return this.options.overrideIdentifier;
    }

    protected get isDeep(): boolean {
        const { style } = this;
        return style === 'deep' || style === 'both';
    }

    protected get isFlat(): boolean {
        const { style } = this;
        return style === 'flat' || style === 'both';
    }

    protected get onPreferenceChangedEmitter(): Emitter<PreferenceChangeEvent<T>> {
        if (!this._onPreferenceChangedEmitter) {
            this._onPreferenceChangedEmitter = new Emitter();
            this.subscribeToChangeEvents();
            this.toDispose.push(this._onPreferenceChangedEmitter);
        }
        return this._onPreferenceChangedEmitter;
    }

    get onPreferenceChanged(): Event<PreferenceChangeEvent<T>> {
        return this.onPreferenceChangedEmitter.event;
    }

    @postConstruct()
    protected init(): void {
        if (this.promisedSchema instanceof Promise) {
            this.promisedSchema.then(schema => this.schema = schema);
        } else {
            this.schema = this.promisedSchema;
        }
    }

    get(target: unknown, property: string, receiver: unknown): unknown {
        if (typeof property !== 'string') { throw new Error(`Unexpected property: ${String(property)}`); }
        const preferenceName = this.prefix + property;
        if (this.schema && (this.isFlat || !property.includes('.')) && this.schema.properties[preferenceName]) {
            let value;
            if (this.overrideIdentifier) {
                value = this.preferences.get(this.preferences.overridePreferenceName({
                    overrideIdentifier: this.overrideIdentifier,
                    preferenceName,
                }), undefined, this.resourceUri);
            }
            return value ?? this.preferences.get(preferenceName, undefined, this.resourceUri);
        }
        switch (property) {
            case 'onPreferenceChanged':
                return this.onPreferenceChanged;
            case 'dispose':
                return this.dispose;
            case 'ready':
                return Promise.all([this.preferences.ready, this.promisedSchema]).then(() => undefined);
            case 'get':
                return this.getValue;
            case 'toJSON':
                return this.toJSON.bind(this);
            case 'ownKeys':
                return this.ownKeys;
        }
        if (this.schema && this.isDeep) {
            const prefix = `${preferenceName}.`;
            if (Object.keys(this.schema.properties).some(key => key.startsWith(prefix))) {
                const { style, resourceUri, overrideIdentifier } = this;
                return this.factory(this.schema, { prefix, resourceUri, style, overrideIdentifier });
            }
            let value: any; // eslint-disable-line @typescript-eslint/no-explicit-any
            let parentSegment = preferenceName;
            const segments = [];
            do {
                const index = parentSegment.lastIndexOf('.');
                segments.push(parentSegment.substring(index + 1));
                parentSegment = parentSegment.substring(0, index);
                if (parentSegment in this.schema.properties) {
                    value = this.get(target, parentSegment, receiver);
                }
            } while (parentSegment && value === undefined);

            let segment;
            while (typeof value === 'object' && (segment = segments.pop())) {
                value = value[segment];
            }
            return segments.length ? undefined : value;
        }
    }

    set(target: unknown, property: string, value: unknown, receiver: unknown): boolean {
        if (typeof property !== 'string') {
            throw new Error(`Unexpected property: ${String(property)}`);
        }
        const { style, schema, prefix, resourceUri, overrideIdentifier } = this;
        if (style === 'deep' && property.indexOf('.') !== -1) {
            return false;
        }
        if (schema) {
            const fullProperty = prefix ? prefix + property : property;
            if (schema.properties[fullProperty]) {
                this.preferences.set(fullProperty, value, PreferenceScope.Default);
                return true;
            }
            const newPrefix = fullProperty + '.';
            for (const p of Object.keys(schema.properties)) {
                if (p.startsWith(newPrefix)) {
                    const subProxy = this.factory<T>(schema, {
                        prefix: newPrefix,
                        resourceUri,
                        overrideIdentifier,
                        style
                    }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
                    const valueAsContainer = value as T;
                    for (const k of Object.keys(valueAsContainer)) {
                        subProxy[k as keyof T] = valueAsContainer[k as keyof T];
                    }
                }
            }
        }
        return false;
    }

    ownKeys(): string[] {
        const properties = [];
        if (this.schema) {
            const { isDeep, isFlat, prefix } = this;
            for (const property of Object.keys(this.schema.properties)) {
                if (property.startsWith(prefix)) {
                    const idx = property.indexOf('.', prefix.length);
                    if (idx !== -1 && isDeep) {
                        const pre = property.substring(prefix.length, idx);
                        if (properties.indexOf(pre) === -1) {
                            properties.push(pre);
                        }
                    }
                    const prop = property.substring(prefix.length);
                    if (isFlat || prop.indexOf('.') === -1) {
                        properties.push(prop);
                    }
                }
            }
        }
        return properties;
    }

    getOwnPropertyDescriptor(target: unknown, property: string): PropertyDescriptor {
        if (this.ownKeys().includes(property)) {
            return {
                enumerable: true,
                configurable: true
            };
        }
        return {};
    }

    deleteProperty(): never {
        throw new Error('Unsupported operation');
    }

    defineProperty(): never {
        throw new Error('Unsupported operation');
    }

    toJSON(): JSONValue {
        const result: JSONValue = {};
        for (const key of this.ownKeys()) {
            result[key] = this.get(undefined, key, undefined) as JSONValue;
        }
        return result;
    };

    protected subscribeToChangeEvents(): void {
        this.toDispose.push(this.preferences.onPreferencesChanged(changes => {
            if (this.schema) {
                for (const change of Object.values(changes)) {
                    const overrideInfo = this.preferences.overriddenPreferenceName(change.preferenceName);
                    if (this.isRelevantChange(change, overrideInfo)) {
                        this.fireChangeEvent(change, overrideInfo);
                    }
                }
            }
        }));
    }

    protected isRelevantChange(change: PreferenceChange, overrideInfo?: OverridePreferenceName): boolean {
        const preferenceName = overrideInfo?.preferenceName ?? change.preferenceName;
        return preferenceName.startsWith(this.prefix)
            && (!overrideInfo || !this.overrideIdentifier || overrideInfo.overrideIdentifier === this.overrideIdentifier)
            && Boolean(this.schema?.properties[preferenceName]);
    }

    protected fireChangeEvent(change: PreferenceChange, overrideInfo?: OverridePreferenceName): void {
        const preferenceName = (overrideInfo?.preferenceName ?? change.preferenceName) as keyof T;
        const { newValue, oldValue } = change;
        this.onPreferenceChangedEmitter.fire({
            newValue, oldValue, preferenceName,
            affects: (resourceUri, overrideIdentifier) => {
                if (overrideIdentifier !== undefined && overrideInfo !== undefined && overrideIdentifier !== overrideInfo.overrideIdentifier) {
                    return false;
                }
                return change.affects(resourceUri);
            }
        });
    }

    protected getValue<K extends keyof T>(preferenceIdentifier: K | OverridePreferenceName & { preferenceName: K }, defaultValue: T[K], resourceUri?: string): T[K] {
        const preferenceName = OverridePreferenceName.is(preferenceIdentifier) ? this.preferences.overridePreferenceName(preferenceIdentifier) : preferenceIdentifier as string;
        return this.preferences.get(preferenceName, defaultValue, resourceUri ?? this.resourceUri);
    }

    dispose(): void {
        if (this.options.isDisposable) {
            this.toDispose.dispose();
        }
    }
}
