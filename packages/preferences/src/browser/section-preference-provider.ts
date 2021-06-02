/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { AbstractResourcePreferenceProvider } from './abstract-resource-preference-provider';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { PreferenceConfigurations } from '@theia/core/lib/browser/preferences/preference-configurations';

export const SectionPreferenceProviderUri = Symbol('SectionPreferenceProviderUri');
export const SectionPreferenceProviderSection = Symbol('SectionPreferenceProviderSection');

/**
 * This class encapsulates the logic of using separate files for some workspace configuration like 'launch.json' or 'tasks.json'.
 * Anything that is not a contributed section will be in the main config file.
 */
@injectable()
export abstract class SectionPreferenceProvider extends AbstractResourcePreferenceProvider {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(SectionPreferenceProviderUri)
    protected readonly uri: URI;
    @inject(SectionPreferenceProviderSection)
    protected readonly section: string;
    @inject(PreferenceConfigurations)
    protected readonly preferenceConfigurations: PreferenceConfigurations;

    private _isSection?: boolean;

    private get isSection(): boolean {
        if (typeof this._isSection === 'undefined') {
            this._isSection = this.preferenceConfigurations.isSectionName(this.section);
        }
        return this._isSection;
    }

    protected getUri(): URI {
        return this.uri;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected parse(content: string): any {
        const prefs = super.parse(content);
        if (this.isSection) {
            if (prefs === undefined) {
                return undefined;
            }
            const result: { [k: string]: unknown } = {

            };
            result[this.section] = { ...prefs };
            return result;
        } else {
            return prefs;
        }
    }

    protected getPath(preferenceName: string): string[] | undefined {
        if (!this.isSection) {
            return super.getPath(preferenceName);
        }
        if (preferenceName === this.section) {
            return [];
        }
        if (preferenceName.startsWith(`${this.section}.`)) {
            return [preferenceName.slice(this.section.length + 1)];
        }
        return undefined;
    }
}
