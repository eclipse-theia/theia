/********************************************************************************
 * Copyright (C) 2020 Red Hat, Inc. and others.
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

// Copied from https://github.com/microsoft/vscode/blob/standalone/0.17.x/src/vs/base/common/comparers.ts
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import strings = monaco.strings;
import IdleValue = monaco.async.IdleValue;
import QuickOpenEntry = monaco.quickOpen.QuickOpenEntry;

let intlFileNameCollator: IdleValue<{ collator: Intl.Collator, collatorIsNumeric: boolean }>;

export function setFileNameComparer(collator: IdleValue<{ collator: Intl.Collator, collatorIsNumeric: boolean }>): void {
    intlFileNameCollator = collator;
}

export function compareFileNames(one: string | null, other: string | null, caseSensitive = false): number {
    if (intlFileNameCollator) {
        const a = one || '';
        const b = other || '';
        const result = intlFileNameCollator.getValue().collator.compare(a, b);

        // Using the numeric option in the collator will
        // make compare(`foo1`, `foo01`) === 0. We must disambiguate.
        if (intlFileNameCollator.getValue().collatorIsNumeric && result === 0 && a !== b) {
            return a < b ? -1 : 1;
        }

        return result;
    }

    return noIntlCompareFileNames(one, other, caseSensitive);
}

const FileNameMatch = /^(.*?)(\.([^.]*))?$/;

export function noIntlCompareFileNames(one: string | null, other: string | null, caseSensitive = false): number {
    if (!caseSensitive) {
        one = one && one.toLowerCase();
        other = other && other.toLowerCase();
    }

    const [oneName, oneExtension] = extractNameAndExtension(one);
    const [otherName, otherExtension] = extractNameAndExtension(other);

    if (oneName !== otherName) {
        return oneName < otherName ? -1 : 1;
    }

    if (oneExtension === otherExtension) {
        return 0;
    }

    return oneExtension < otherExtension ? -1 : 1;
}

function extractNameAndExtension(str?: string | null): [string, string] {
    const match = str ? FileNameMatch.exec(str) as Array<string> : ([] as Array<string>);

    return [(match && match[1]) || '', (match && match[3]) || ''];
}

export function compareAnything(one: string, other: string, lookFor: string): number {
    const elementAName = one.toLowerCase();
    const elementBName = other.toLowerCase();

    // Sort prefix matches over non prefix matches
    const prefixCompare = compareByPrefix(one, other, lookFor);
    if (prefixCompare) {
        return prefixCompare;
    }

    // Sort suffix matches over non suffix matches
    const elementASuffixMatch = strings.endsWith(elementAName, lookFor);
    const elementBSuffixMatch = strings.endsWith(elementBName, lookFor);
    if (elementASuffixMatch !== elementBSuffixMatch) {
        return elementASuffixMatch ? -1 : 1;
    }

    // Understand file names
    const r = compareFileNames(elementAName, elementBName);
    if (r !== 0) {
        return r;
    }

    // Compare by name
    return elementAName.localeCompare(elementBName);
}

export function compareByPrefix(one: string, other: string, lookFor: string): number {
    const elementAName = one.toLowerCase();
    const elementBName = other.toLowerCase();

    // Sort prefix matches over non prefix matches
    const elementAPrefixMatch = strings.startsWith(elementAName, lookFor);
    const elementBPrefixMatch = strings.startsWith(elementBName, lookFor);
    if (elementAPrefixMatch !== elementBPrefixMatch) {
        return elementAPrefixMatch ? -1 : 1;
    } else if (elementAPrefixMatch && elementBPrefixMatch) { // Same prefix: Sort shorter matches to the top to have those on top that match more precisely
        if (elementAName.length < elementBName.length) {
            return -1;
        }

        if (elementAName.length > elementBName.length) {
            return 1;
        }
    }

    return 0;
}

/**
 * A good default sort implementation for quick open entries respecting highlight information
 * as well as associated resources.
 */
// copied from vscode: https://github.com/microsoft/vscode/blob/standalone/0.17.x/src/vs/base/parts/quickopen/browser/quickOpenModel.ts#L584
export function compareEntries(elementA: QuickOpenEntry, elementB: QuickOpenEntry, lookFor: string): number {

    // Give matches with label highlights higher priority over
    // those with only description highlights
    const labelHighlightsA = elementA.getHighlights()[0] || [];
    const labelHighlightsB = elementB.getHighlights()[0] || [];
    if (labelHighlightsA.length && !labelHighlightsB.length) {
        return -1;
    }

    if (!labelHighlightsA.length && labelHighlightsB.length) {
        return 1;
    }

    // Fallback to the full path if labels are identical and we have associated resources
    let nameA = elementA.getLabel()!;
    let nameB = elementB.getLabel()!;
    if (nameA === nameB) {
        const resourceA = elementA.getResource();
        const resourceB = elementB.getResource();

        if (resourceA && resourceB) {
            nameA = resourceA.fsPath;
            nameB = resourceB.fsPath;
        }
    }

    return compareAnything(nameA, nameB, lookFor);
}
