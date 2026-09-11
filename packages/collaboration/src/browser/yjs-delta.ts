// *****************************************************************************
// Copyright (C) 2026 Sahil Gupta and others.
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

/**
 * A single operation of a Yjs text delta, as delivered by `Y.YTextEvent.delta`.
 */
export interface YTextDeltaOp {
    retain?: number;
    insert?: string | object;
    delete?: number;
}

/**
 * An edit expressed as offsets into the pre-edit document.
 */
export interface YjsDeltaEdit {
    /** Start offset into the pre-edit document. */
    start: number;
    /** End offset into the pre-edit document; equal to `start` for a pure insertion. */
    end: number;
    /** Replacement text; empty for a pure deletion. */
    text: string;
}

/**
 * Converts a Yjs text delta into edits addressed against the pre-edit document.
 *
 * A Yjs delta walks two cursors at once: `retain` advances in both the old and the new
 * document, `insert` advances only in the new one, and `delete` advances only in the old
 * one. The edits produced here are collected and applied together against the pre-edit
 * model, so every offset must address that same, unchanged document. The cursor therefore
 * advances on `retain` and `delete` and stands still on `insert`.
 *
 * Non-string inserts (embeds) carry no text for a plain text model and are skipped.
 */
export function yTextDeltaToEdits(delta: readonly YTextDeltaOp[]): YjsDeltaEdit[] {
    let index = 0;
    const edits: YjsDeltaEdit[] = [];
    for (const op of delta) {
        if (op.retain !== undefined) {
            index += op.retain;
        } else if (op.insert !== undefined) {
            if (typeof op.insert === 'string') {
                edits.push({ start: index, end: index, text: op.insert });
            }
            // No index advance: an insert adds characters to the new document only.
        } else if (op.delete !== undefined) {
            edits.push({ start: index, end: index + op.delete, text: '' });
            index += op.delete;
        }
    }
    return edits;
}
