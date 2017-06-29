/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { loadMonaco } from "../browser/monaco-loader";
import { FileUri } from "../../application/node/file-uri";

export { ContainerModule };

const g = <any>global;
const s = <any>self;

// Monaco uses a custom amd loader that over-rides node's require.
// Keep a reference to node's require so we can restore it after executing the amd loader file.
const nodeRequire = g.require;

const loadAmdRequire = new Promise<any>(resolve => {
    const vsLoader = document.createElement('script');
    vsLoader.type = 'text/javascript';
    vsLoader.src = './vs/loader.js';
    vsLoader.charset = 'utf-8';
    vsLoader.addEventListener('load', () => {
        // Save Monaco's amd require and restore Node's require
        const amdRequire = g.require;
        g.require = nodeRequire;

        const baseUrl = FileUri.create(__dirname).toString();
        amdRequire.config({ baseUrl });

        // workaround monaco-css not understanding the environment
        s.module = undefined;

        // workaround monaco-typescript not understanding the environment
        s.process.browser = true;

        resolve(amdRequire);
    });
    document.body.appendChild(vsLoader);
});

export default loadAmdRequire
    .then(amdRequire => loadMonaco(amdRequire))
    .then(() => import('../browser/monaco-frontend-module'))
    .then(module => module.default);