// *****************************************************************************
// Copyright (C) 2021 logi.cals GmbH, EclipseSource and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ElementHandle } from '@playwright/test';
import { tmpdir, platform } from 'os';
import { sep } from 'path';

export const USER_KEY_TYPING_DELAY = 80;

export function normalizeId(nodeId: string): string {
    // Special characters (i.e. in our case '.',':','/','%', and '\\') in CSS IDs have to be escaped
    return nodeId.replace(/[.:,%/\\]/g, matchedChar => '\\' + matchedChar);
}

export async function toTextContentArray(items: ElementHandle<SVGElement | HTMLElement>[]): Promise<string[]> {
    const contents = items.map(item => item.textContent());
    const resolvedContents = await Promise.all(contents);
    return resolvedContents.filter(text => text !== undefined) as string[];
}

export function isDefined(content: string | undefined): content is string {
    return content !== undefined;
}

export function isNotNull(content: string | null): content is string {
    return content !== null;
}

export async function textContent(elementPromise: Promise<ElementHandle<SVGElement | HTMLElement> | null>): Promise<string | undefined> {
    const element = await elementPromise;
    if (!element) {
        return undefined;
    }
    const content = await element.textContent();
    return content ? content : undefined;
}

export async function containsClass(elementPromise: Promise<ElementHandle<SVGElement | HTMLElement> | null> | undefined, cssClass: string): Promise<boolean> {
    return elementContainsClass(await elementPromise, cssClass);
}

export async function elementContainsClass(element: ElementHandle<SVGElement | HTMLElement> | null | undefined, cssClass: string): Promise<boolean> {
    if (element) {
        const classValue = await element.getAttribute('class');
        if (classValue) {
            return classValue?.split(' ').includes(cssClass);
        }
    }
    return false;
}

export async function isElementVisible(elementPromise: Promise<ElementHandle<SVGElement | HTMLElement> | null>): Promise<boolean> {
    const element = await elementPromise;
    return element ? element.isVisible() : false;
}

export async function elementId(element: ElementHandle<SVGElement | HTMLElement>): Promise<string> {
    const id = await element.getAttribute('id');
    if (id === null) { throw new Error('Could not get ID of ' + element); }
    return id;
}

export namespace OSUtil {
    export const isWindows = platform() === 'win32';
    export const isMacOS = platform() === 'darwin';
    // The platform-specific file separator '\' or '/'.
    export const fileSeparator = sep;
    // The platform-specific location of the temporary directory.
    export const tmpDir = tmpdir();
}
