// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { PickedElement } from './element-inspector-types';
import { guessSourceLocationFromElement } from './qaap-element-inspector-source-map';
import { formatStyleConventionPrompt } from './qaap-element-style-convention';

const OUTER_HTML_AGENT_MAX = 4000;

/** CSS-like selector for the picked node. */
export function buildElementCssSelector(picked: PickedElement): string {
    let selector = picked.tagName.toLowerCase();
    if (picked.id) {
        return `${selector}#${escapeCssIdent(picked.id)}`;
    }
    if (picked.classes.length > 0) {
        selector += picked.classes.slice(0, 4).map(c => `.${escapeCssIdent(c)}`).join('');
    }
    return selector;
}

/** Heuristic component / source path hint for agents and copy actions. */
export function guessElementComponentPath(picked: PickedElement): string | undefined {
    const fromSource = guessSourceLocationFromElement(picked);
    if (fromSource?.file) {
        const line = fromSource.line !== undefined ? `:${fromSource.line}` : '';
        const col = fromSource.column !== undefined ? `:${fromSource.column}` : '';
        return `${fromSource.file}${line}${col}`;
    }
    const componentAttr = picked.attributes.find(a =>
        a.name === 'data-component' || a.name === 'data-testid' || a.name === 'data-source-file'
    );
    if (componentAttr?.value) {
        return componentAttr.value;
    }
    return picked.domPath;
}

function escapeCssIdent(value: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, ch => `\\${ch}`);
}

export function truncateOuterHtml(outerHTML: string, max = OUTER_HTML_AGENT_MAX): string {
    if (outerHTML.length <= max) {
        return outerHTML;
    }
    return `${outerHTML.slice(0, max)}… [truncated ${outerHTML.length - max} chars]`;
}

/** Prompt body for "ask agent about this element". */
export function formatElementAgentPrompt(picked: PickedElement): string {
    const selector = buildElementCssSelector(picked);
    const componentPath = guessElementComponentPath(picked);
    const lines = [
        'Please help me change this element in the running dev preview.',
        '',
        `Page: ${picked.pageUrl}`,
        `DOM path: ${picked.domPath}`,
        `CSS selector: ${selector}`,
    ];
    if (componentPath && componentPath !== picked.domPath) {
        lines.push(`Component path hint: ${componentPath}`);
    }
    lines.push('', 'Outer HTML:', truncateOuterHtml(picked.outerHTML));
    if (picked.textPreview.trim()) {
        lines.push('', 'Text preview:', picked.textPreview.trim());
    }
    lines.push('', formatStyleConventionPrompt(picked));
    return lines.join('\n');
}

/** Prompt for generating a UI variant from the picked element (workspace edits, not iframe-only). */
export function formatElementGenerateVariantPrompt(picked: PickedElement): string {
    const base = formatElementAgentPrompt(picked);
    return [
        base,
        '',
        'Generate a **visual variant** of this element (layout, copy, or styling) as real project changes.',
        'Apply edits in the workspace source files (React/Vue/Svelte/CSS modules/Tailwind as used in this repo), not only in the preview DOM.',
        'After editing, run the Qaap bootstrap preview flow so I can compare the variant in the dev server.',
    ].join('\n');
}
