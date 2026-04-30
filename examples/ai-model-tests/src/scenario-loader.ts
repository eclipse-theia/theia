// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import * as fs from 'fs';
import * as path from 'path';

export interface Scenario {
    id: string;
    description: string;
    models: string[];
    runs: number;
    prompt: string;
    expectedBehavior: string;
    agent?: string;
}

interface Frontmatter {
    id?: string;
    description?: string;
    models?: string[];
    runs?: string;
    agent?: string;
}

export function loadScenarios(scenariosDir: string, filter?: string): Scenario[] {
    const files = fs.readdirSync(scenariosDir).filter(f => f.endsWith('.md'));
    const scenarios: Scenario[] = [];

    for (const file of files) {
        const content = fs.readFileSync(path.join(scenariosDir, file), 'utf-8');
        const scenario = parseScenario(content, path.basename(file, '.md'));
        if (filter && scenario.id !== filter) {
            continue;
        }
        scenarios.push(scenario);
    }

    return scenarios;
}

function parseScenario(content: string, fallbackId: string): Scenario {
    const frontmatter = parseFrontmatter(content);
    const body = removeFrontmatter(content);

    const prompt = extractSection(body, 'Prompt');
    const expectedBehavior = extractSection(body, 'Expected Behavior');

    const runs = Number(frontmatter.runs);
    return {
        id: frontmatter.id || fallbackId,
        description: frontmatter.description || fallbackId,
        models: frontmatter.models || [],
        runs: isNaN(runs) || runs < 1 ? 1 : runs,
        prompt: prompt.trim(),
        expectedBehavior: expectedBehavior.trim(),
        agent: frontmatter.agent,
    };
}

function parseFrontmatter(content: string): Frontmatter {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
        return {};
    }

    const result: Record<string, string | string[]> = {};
    const lines = match[1].split('\n');
    let currentKey: string | undefined;
    let currentArray: string[] | undefined;

    for (const line of lines) {
        const keyValue = line.match(/^(\w+):\s*(.*)$/);
        if (keyValue) {
            if (currentKey && currentArray) {
                result[currentKey] = currentArray;
            }
            currentKey = keyValue[1];
            const value = keyValue[2].trim();

            if (value === '' || value === undefined) {
                currentArray = [];
            } else if (value.startsWith('[') && value.endsWith(']')) {
                result[currentKey] = value.slice(1, -1).split(',').map(s => s.trim());
                currentKey = undefined;
                currentArray = undefined;
            } else {
                result[currentKey] = value;
                currentKey = undefined;
                currentArray = undefined;
            }
        } else if (currentArray !== undefined) {
            const item = line.match(/^\s+-\s+(.+)$/);
            if (item) {
                currentArray.push(item[1].trim());
            }
        }
    }

    if (currentKey && currentArray) {
        result[currentKey] = currentArray;
    }

    return result;
}

function removeFrontmatter(content: string): string {
    return content.replace(/^---\n[\s\S]*?\n---\n*/, '');
}

function extractSection(body: string, heading: string): string {
    // Split on markdown headings, find the one matching our heading
    const sections = body.split(/^(?=#\s)/m);
    for (const section of sections) {
        const headerMatch = section.match(/^#\s+(.*)/);
        if (headerMatch && headerMatch[1].trim() === heading) {
            // Return everything after the heading line
            return section.replace(/^#\s+.*\n/, '');
        }
    }
    return '';
}
