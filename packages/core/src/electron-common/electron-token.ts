// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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

import { interfaces } from 'inversify';
import { Extends, Proxyable, ProxyId } from '../common';

/**
 * This token is unique to the current running instance. It is used by the backend
 * to make sure it is an electron browser window that is connecting to its services.
 *
 * The identifier is a string, which makes it usable as a key for cookies, environments, etc.
 */
// Note that it needs to be uppercase for it to work properly in Windows environments.
export const ElectronSecurityToken = 'THEIA_ELECTRON_TOKEN' as string & interfaces.Abstract<ElectronSecurityToken>;
export interface ElectronSecurityToken {
    value: string;
};

export const ElectronSecurityTokenService = ProxyId<ElectronSecurityTokenService>('ElectronSecurityTokenService');
export type ElectronSecurityTokenService = Extends<$ElectronSecurityTokenService, Proxyable<$ElectronSecurityTokenService>>;
interface $ElectronSecurityTokenService {
    getSecurityTokenSync(): ElectronSecurityToken;
    attachSecurityToken(endpoint: string): Promise<void>;
}
