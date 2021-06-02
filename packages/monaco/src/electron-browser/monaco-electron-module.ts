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

import * as path from 'path';
import { ContainerModule } from '@theia/core/shared/inversify';
import { loadVsRequire, loadMonaco } from '../browser/monaco-loader';

export { ContainerModule };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const s = <any>self;

/**
 * We cannot use `FileUri#create` because URIs with file scheme cannot be properly decoded via the AMD loader.
 * So if you have a FS path on Windows: `C:\Users\foo`, then you will get a URI `file:///c%3A/Users/foo` which
 * will be converted into the `c%3A/Users/foo` FS path on Windows by the AMD loader.
 */
const uriFromPath = (filePath: string) => {
    let pathName = path.resolve(filePath).replace(/\\/g, '/');
    if (pathName.length > 0 && pathName.charAt(0) !== '/') {
        pathName = '/' + pathName;
    }
    return encodeURI('file://' + pathName);
};

export default loadVsRequire(global)
    .then(vsRequire => {
        const baseUrl = uriFromPath(__dirname);
        vsRequire.config({ baseUrl });

        // workaround monaco-css not understanding the environment
        s.module = undefined;
        // workaround monaco-typescript not understanding the environment
        s.process.browser = true;
        return loadMonaco(vsRequire);
    })
    .then(() => import('../browser/monaco-frontend-module'))
    .then(module => module.default);
