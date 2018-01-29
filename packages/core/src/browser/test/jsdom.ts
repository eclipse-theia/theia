/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');

(global as any)['document'] = dom.window.document;
(global as any)['window'] = dom.window;
(global as any)['navigator'] = { userAgent: 'node.js', platform: 'Mac' };
(global as any)['HTMLElement'] = (global as any)['window'].HTMLElement;

const toCleanup: string[] = [];
Object.getOwnPropertyNames((dom.window as any)).forEach(property => {
    if (typeof (global as any)[property] === 'undefined') {
        (global as any)[property] = (dom.window as any)[property];
        toCleanup.push(property);
    }
});

(dom.window.document as any)['queryCommandSupported'] = function () { };

export function cleanupJSDOM() {
    for (const property of toCleanup) {
        delete (global as any)[property];
    }
    delete (dom.window.document as any)['queryCommandSupported'];
}
