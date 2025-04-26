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

import { ContributionProvider, Emitter, type Event } from '@theia/core';
import { type FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import debounce = require('@theia/core/shared/lodash.debounce');
import type { ChangeSetDecoration, ChangeSetElement } from '../common';

/**
 * A decorator for a change set element.
 * It allows to add additional information to the element, such as icons.
 */
export const ChangeSetDecorator = Symbol('ChangeSetDecorator');
export interface ChangeSetDecorator {
    readonly id: string;

    readonly onDidChangeDecorations: Event<void>;

    decorate(element: ChangeSetElement): ChangeSetDecoration | undefined;
}

@injectable()
export class ChangeSetDecoratorService implements FrontendApplicationContribution {

    protected readonly onDidChangeDecorationsEmitter = new Emitter<void>();
    readonly onDidChangeDecorations = this.onDidChangeDecorationsEmitter.event;

    @inject(ContributionProvider) @named(ChangeSetDecorator)
    protected readonly contributions: ContributionProvider<ChangeSetDecorator>;

    initialize(): void {
        this.contributions.getContributions().map(decorator => decorator.onDidChangeDecorations(this.fireDidChangeDecorations));
    }

    protected readonly fireDidChangeDecorations = debounce(() => {
        this.onDidChangeDecorationsEmitter.fire(undefined);
    }, 150);

    getDecorations(element: ChangeSetElement): ChangeSetDecoration[] {
        const decorators = this.contributions.getContributions();
        const decorations: ChangeSetDecoration[] = [];
        for (const decorator of decorators) {
            const decoration = decorator.decorate(element);
            if (decoration) {
                decorations.push(decoration);
            }
        }

        decorations.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

        return decorations;
    }

    getAdditionalInfoSuffixIcon(element: ChangeSetElement): string[] | undefined {
        const decorations = this.getDecorations(element);
        return decorations.find(d => d.additionalInfoSuffixIcon)?.additionalInfoSuffixIcon;
    }
}
