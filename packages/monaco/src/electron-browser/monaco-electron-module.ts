/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { loadVsRequire, loadMonaco } from "../browser/monaco-loader";

export { ContainerModule };

const s = <any>self;

export default loadVsRequire(global)
    .then(vsRequire => {
        // workaround monaco-css not understanding the environment
        s.module = undefined;
        // workaround monaco-typescript not understanding the environment
        s.process.browser = true;
        return loadMonaco(vsRequire)
    })
    .then(() => import('../browser/monaco-frontend-module'))
    .then(module => module.default);