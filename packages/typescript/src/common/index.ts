/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { TypescriptVersion } from './typescript-version-service';

export const TYPESCRIPT_LANGUAGE_ID = 'typescript';
export const TYPESCRIPT_LANGUAGE_NAME = 'TypeScript';

export const TYPESCRIPT_REACT_LANGUAGE_ID = 'typescriptreact';
export const TYPESCRIPT_REACT_LANGUAGE_NAME = 'TypeScript React';

export const JAVASCRIPT_LANGUAGE_ID = 'javascript';
export const JAVASCRIPT_LANGUAGE_NAME = 'JavaScript';

export const JAVASCRIPT_REACT_LANGUAGE_ID = 'javascriptreact';
export const JAVASCRIPT_REACT_LANGUAGE_NAME = 'JavaScript React';

export const TS_JS_LANGUAGES = new Set([
    TYPESCRIPT_LANGUAGE_ID,
    TYPESCRIPT_REACT_LANGUAGE_ID,
    JAVASCRIPT_LANGUAGE_ID,
    JAVASCRIPT_REACT_LANGUAGE_ID
]);

export interface TypescriptStartParams {
    version?: TypescriptVersion
}
