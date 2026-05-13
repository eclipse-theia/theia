// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { nls } from '@theia/core/lib/common/nls';
import { renderBlockedResourcePlaceholder } from './blocked-resource-placeholder';

export const BLOCKED_RESOURCE_CLASS = 'theia-blocked-resource';
export const BLOCKED_RESOURCE_ALLOW_CLASS = 'theia-blocked-resource-allow';
export const BLOCKED_RESOURCE_WRAPPER_CLASS = 'theia-blocked-resource-wrapper';

const SAFE_SCHEMES = new Set(['data:']);
const RESOURCE_SELECTORS = '*';
const EMBEDDED_CONTENT_SELECTORS = 'iframe, frame';
const RESOURCE_URL_ATTRIBUTES = ['src', 'poster', 'href', 'xlink:href', 'data'];
const INLINE_EXTERNAL_CONTENT_LABEL = nls.localize('theia/ai-chat-ui/blockedResource/inlineContent', '(inline external content)');
const URL_PATTERN = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi;
const IMAGE_SET_PATTERN = /(?:-webkit-)?image-set\(([^)]*)\)/gi;
const IMAGE_SET_URL_PATTERN = /"([^"]*)"|'([^']*)'|(?:^|,)\s*([^,\s)]+)/gi;
const blockedResources = new WeakMap<HTMLElement, Element>();

function isSafeUrl(rawUrl: string): boolean {
    const url = stripQuotes(rawUrl.trim());
    if (!url) {
        return true;
    }
    const lowerCaseUrl = url.toLowerCase();
    for (const scheme of SAFE_SCHEMES) {
        if (lowerCaseUrl.startsWith(scheme)) {
            return true;
        }
    }
    return false;
}

export function blockExternalResources(root: ParentNode & { ownerDocument: Document }): void {
    for (const element of Array.from(root.querySelectorAll(EMBEDDED_CONTENT_SELECTORS))) {
        element.replaceWith(buildPlaceholder(root.ownerDocument, element));
    }

    for (const element of Array.from(root.querySelectorAll(RESOURCE_SELECTORS))) {
        if (elementHasExternalReference(element)) {
            element.replaceWith(buildPlaceholder(root.ownerDocument, element));
        }
    }

    for (const element of Array.from(root.querySelectorAll('[style]'))) {
        const unsafeStyleUrls = extractUnsafeStyleUrls(element);
        if (unsafeStyleUrls.length) {
            const wrapper = root.ownerDocument.createElement('span');
            wrapper.classList.add(BLOCKED_RESOURCE_WRAPPER_CLASS);
            wrapper.appendChild(buildPlaceholder(root.ownerDocument, element));

            const safeClone = element.cloneNode(true) as HTMLElement;
            removeUnsafeStyleDeclarations(safeClone);
            blockExternalResources(safeClone);
            wrapper.appendChild(safeClone);
            element.replaceWith(wrapper);
        }
    }
}

function buildPlaceholder(doc: Document, original: Element): HTMLElement {
    const resources = collectExternalResourceUrls(original);
    const placeholder = doc.createElement('span');
    placeholder.classList.add(BLOCKED_RESOURCE_CLASS);
    placeholder.setAttribute('role', 'group');
    placeholder.setAttribute('aria-label', nls.localize(
        'theia/ai-chat-ui/blockedResource/aria',
        'Blocked external resources: {0}',
        resources.join(', ')
    ));
    placeholder.dataset.blockedTag = original.tagName.toLowerCase();
    blockedResources.set(placeholder, original.cloneNode(true) as Element);

    placeholder.innerHTML = renderBlockedResourcePlaceholder(resources);

    return placeholder;
}

export function restoreBlockedResource(placeholder: Element): Element | undefined {
    if (!(placeholder instanceof HTMLElement)) {
        return undefined;
    }
    const original = blockedResources.get(placeholder);
    blockedResources.delete(placeholder);
    return original?.cloneNode(true) as Element | undefined;
}

function elementHasExternalReference(element: Element): boolean {
    if (element.tagName === 'A') {
        return false;
    }
    for (const attributeName of RESOURCE_URL_ATTRIBUTES) {
        const value = element.getAttribute(attributeName);
        if (value && !isSafeUrl(value)) {
            return true;
        }
    }

    const srcset = element.getAttribute('srcset');
    if (srcset && srcsetHasExternalReference(srcset)) {
        return true;
    }

    return false;
}

function collectExternalResourceUrls(element: Element): string[] {
    const urls = new Set<string>();
    for (const candidate of [element, ...Array.from(element.querySelectorAll('*'))]) {
        collectElementExternalResourceUrls(candidate, urls);
    }
    if (!urls.size && element.hasAttribute('srcdoc')) {
        urls.add(INLINE_EXTERNAL_CONTENT_LABEL);
    }
    return Array.from(urls);
}

function collectElementExternalResourceUrls(element: Element, urls: Set<string>): void {
    if (element.tagName !== 'A') {
        for (const attributeName of RESOURCE_URL_ATTRIBUTES) {
            const value = element.getAttribute(attributeName);
            if (value && !isSafeUrl(value)) {
                urls.add(value);
            }
        }
    }

    const srcset = element.getAttribute('srcset');
    if (srcset) {
        for (const url of extractSrcsetUrls(srcset).filter(candidate => !isSafeUrl(candidate))) {
            urls.add(url);
        }
    }

    for (const url of extractUnsafeStyleUrls(element)) {
        urls.add(url);
    }

    if ((element.tagName === 'IFRAME' || element.tagName === 'FRAME') && element.hasAttribute('srcdoc')) {
        urls.add(INLINE_EXTERNAL_CONTENT_LABEL);
    }
}

function srcsetHasExternalReference(srcset: string): boolean {
    return extractSrcsetUrls(srcset).some(url => !isSafeUrl(url));
}

function extractSrcsetUrls(srcset: string): string[] {
    const urls: string[] = [];
    let current = '';
    for (let index = 0; index < srcset.length; index++) {
        const character = srcset[index];
        if (character === ',' && shouldSplitSrcsetCandidate(current)) {
            urls.push(extractSrcsetCandidateUrl(current));
            current = '';
        } else {
            current += character;
        }
    }
    urls.push(extractSrcsetCandidateUrl(current));
    return urls.filter(url => !!url);
}

function shouldSplitSrcsetCandidate(candidate: string): boolean {
    const trimmedCandidate = candidate.trim().toLowerCase();
    return !trimmedCandidate.startsWith('data:') || /\s+\S+$/.test(trimmedCandidate);
}

function extractSrcsetCandidateUrl(candidate: string): string {
    return candidate.trim().split(/\s+/)[0];
}

function extractUnsafeStyleUrls(element: Element): string[] {
    return extractStyleUrls(element).filter(url => !isSafeUrl(url));
}

function extractStyleUrls(element: Element): string[] {
    const style = element.getAttribute('style');
    if (!style) {
        return [];
    }
    return extractUrls(style);
}

function removeUnsafeStyleDeclarations(element: HTMLElement): void {
    const style = element.getAttribute('style');
    if (!style) {
        return;
    }
    const safeDeclarations = style.split(';').map(declaration => declaration.trim()).filter(declaration => {
        const separator = declaration.indexOf(':');
        if (separator === -1) {
            return false;
        }
        const value = declaration.substring(separator + 1);
        return !extractUrls(value).some(url => !isSafeUrl(url));
    });
    if (safeDeclarations.length) {
        element.setAttribute('style', safeDeclarations.join('; '));
    } else {
        element.removeAttribute('style');
    }
}

function extractUrls(styleValue: string): string[] {
    const urls = Array.from(styleValue.matchAll(URL_PATTERN), match => stripQuotes((match[1] || match[2] || match[3] || '').trim()));
    for (const imageSetMatch of styleValue.matchAll(IMAGE_SET_PATTERN)) {
        const imageSet = imageSetMatch[1];
        urls.push(...Array.from(imageSet.matchAll(IMAGE_SET_URL_PATTERN), match => stripQuotes((match[1] || match[2] || match[3] || '').trim())));
    }
    return urls.filter(url => !!url);
}

function stripQuotes(value: string): string {
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
        return value.slice(1, -1);
    }
    return value;
}
