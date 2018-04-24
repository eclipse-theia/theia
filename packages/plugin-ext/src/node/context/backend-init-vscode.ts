/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { BackendInitializationFn } from '../../common/plugin-protocol';
import { createAPI } from '../../plugin/plugin-context';

export const doInitialization: BackendInitializationFn = (rpc: any) => {
    const module = require('module');
    const vscodeModuleName = 'vscode';
    const theia = createAPI(rpc);

    // add theia into global goal as 'vscode'
    const g = global as any;
    g[vscodeModuleName] = theia;

    // add vscode object as module into npm cache
    require.cache[vscodeModuleName] = {
        id: vscodeModuleName,
        filename: vscodeModuleName,
        loaded: true,
        exports: g[vscodeModuleName]
    };

    // save original resolve method
    const internalResolve = module._resolveFilename;

    // if we try to resolve vscode module, return the filename entry to use cache.
    module._resolveFilename = (request: string, parent: {}) => {
        if (vscodeModuleName === request) {
            return request;
        }
        const retVal = internalResolve(request, parent);
        return retVal;
    };
};
