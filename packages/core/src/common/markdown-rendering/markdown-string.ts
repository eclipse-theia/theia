// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { escapeRegExpCharacters } from '../strings';
import { UriComponents } from '../uri';
import { escapeIcons } from './icon-utilities';
import { isObject, isString } from '../types';

export interface MarkdownStringTrustedOptions {
    readonly enabledCommands: readonly string[];
}

export interface MarkdownString {
    readonly value: string;
    readonly isTrusted?: boolean | MarkdownStringTrustedOptions;
    readonly supportThemeIcons?: boolean;
    readonly supportHtml?: boolean;
    readonly baseUri?: UriComponents;
    uris?: { [href: string]: UriComponents };
}

export enum MarkdownStringTextNewlineStyle {
    Paragraph = 0,
    Break = 1,
}

export namespace MarkdownString {
    /**
     * @returns whether the candidate satisfies the interface of a markdown string
     */
    export function is(candidate: unknown): candidate is MarkdownString {
        return isObject<MarkdownString>(candidate) && isString(candidate.value);
    }
}

// Copied from https://github.com/microsoft/vscode/blob/7d9b1c37f8e5ae3772782ba3b09d827eb3fdd833/src/vs/base/common/htmlContent.ts

export class MarkdownStringImpl implements MarkdownString {
    public value: string;
    public isTrusted?: boolean | MarkdownStringTrustedOptions;
    public supportThemeIcons?: boolean;
    public supportHtml?: boolean;
    public baseUri?: UriComponents;

    constructor(
        value: string = '',
        isTrustedOrOptions: boolean | { isTrusted?: boolean; supportThemeIcons?: boolean; supportHtml?: boolean } = false,
    ) {
        this.value = value;
        if (typeof this.value !== 'string') {
            throw new Error('Illegal value for MarkdownString. Expected string, got ' + typeof this.value);
        }

        if (typeof isTrustedOrOptions === 'boolean') {
            this.isTrusted = isTrustedOrOptions;
            this.supportThemeIcons = false;
            this.supportHtml = false;
        } else {
            this.isTrusted = isTrustedOrOptions.isTrusted ?? undefined;
            this.supportThemeIcons = isTrustedOrOptions.supportThemeIcons ?? false;
            this.supportHtml = isTrustedOrOptions.supportHtml ?? false;
        }
    }

    appendText(value: string, newlineStyle: MarkdownStringTextNewlineStyle = MarkdownStringTextNewlineStyle.Paragraph): MarkdownStringImpl {
        this.value += escapeMarkdownSyntaxTokens(this.supportThemeIcons ? escapeIcons(value) : value)
            .replace(/([ \t]+)/g, (_match, g1) => '&nbsp;'.repeat(g1.length))
            .replace(/\>/gm, '\\>')
            .replace(/\n/g, newlineStyle === MarkdownStringTextNewlineStyle.Break ? '\\\n' : '\n\n');

        return this;
    }

    appendMarkdown(value: string): MarkdownStringImpl {
        this.value += value;
        return this;
    }

    appendCodeblock(langId: string, code: string): MarkdownStringImpl {
        this.value += '\n```';
        this.value += langId;
        this.value += '\n';
        this.value += code;
        this.value += '\n```\n';
        return this;
    }

    appendLink(target: UriComponents | string, label: string, title?: string): MarkdownStringImpl {
        this.value += '[';
        this.value += this._escape(label, ']');
        this.value += '](';
        this.value += this._escape(String(target), ')');
        if (title) {
            this.value += ` "${this._escape(this._escape(title, '"'), ')')}"`;
        }
        this.value += ')';
        return this;
    }

    private _escape(value: string, ch: string): string {
        const r = new RegExp(escapeRegExpCharacters(ch), 'g');
        return value.replace(r, (match, offset) => {
            if (value.charAt(offset - 1) !== '\\') {
                return `\\${match}`;
            } else {
                return match;
            }
        });
    }
}

export function escapeMarkdownSyntaxTokens(text: string): string {
    // escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
    return text.replace(/[\\`*_{}[\]()#+\-!]/g, '\\$&');
}

// Copied from https://github.com/microsoft/vscode/blob/1.72.2/src/vs/base/common/htmlContent.ts

export function parseHrefAndDimensions(href: string): { href: string; dimensions: string[] } {
    const dimensions: string[] = [];
    const splitted = href.split('|').map(s => s.trim());
    href = splitted[0];
    const parameters = splitted[1];
    if (parameters) {
        const heightFromParams = /height=(\d+)/.exec(parameters);
        const widthFromParams = /width=(\d+)/.exec(parameters);
        const height = heightFromParams ? heightFromParams[1] : '';
        const width = widthFromParams ? widthFromParams[1] : '';
        const widthIsFinite = isFinite(parseInt(width));
        const heightIsFinite = isFinite(parseInt(height));
        if (widthIsFinite) {
            dimensions.push(`width="${width}"`);
        }
        if (heightIsFinite) {
            dimensions.push(`height="${height}"`);
        }
    }
    return { href, dimensions };
}
