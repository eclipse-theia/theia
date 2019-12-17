/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject, named, interfaces } from 'inversify';
import URI from '../../common/uri';
import { ContributionProvider, bindContributionProvider } from '../../common/contribution-provider';

export const PreferenceConfiguration = Symbol('PreferenceConfiguration');
export interface PreferenceConfiguration {
    name: string;
}

export function bindPreferenceConfigurations(bind: interfaces.Bind): void {
    bindContributionProvider(bind, PreferenceConfiguration);
    bind(PreferenceConfigurations).toSelf().inSingletonScope();
}

@injectable()
export class PreferenceConfigurations {

    @inject(ContributionProvider) @named(PreferenceConfiguration)
    protected readonly provider: ContributionProvider<PreferenceConfiguration>;

    /* prefer Theia over VS Code by default */
    async getPaths(): Promise<string[]> {
        return ['.theia', '.vscode'];
    }

    getConfigName(): string {
        return 'settings';
    }

    protected sectionNames: string[] | undefined;
    getSectionNames(): string[] {
        if (!this.sectionNames) {
            this.sectionNames = this.provider.getContributions().map(p => p.name);
        }
        return this.sectionNames;
    }

    isSectionName(name: string): boolean {
        return this.getSectionNames().indexOf(name) !== -1;
    }

    isSectionUri(configUri: URI | undefined): boolean {
        return !!configUri && this.isSectionName(this.getName(configUri));
    }

    isConfigUri(configUri: URI | undefined): boolean {
        return !!configUri && this.getName(configUri) === this.getConfigName();
    }

    getName(configUri: URI): string {
        return configUri.path.name;
    }

    getPath(configUri: URI): string {
        return configUri.parent.path.base;
    }

    async createUri(folder: URI, configPath: string, configName: string = this.getConfigName()): Promise<URI> {
        if (!configPath) {
            configPath = (await this.getPaths())[0];
        }
        return folder.resolve(configPath).resolve(configName + '.json');
    }

}
