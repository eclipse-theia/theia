// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { PickedElement } from './element-inspector-types';
import { guessSourceLocationFromElement } from './qaap-element-inspector-source-map';

export type QaapStyleConventionKind = 'tailwind' | 'css-module' | 'inline' | 'global-css' | 'unknown';

export interface QaapStyleEditTarget {
    readonly kind: QaapStyleConventionKind;
    readonly summary: string;
    readonly sourceFile?: string;
    readonly classNames?: string[];
    readonly cssProperties?: string[];
}

const TAILWIND_CLASS_PATTERN = /^(?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?:\/[0-9]+)?$/;
const CSS_MODULE_CLASS_PATTERN = /^[a-zA-Z_][\w-]*$/;
const CSS_MODULE_ATTRS = ['class', 'className'] as const;

/** Heuristic Tailwind detector: utility-like tokens on the picked node. */
export function detectTailwindClasses(picked: PickedElement): string[] {
    const utilities = new Set<string>();
    for (const token of picked.classes) {
        const normalized = token.trim();
        if (!normalized || normalized.startsWith('qaap-')) {
            continue;
        }
        if (isLikelyTailwindUtility(normalized)) {
            utilities.add(normalized);
        }
    }
    return [...utilities];
}

function isLikelyTailwindUtility(token: string): boolean {
    if (!TAILWIND_CLASS_PATTERN.test(token)) {
        return false;
    }
    const prefixes = [
        'text-', 'bg-', 'border-', 'p-', 'px-', 'py-', 'pt-', 'pb-', 'pl-', 'pr-',
        'm-', 'mx-', 'my-', 'mt-', 'mb-', 'ml-', 'mr-', 'w-', 'h-', 'min-', 'max-',
        'flex', 'grid', 'block', 'inline', 'hidden', 'rounded', 'shadow', 'font-',
        'items-', 'justify-', 'gap-', 'space-', 'leading-', 'tracking-', 'opacity-',
        'z-', 'top-', 'left-', 'right-', 'bottom-', 'absolute', 'relative', 'fixed',
        'sticky', 'static', 'col-', 'row-', 'aspect-', 'object-', 'overflow-',
        'hover:', 'focus:', 'sm:', 'md:', 'lg:', 'xl:', '2xl:', 'dark:',
    ];
    return prefixes.some(p => token === p.replace(/-$/, '') || token.startsWith(p));
}

/** Parses `className={styles.foo}` / `class="styles_bar__x"` style module hints. */
export function detectCssModuleClasses(picked: PickedElement): string[] {
    const modules = new Set<string>();
    for (const name of CSS_MODULE_ATTRS) {
        const attr = picked.attributes.find(a => a.name === name);
        if (!attr?.value) {
            continue;
        }
        const match = attr.value.match(/(?:styles\.|styles\[['"])([a-zA-Z_][\w-]*)/);
        if (match?.[1]) {
            modules.add(match[1]);
        }
        for (const token of attr.value.split(/\s+/)) {
            if (token.includes('_') && CSS_MODULE_CLASS_PATTERN.test(token.split(' ')[0] ?? '')) {
                modules.add(token);
            }
        }
    }
    for (const token of picked.classes) {
        if (token.includes('_') && /^[a-zA-Z][\w-]+__/.test(token)) {
            modules.add(token);
        }
    }
    return [...modules];
}

export function resolveStyleEditTargets(picked: PickedElement): QaapStyleEditTarget[] {
    const targets: QaapStyleEditTarget[] = [];
    const source = guessSourceLocationFromElement(picked);
    const tailwind = detectTailwindClasses(picked);
    if (tailwind.length > 0) {
        targets.push({
            kind: 'tailwind',
            summary: `Tailwind utilities: ${tailwind.slice(0, 6).join(' ')}${tailwind.length > 6 ? '…' : ''}`,
            sourceFile: source?.file,
            classNames: tailwind,
        });
    }
    const cssModules = detectCssModuleClasses(picked);
    if (cssModules.length > 0) {
        const moduleFile = guessCssModuleFile(source?.file, picked);
        targets.push({
            kind: 'css-module',
            summary: `CSS module classes: ${cssModules.slice(0, 4).join(', ')}`,
            sourceFile: moduleFile ?? source?.file,
            classNames: cssModules,
        });
    }
    const inlineProps = Object.keys(picked.computedStyles).filter(k =>
        !k.startsWith('-') && picked.computedStyles[k] && picked.computedStyles[k] !== 'initial'
    ).slice(0, 12);
    if (inlineProps.length > 0) {
        targets.push({
            kind: 'inline',
            summary: 'Inline / computed styles on the picked element',
            sourceFile: source?.file,
            cssProperties: inlineProps,
        });
    }
    if (targets.length === 0) {
        targets.push({
            kind: 'unknown',
            summary: 'No Tailwind/CSS-module convention detected; edit global styles or component file.',
            sourceFile: source?.file,
        });
    }
    return targets;
}

function guessCssModuleFile(componentFile: string | undefined, picked: PickedElement): string | undefined {
    if (componentFile) {
        const base = componentFile.replace(/\.(tsx|jsx|ts|js|vue)$/i, '');
        return `${base}.module.css`;
    }
    const moduleAttr = picked.attributes.find(a => a.name === 'data-css-module')?.value;
    return moduleAttr?.trim();
}

export function formatStyleConventionPrompt(picked: PickedElement): string {
    const targets = resolveStyleEditTargets(picked);
    const lines = targets.map(t => {
        const file = t.sourceFile ? ` → ${t.sourceFile}` : '';
        return `- **${t.kind}**: ${t.summary}${file}`;
    });
    return ['Style conventions for this element:', ...lines].join('\n');
}
