// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { PreferenceScope } from '@theia/core/lib/browser';
import { SectionPreferenceProvider } from './section-preference-provider';

export const UserPreferenceProviderFactory = Symbol('UserPreferenceProviderFactory');
export interface UserPreferenceProviderFactory {
    (uri: URI, section: string): UserPreferenceProvider;
};

/**
 * A @SectionPreferenceProvider that targets the user-level settings
 */
@injectable()
export class UserPreferenceProvider extends SectionPreferenceProvider {
    getScope(): PreferenceScope {
        return PreferenceScope.User;
    }
}
