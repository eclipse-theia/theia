/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { Disposable } from '@theia/core/lib/common/disposable';
import { LanguageClientContribution } from '@theia/languages/lib/browser';

export const LanguageClientContributionProvider = Symbol('LanguageClientContributionProvider');
/**
 * The provider for language client contributions.
 * Allows to get all contributions which were registered dynamically and via injection.
 */
export interface LanguageClientContributionProvider {
    /**
     * Returns all registered client contributions.
     */
    getLanguageClientContributions(): IterableIterator<LanguageClientContribution>

    /**
     * Registers new language contribution.
     *
     * @param clientContribution new language client contribution
     */
    registerLanguageClientContribution(clientContribution: LanguageClientContribution): Disposable

    /**
     * Removes language client contribution from the registry.
     *
     * @param id language server's id
     */
    unregisterLanguageClientContribution(id: string): void
}
