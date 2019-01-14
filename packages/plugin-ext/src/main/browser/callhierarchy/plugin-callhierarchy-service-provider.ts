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

import { injectable, postConstruct } from 'inversify';
import { CallHierarchyService, CallHierarchyServiceProvider } from '@theia/callhierarchy/lib/browser';
import { Disposable } from '@theia/core/lib/common/disposable';

/**
 * Plugin Call Hierarchy Service contribution registrator.
 */
export interface PluginCallHierarchyServiceContributionRegistrator {
    /**
     * Registers [CallHierarchyService] contribution.
     * @param service service
     */
    registerCallHierarchyServiceContribution(service: CallHierarchyService): Disposable;

    /**
     * Unregisters [CallHierarchyService] contribution.
     * @param languageId the language ID
     */
    unregisterCallHierarchyServiceContribution(languageId: string): void;
}

@injectable()
export class PluginCallHierarchyServiceProvider extends CallHierarchyServiceProvider implements PluginCallHierarchyServiceContributionRegistrator {
    protected readonly services = new Map<string, CallHierarchyService>();

    @postConstruct()
    protected init(): void {
        for (const contrib of this.contributions.getContributions()) {
            this.services.set(contrib.languageId, contrib);
        }
    }

    get(languageId: string): CallHierarchyService | undefined {
        return this.services.get(languageId);
    }

    registerCallHierarchyServiceContribution(service: CallHierarchyService): Disposable {
        const { languageId } = service;

        if (this.services.has(languageId)) {
            console.warn(`Call Hierarchy Service contribution is already registered for ${languageId}`);
            return Disposable.NULL;
        }

        this.services.set(languageId, service);
        return Disposable.create(() => this.unregisterCallHierarchyServiceContribution(languageId));
    }

    unregisterCallHierarchyServiceContribution(languageId: string): void {
        this.services.delete(languageId);
    }
}
