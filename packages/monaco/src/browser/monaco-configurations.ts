/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

// tslint:disable:no-any

import { injectable, inject, postConstruct } from 'inversify';
import { JSONValue } from '@phosphor/coreutils';
import { Configurations, ConfigurationChangeEvent, WorkspaceConfiguration } from 'monaco-languageclient';
import { Event, Emitter } from '@theia/core/lib/common';
import { PreferenceService, PreferenceChanges, PreferenceSchemaProvider, createPreferenceProxy } from '@theia/core/lib/browser';

export interface MonacoConfigurationChangeEvent extends ConfigurationChangeEvent {
    affectedSections?: string[]
}

@injectable()
export class MonacoConfigurations implements Configurations {

    protected readonly onDidChangeConfigurationEmitter = new Emitter<MonacoConfigurationChangeEvent>();
    readonly onDidChangeConfiguration: Event<MonacoConfigurationChangeEvent> = this.onDidChangeConfigurationEmitter.event;

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    @inject(PreferenceSchemaProvider)
    protected readonly preferenceSchemaProvider: PreferenceSchemaProvider;

    @postConstruct()
    protected init(): void {
        this.reconcileData();
        this.preferences.onPreferencesChanged(changes => this.reconcileData(changes));
    }

    protected reconcileData(changes?: PreferenceChanges): void {
        this.onDidChangeConfigurationEmitter.fire({
            affectedSections: MonacoConfigurations.parseSections(changes),
            affectsConfiguration: section => this.affectsConfiguration(section, changes)
        });
    }

    protected affectsConfiguration(section: string, changes?: PreferenceChanges): boolean {
        if (!changes) {
            return true;
        }
        for (const preferenceName in changes) {
            if (section.startsWith(preferenceName) || preferenceName.startsWith(section)) {
                return true;
            }
        }
        return false;
    }

    getConfiguration(section?: string, resource?: string): WorkspaceConfiguration {
        return new MonacoWorkspaceConfiguration(this.preferences, this.preferenceSchemaProvider, section, resource);
    }

}

export namespace MonacoConfigurations {
    export function parseSections(changes?: PreferenceChanges): string[] | undefined {
        if (!changes) {
            return undefined;
        }
        const sections = [];
        for (let key of Object.keys(changes)) {
            const hasOverride = key.startsWith('[');
            while (key) {
                sections.push(key);
                if (hasOverride && key.indexOf('.') !== -1) {
                    sections.push(key.substr(key.indexOf('.')));
                }
                const index = key.lastIndexOf('.');
                key = key.substring(0, index);
            }
        }
        return sections;
    }
}

export class MonacoWorkspaceConfiguration implements WorkspaceConfiguration {

    constructor(
        protected readonly preferences: PreferenceService,
        protected readonly preferenceSchemaProvider: PreferenceSchemaProvider,
        protected readonly section?: string,
        protected readonly resource?: string
    ) {
    }

    readonly [key: string]: any;

    protected getSection(section: string): string {
        if (this.section) {
            return this.section + '.' + section;
        }
        return section;
    }

    has(section: string): boolean {
        return this.preferences.inspect(this.getSection(section), this.resource) !== undefined;
    }

    get<T>(section: string, defaultValue?: T): T | undefined {
        return this.preferences.get(this.getSection(section), defaultValue, this.resource);
    }

    toJSON(): JSONValue | undefined {
        const proxy = createPreferenceProxy<{ [key: string]: any }>(this.preferences, this.preferenceSchemaProvider.getCombinedSchema(), {
            resourceUri: this.resource,
            style: 'deep'
        });
        if (this.section) {
            return proxy[this.section];
        }
        return proxy;
    }

}
