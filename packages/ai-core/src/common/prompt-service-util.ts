// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

/** Should match the one from VariableResolverService. The format is `{{variableName:arg}}`. We allow {{}} and {{{}}} but no mixtures */
export const PROMPT_VARIABLE_TWO_BRACES_REGEX = /(?<!\{)\{\{\s*([^{}]+?)\s*\}\}(?!\})/g;
export const PROMPT_VARIABLE_THREE_BRACES_REGEX = /(?<!\{)\{\{\{\s*([^{}]+?)\s*\}\}\}(?!\})/g;
export function matchVariablesRegEx(template: string): RegExpMatchArray[] {
    const twoBraceMatches = [...template.matchAll(PROMPT_VARIABLE_TWO_BRACES_REGEX)];
    const threeBraceMatches = [...template.matchAll(PROMPT_VARIABLE_THREE_BRACES_REGEX)];
    return twoBraceMatches.concat(threeBraceMatches);
}

/** Match function/tool references in the prompt. The format is `~{functionId}`. */
export const PROMPT_FUNCTION_REGEX = /\~\{\s*(.*?)\s*\}/g;

export function matchFunctionsRegEx(template: string): RegExpMatchArray[] {
    return [...template.matchAll(PROMPT_FUNCTION_REGEX)];
}

/** Regex matching YAML front matter delimited by `---` */
export const FRONT_MATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;

/**
 * Strips YAML front matter from a template string, returning only the body.
 * If no front matter is present the original string is returned unchanged.
 */
export function stripFrontMatter(template: string): string {
    const match = template.match(FRONT_MATTER_REGEX);
    return match ? match[2] : template;
}
