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

// Copied from https://github.com/microsoft/vscode/blob/7d9b1c37f8e5ae3772782ba3b09d827eb3fdd833/src/vs/base/common/codicons.ts
export namespace CSSIcon {
    export const iconNameSegment = '[A-Za-z0-9]+';
    export const iconNameExpression = '[A-Za-z0-9-]+';
    export const iconModifierExpression = '~[A-Za-z]+';
    export const iconNameCharacter = '[A-Za-z0-9~-]';
}

const iconsRegex = new RegExp(`\\$\\(${CSSIcon.iconNameExpression}(?:${CSSIcon.iconModifierExpression})?\\)`, 'g'); // no capturing groups

const escapeIconsRegex = new RegExp(`(\\\\)?${iconsRegex.source}`, 'g');
export function escapeIcons(text: string): string {
    return text.replace(escapeIconsRegex, (match, escaped) => escaped ? match : `\\${match}`);
}
