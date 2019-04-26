/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { injectable } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { AbstractResourcePreferenceProvider } from './abstract-resource-preference-provider';
import { UserStorageUri } from '@theia/userstorage/lib/browser';
import { PreferenceScope } from '@theia/core/lib/browser';

export const USER_PREFERENCE_URI = new URI().withScheme(UserStorageUri.SCHEME).withPath('settings.json');
@injectable()
export class UserPreferenceProvider extends AbstractResourcePreferenceProvider {

    protected getUri(): URI {
        return USER_PREFERENCE_URI;
    }

    protected getScope() {
        return PreferenceScope.User;
    }
}
