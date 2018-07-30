/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { JSDOM } from 'jsdom';

/**
 * ```typescript
 * const disableJSDOM = enableJSDOM();
 * // actions require DOM
 * disableJSDOM();
 * ```
 */
export function enableJSDOM(): () => void {
    // tslint:disable:no-any
    // tslint:disable:no-unused-expression

    // do nothing if running in browser
    try {
        global;
    } catch (e) {
        return () => { };
    }
    // no need to enable twice
    if (typeof (global as any)['_disableJSDOM'] === 'function') {
        return (global as any)['_disableJSDOM'];
    }
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'http://localhost/'
    });
    (global as any)['document'] = dom.window.document;
    (global as any)['window'] = dom.window;
    (global as any)['navigator'] = { userAgent: 'node.js', platform: 'Mac' };

    const toCleanup: string[] = [];
    Object.getOwnPropertyNames((dom.window as any)).forEach(property => {
        if (typeof (global as any)[property] === 'undefined') {
            (global as any)[property] = (dom.window as any)[property];
            toCleanup.push(property);
        }
    });
    (dom.window.document as any)['queryCommandSupported'] = function () { };

    const disableJSDOM = (global as any)['_disableJSDOM'] = () => {
        let property: string | undefined;
        while (property = toCleanup.pop()) {
            delete (global as any)[property];
        }
        delete (dom.window.document as any)['queryCommandSupported'];
        delete (global as any)['document'];
        delete (global as any)['window'];
        delete (global as any)['navigator'];
        delete (global as any)['_disableJSDOM'];
    };
    return disableJSDOM;
}
