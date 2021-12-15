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

import { injectable, inject, named, postConstruct } from '@theia/core/shared/inversify';
import { Position, DocumentUri } from '@theia/core/shared/vscode-languageserver-protocol';
import { CancellationToken } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { ContributionProvider, Disposable, Emitter, Event } from '@theia/core/lib/common';
import { Definition, Caller, Callee } from './callhierarchy';
import { LanguageSelector, score } from '../common/language-selector';

export const CallHierarchyService = Symbol('CallHierarchyService');

export interface CallHierarchyService {

    readonly selector: LanguageSelector;

    getRootDefinition(uri: DocumentUri, position: Position, cancellationToken: CancellationToken): Promise<Definition | Definition[] | undefined>
    getCallers(definition: Definition, cancellationToken: CancellationToken): Promise<Caller[] | undefined>
    getCallees?(definition: Definition, cancellationToken: CancellationToken): Promise<Callee[] | undefined>
}

@injectable()
export class CallHierarchyServiceProvider {

    @inject(ContributionProvider) @named(CallHierarchyService)
    protected readonly contributions: ContributionProvider<CallHierarchyService>;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    get onDidChange(): Event<void> {
        return this.onDidChangeEmitter.event;
    }

    private services: CallHierarchyService[] = [];

    @postConstruct()
    init(): void {
        this.services = this.services.concat(this.contributions.getContributions());
    }

    get(languageId: string, uri: URI): CallHierarchyService | undefined {
        return this.services
            .filter(service => this.score(service, languageId, uri) > 0)
            .sort((left, right) => this.score(right, languageId, uri) - this.score(left, languageId, uri))[0];
    }

    protected score(service: CallHierarchyService, languageId: string, uri: URI): number {
        return score(service.selector, uri.scheme, uri.path.toString(), languageId, true);
    }

    add(service: CallHierarchyService): Disposable {
        this.services.push(service);
        const that = this;
        this.onDidChangeEmitter.fire();
        return {
            dispose: () => {
                that.remove(service);
            }
        };
    }

    private remove(service: CallHierarchyService): boolean {
        const length = this.services.length;
        this.services = this.services.filter(value => value !== service);
        const serviceWasRemoved = length !== this.services.length;
        if (serviceWasRemoved) {
            this.onDidChangeEmitter.fire();
        }
        return serviceWasRemoved;
    }
}
