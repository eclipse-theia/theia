/*
 * Copyright (C) 2015-2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { createAPI } from '../../../plugin/plugin-context';
import { BackendInitializationFn } from '../../../common/plugin-protocol';

export const doInitialization: BackendInitializationFn = (rpc: any) => {
    const theia = createAPI(rpc);

    // add theia into global goal
    const g = global as any;
    g['theia'] = theia;

    const NODE_MODULE_NAMES = ['@theia/plugin', '@wiptheia/plugin'];
    const module = require('module');

    // add theia object as module into npm cache
    NODE_MODULE_NAMES.forEach(moduleName => {
        require.cache[moduleName] = {
            id: moduleName,
            filename: moduleName,
            loaded: true,
            exports: theia
        };
    });

    // save original resolve method
    const internalResolve = module._resolveFilename;

    // if we try to resolve theia module, return the filename entry to use cache.
    module._resolveFilename = (request: string, parent: {}) => {
        if (NODE_MODULE_NAMES.indexOf(request) !== -1) {
            return request;
        }
        const retVal = internalResolve(request, parent);
        return retVal;
    };
};
