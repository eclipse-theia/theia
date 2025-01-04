// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the
// Eclipse Public License v. 2.0 are satisfied: GNU General Public License,
// version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export interface ChangeOperation {
    // Added 'fullFile' as well, assuming you want that option
    operation: 'replace' | 'insertBefore' | 'insertAtEndOfFile' | 'create_file' | 'fullFile';
    anchor?: string;
    newContent: string;
}

export class ContentChangeApplier {

    /**
     * If you want to ignore leading/trailing whitespace in anchors, set this to `true`.
     * Otherwise, set it to `false` if you require exact matches including indentation.
     */
    private readonly ignoreLineWhitespace = true;

    /**
     * Normalize line by trimming leading & trailing whitespace if ignoreLineWhitespace is true,
     * or leave it intact otherwise.
     */
    private normalizeLine(line: string): string {
        return this.ignoreLineWhitespace ? line.trim() : line;
    }

    /**
     * Finds the 0-based index of a multi-line anchor in the given lines array.
     * Returns -1 if not found.
     */
    private findAnchorLineIndex(lines: string[], anchor: string): number {
        // Split the anchor into lines (handle \n or \r\n)
        const anchorLines = anchor.split(/\r?\n/);

        // Edge case: if anchor is empty or only whitespace
        if (
            anchorLines.length === 0 ||
            (anchorLines.length === 1 && !anchorLines[0].trim())
        ) {
            return -1;
        }

        // Normalize anchor lines if ignoring whitespace
        const normalizedAnchor = anchorLines.map(line => this.normalizeLine(line));

        // Attempt to match these anchor lines in 'lines'
        for (let i = 0; i <= lines.length - normalizedAnchor.length; i++) {
            let match = true;
            for (let j = 0; j < normalizedAnchor.length; j++) {
                const fileLine = this.normalizeLine(lines[i + j]);
                if (fileLine !== normalizedAnchor[j]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                return i;
            }
        }

        return -1; // Not found
    }

    applyChangesToContent(content: string, changes: ChangeOperation[]): string {
        // 1. Detect line endings
        const usesCRLF = content.includes('\r\n');
        const lineEnding = usesCRLF ? '\r\n' : '\n';

        // 2. Split the file content into lines (universal regex \r?\n)
        let lines = content.split(/\r?\n/);

        for (const operation of changes) {
            switch (operation.operation) {

                case 'replace': {
                    if (!operation.anchor) {
                        throw new Error('Anchor is required for replace operation.');
                    }

                    const anchorLineIndex = this.findAnchorLineIndex(lines, operation.anchor);
                    if (anchorLineIndex === -1) {
                        throw new Error(`Anchor not found: "${operation.anchor}"`);
                    }

                    // Determine how many lines in the anchor
                    const anchorLineCount = operation.anchor.split(/\r?\n/).length;

                    // Split new content into lines
                    const newContentLines = operation.newContent.split(/\r?\n/);

                    // Replace in the lines array
                    lines.splice(anchorLineIndex, anchorLineCount, ...newContentLines);
                    break;
                }

                case 'insertBefore': {
                    if (!operation.anchor) {
                        throw new Error('Anchor is required for insertBefore operation.');
                    }

                    const anchorLineIndex = this.findAnchorLineIndex(lines, operation.anchor);
                    if (anchorLineIndex === -1) {
                        throw new Error(`Anchor not found: "${operation.anchor}"`);
                    }

                    // Insert new lines above anchor
                    const newContentLines = operation.newContent.split(/\r?\n/);
                    lines.splice(anchorLineIndex, 0, ...newContentLines);

                    break;
                }

                case 'insertAtEndOfFile': {
                    const newContentLines = operation.newContent.split(/\r?\n/);

                    // If there’s only one line to add, and the file’s last line isn’t empty,
                    // we can append that single line to the last line of the file.
                    if (
                        newContentLines.length === 1 &&  // Only one line in newContent
                        lines.length > 0 &&             // File is not empty
                        lines[lines.length - 1] !== ''  // Last line is not empty
                    ) {
                        // Append directly to the last line
                        lines[lines.length - 1] += newContentLines[0];
                    } else {
                        // Otherwise, treat them as separate lines
                        lines.push(...newContentLines);
                    }
                    break;
                }

                case 'create_file': {
                    // The file must be empty to create
                    if (content.length > 0) {
                        throw new Error(
                            'Cannot perform create_file operation on an existing file. Ensure the file is empty or does not exist.'
                        );
                    }
                    // Overwrite lines with the new content (split by lines)
                    lines = operation.newContent.split(/\r?\n/);
                    break;
                }

                case 'fullFile': {
                    // Overwrite the entire content
                    lines = operation.newContent.split(/\r?\n/);
                    break;
                }

                default:
                    throw new Error(`Unsupported operation: ${operation.operation}`);
            }
        }

        // Finally, rejoin with the original line ending style
        const updatedContent = lines.join(lineEnding);
        return updatedContent;
    }
}
