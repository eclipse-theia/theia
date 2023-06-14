// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { CancellationToken } from '@theia/core';
import { ContributionProvider, Disposable, Emitter, Event } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { DocumentUri, Position } from '@theia/core/shared/vscode-languageserver-protocol';
import { LanguageSelector, score } from '@theia/editor/lib/common/language-selector';
import { TypeHierarchyItem } from './typehierarchy';

export const TypeHierarchyService = Symbol('TypeHierarchyService');

export interface TypeHierarchySession {
    items: TypeHierarchyItem[];
    dispose(): void;
}

export interface TypeHierarchyService {

    readonly selector: LanguageSelector;

    prepareSession(uri: DocumentUri, position: Position, cancellationToken: CancellationToken): Promise<TypeHierarchySession | undefined>
    provideSuperTypes(sessionId: string, itemId: string, cancellationToken: CancellationToken): Promise<TypeHierarchyItem[] | undefined>
    provideSubTypes(sessionId: string, itemId: string, cancellationToken: CancellationToken): Promise<TypeHierarchyItem[] | undefined>
}

@injectable()
export class TypeHierarchyServiceProvider {

    @inject(ContributionProvider) @named(TypeHierarchyService)
    protected readonly contributions: ContributionProvider<TypeHierarchyService>;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    get onDidChange(): Event<void> {
        return this.onDidChangeEmitter.event;
    }

    private services: TypeHierarchyService[] = [];

    @postConstruct()
    init(): void {
        this.services = this.services.concat(this.contributions.getContributions());
    }

    get(languageId: string, uri: URI): TypeHierarchyService | undefined {
        return this.services
            .filter(service => this.score(service, languageId, uri) > 0)
            .sort((left, right) => this.score(right, languageId, uri) - this.score(left, languageId, uri))[0];
    }

    protected score(service: TypeHierarchyService, languageId: string, uri: URI): number {
        return score(service.selector, uri.scheme, uri.path.toString(), languageId, true);
    }

    add(service: TypeHierarchyService): Disposable {
        this.services.push(service);
        const that = this;
        this.onDidChangeEmitter.fire();
        return {
            dispose: () => {
                that.remove(service);
            }
        };
    }

    private remove(service: TypeHierarchyService): boolean {
        const length = this.services.length;
        this.services = this.services.filter(value => value !== service);
        const serviceWasRemoved = length !== this.services.length;
        if (serviceWasRemoved) {
            this.onDidChangeEmitter.fire();
        }
        return serviceWasRemoved;
    }
}
