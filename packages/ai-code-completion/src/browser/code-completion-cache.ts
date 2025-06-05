// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { injectable } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';

@injectable()
export class CodeCompletionCache {
    private cache: Map<string, CacheEntry>;
    private maxSize = 100;

    constructor() {
        this.cache = new Map<string, CacheEntry>();
    }

    /**
     * Generate a unique cache key based on input parameters
     * @param filePath Path of the current file
     * @param lineNumber Current line number
     * @param lineText Context prefix for completion
     * @returns Unique cache key
     */
    generateKey(filePath: string, model: monaco.editor.ITextModel, position: monaco.Position): string {
        const lineNumber = position.lineNumber;
        const beforeCursorLineRange = new monaco.Range(
            position.lineNumber, 1,
            position.lineNumber, position.column
        );
        const prefix = model.getValueInRange(beforeCursorLineRange);
        const afterCursorLineRange = new monaco.Range(
            position.lineNumber, position.column,
            position.lineNumber, model.getLineMaxColumn(position.lineNumber)
        );
        const suffix = model.getValueInRange(afterCursorLineRange);
        const key = JSON.stringify({
            filePath,
            lineNumber,
            prefix,
            suffix
        });
        return key;
    }

    /**
     * Get a cached completion if available
     * @param key Cache key
     * @returns Cached completion or undefined
     */
    get(key: string): monaco.languages.InlineCompletions | undefined {
        const entry = this.cache.get(key);
        if (entry) {
            // Update the entry's last accessed time
            entry.lastAccessed = Date.now();
            return entry.value;
        }
        return undefined;
    }

    /**
     * Store a completion in the cache
     * @param key Cache key
     * @param value Completion value to cache
     */
    put(key: string, value: monaco.languages.InlineCompletions | undefined): void {
        // If cache is full, remove the least recently used entry
        if (this.cache.size >= this.maxSize) {
            this.removeLeastRecentlyUsed();
        }

        this.cache.set(key, {
            value,
            lastAccessed: Date.now()
        });
    }

    /**
     * Clear the entire cache
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Remove the least recently used entry from the cache
     */
    private removeLeastRecentlyUsed(): void {
        let oldestKey: string | undefined;
        let oldestTime = Infinity;

        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastAccessed < oldestTime) {
                oldestKey = key;
                oldestTime = entry.lastAccessed;
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey);
        }
    }

    /**
     * Set the maximum cache size
     * @param size New maximum cache size
     */
    setMaxSize(size: number): void {
        this.maxSize = size;
        // Trim cache if it exceeds new size
        while (this.cache.size > this.maxSize) {
            this.removeLeastRecentlyUsed();
        }
    }
}

interface CacheEntry {
    value: monaco.languages.InlineCompletions | undefined;
    lastAccessed: number;
}
