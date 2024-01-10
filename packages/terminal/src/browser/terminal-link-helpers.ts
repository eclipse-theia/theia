// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
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

import type { IBufferRange, IBufferLine, IBuffer, Terminal } from 'xterm';

export const LinkContext = Symbol('LinkContext');
export interface LinkContext {
    text: string;
    startLine: number;
    lines: IBufferLine[];
}

/**
 * Mimics VS Code IRange
 */
interface TerminalRange {
    readonly startLineNumber: number;
    readonly startColumn: number;
    readonly endLineNumber: number;
    readonly endColumn: number;
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and others. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/
export function getLinkContext(terminal: Terminal, line: number, maxLinkLength = 2000): LinkContext {
    // The following method is based on VS Code's TerminalLinkDetectorAdapter._provideLinks()
    // https://github.com/microsoft/vscode/blob/7888ff3a6b104e9e2e3d0f7890ca92dd0828215f/src/vs/workbench/contrib/terminal/browser/links/terminalLinkDetectorAdapter.ts#L51
    let startLine = line - 1;
    let endLine = startLine;

    const lines: IBufferLine[] = [terminal.buffer.active.getLine(startLine)!];

    // Cap the maximum context on either side of the line being provided, by taking the context
    // around the line being provided for this ensures the line the pointer is on will have
    // links provided.
    const maxLineContext = Math.max(maxLinkLength / terminal.cols);
    const minStartLine = Math.max(startLine - maxLineContext, 0);
    const maxEndLine = Math.min(endLine + maxLineContext, terminal.buffer.active.length);

    while (startLine >= minStartLine && terminal.buffer.active.getLine(startLine)?.isWrapped) {
        lines.unshift(terminal.buffer.active.getLine(startLine - 1)!);
        startLine--;
    }

    while (endLine < maxEndLine && terminal.buffer.active.getLine(endLine + 1)?.isWrapped) {
        lines.push(terminal.buffer.active.getLine(endLine + 1)!);
        endLine++;
    }

    const text = getXtermLineContent(terminal.buffer.active, startLine, endLine, terminal.cols);

    return { text, startLine, lines };
}

// The following code is taken as is from
// https://github.com/microsoft/vscode/blob/7888ff3a6b104e9e2e3d0f7890ca92dd0828215f/src/vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers.ts#L1

/**
 * Converts a possibly wrapped link's range (comprised of string indices) into a buffer range that plays nicely with xterm.js
 *
 * @param lines A single line (not the entire buffer)
 * @param bufferWidth The number of columns in the terminal
 * @param range The link range - string indices
 * @param startLine The absolute y position (on the buffer) of the line
 */
export function convertLinkRangeToBuffer(
    lines: IBufferLine[],
    bufferWidth: number,
    range: TerminalRange,
    startLine: number
): IBufferRange {
    const bufferRange: IBufferRange = {
        start: {
            x: range.startColumn,
            y: range.startLineNumber + startLine
        },
        end: {
            x: range.endColumn - 1,
            y: range.endLineNumber + startLine
        }
    };

    // Shift start range right for each wide character before the link
    let startOffset = 0;
    const startWrappedLineCount = Math.ceil(range.startColumn / bufferWidth);
    for (let y = 0; y < Math.min(startWrappedLineCount); y++) {
        const lineLength = Math.min(bufferWidth, range.startColumn - y * bufferWidth);
        let lineOffset = 0;
        const line = lines[y];
        // Sanity check for line, apparently this can happen but it's not clear under what
        // circumstances this happens. Continue on, skipping the remainder of start offset if this
        // happens to minimize impact.
        if (!line) {
            break;
        }
        for (let x = 0; x < Math.min(bufferWidth, lineLength + lineOffset); x++) {
            const cell = line.getCell(x)!;
            const width = cell.getWidth();
            if (width === 2) {
                lineOffset++;
            }
            const char = cell.getChars();
            if (char.length > 1) {
                lineOffset -= char.length - 1;
            }
        }
        startOffset += lineOffset;
    }

    // Shift end range right for each wide character inside the link
    let endOffset = 0;
    const endWrappedLineCount = Math.ceil(range.endColumn / bufferWidth);
    for (let y = Math.max(0, startWrappedLineCount - 1); y < endWrappedLineCount; y++) {
        const start = (y === startWrappedLineCount - 1 ? (range.startColumn + startOffset) % bufferWidth : 0);
        const lineLength = Math.min(bufferWidth, range.endColumn + startOffset - y * bufferWidth);
        const startLineOffset = (y === startWrappedLineCount - 1 ? startOffset : 0);
        let lineOffset = 0;
        const line = lines[y];
        // Sanity check for line, apparently this can happen but it's not clear under what
        // circumstances this happens. Continue on, skipping the remainder of start offset if this
        // happens to minimize impact.
        if (!line) {
            break;
        }
        for (let x = start; x < Math.min(bufferWidth, lineLength + lineOffset + startLineOffset); x++) {
            const cell = line.getCell(x)!;
            const width = cell.getWidth();
            // Offset for 0 cells following wide characters
            if (width === 2) {
                lineOffset++;
            }
            // Offset for early wrapping when the last cell in row is a wide character
            if (x === bufferWidth - 1 && cell.getChars() === '') {
                lineOffset++;
            }
        }
        endOffset += lineOffset;
    }

    // Apply the width character offsets to the result
    bufferRange.start.x += startOffset;
    bufferRange.end.x += startOffset + endOffset;

    // Convert back to wrapped lines
    while (bufferRange.start.x > bufferWidth) {
        bufferRange.start.x -= bufferWidth;
        bufferRange.start.y++;
    }
    while (bufferRange.end.x > bufferWidth) {
        bufferRange.end.x -= bufferWidth;
        bufferRange.end.y++;
    }

    return bufferRange;
}

function getXtermLineContent(buffer: IBuffer, lineStart: number, lineEnd: number, cols: number): string {
    // Cap the maximum number of lines generated to prevent potential performance problems. This is
    // more of a sanity check as the wrapped line should already be trimmed down at this point.
    const maxLineLength = Math.max(2048 / cols * 2);
    lineEnd = Math.min(lineEnd, lineStart + maxLineLength);
    let content = '';
    for (let i = lineStart; i <= lineEnd; i++) {
        // Make sure only 0 to cols are considered as resizing when windows mode is enabled will
        // retain buffer data outside of the terminal width as reflow is disabled.
        const line = buffer.getLine(i);
        if (line) {
            content += line.translateToString(true, 0, cols);
        }
    }
    return content;
}
