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
import { Position, DocumentUri } from '@theia/core/shared/vscode-languageserver-types';
import { Definition, Caller, Callee } from './callhierarchy';
import { ContributionProvider } from '@theia/core/lib/common';
import { LanguageSelector, score } from '../common/language-selector';
import URI from '@theia/core/lib/common/uri';
import { Disposable } from '@theia/core/lib/common';
import { CancellationToken } from '@theia/core';

export const CallHierarchyService = Symbol('CallHierarchyService');

export interface CallHierarchyService {

    readonly selector: LanguageSelector;

    getRootDefinition(uri: DocumentUri, position: Position, cancellationToken: CancellationToken): Promise<Definition | undefined>
    getCallers(definition: Definition, cancellationToken: CancellationToken): Promise<Caller[] | undefined>
    getCallees?(definition: Definition, cancellationToken: CancellationToken): Promise<Callee[] | undefined>
}

@injectable()
export class CallHierarchyServiceProvider {

    @inject(ContributionProvider) @named(CallHierarchyService)
    protected readonly contributions: ContributionProvider<CallHierarchyService>;

    private services: CallHierarchyService[] = [];

    @postConstruct()
    init(): void {
        this.services = this.services.concat(this.contributions.getContributions());
    }

    get(languageId: string, uri: URI): CallHierarchyService | undefined {

        return this.services.sort(
            (left, right) =>
                score(right.selector, uri.scheme, uri.path.toString(), languageId, true) - score(left.selector, uri.scheme, uri.path.toString(), languageId, true))[0];
    }

    add(service: CallHierarchyService): Disposable {
        this.services.push(service);
        const that = this;
        return {
            dispose: () => {
                that.remove(service);
            }
        };
    }

    private remove(service: CallHierarchyService): boolean {
        const length = this.services.length;
        this.services = this.services.filter(value => value !== service);
        return length !== this.services.length;
    }
}
