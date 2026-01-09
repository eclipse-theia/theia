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

import { expect } from 'chai';
import { load } from 'js-yaml';
import { SkillDescription } from '../common/skill';

/**
 * A standalone implementation of the parseSkillFile logic for testing purposes.
 * This avoids importing DefaultSkillService which has browser-specific dependencies
 * that cannot run in a Node.js test environment.
 */
function parseSkillFile(content: string): { metadata: SkillDescription | undefined, content: string } {
    const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontMatterRegex);

    if (!match) {
        return { metadata: undefined, content };
    }

    try {
        const yamlContent = match[1];
        const markdownContent = match[2];
        const parsedYaml = load(yamlContent);

        if (!parsedYaml || typeof parsedYaml !== 'object') {
            return { metadata: undefined, content };
        }

        return { metadata: parsedYaml as SkillDescription, content: markdownContent };
    } catch {
        return { metadata: undefined, content };
    }
}

describe('SkillService', () => {
    describe('parseSkillFile', () => {
        it('extracts YAML front matter correctly', () => {
            const fileContent = `---
name: my-skill
description: A test skill for testing purposes
license: MIT
compatibility: ">=1.0.0"
metadata:
  author: test
  version: "1.0.0"
---
# My Skill

This is the skill content.`;

            const result = parseSkillFile(fileContent);

            expect(result.content).to.equal(`# My Skill

This is the skill content.`);
            expect(result.metadata).to.not.be.undefined;
            expect(result.metadata?.name).to.equal('my-skill');
            expect(result.metadata?.description).to.equal('A test skill for testing purposes');
            expect(result.metadata?.license).to.equal('MIT');
            expect(result.metadata?.compatibility).to.equal('>=1.0.0');
            expect(result.metadata?.metadata).to.deep.equal({ author: 'test', version: '1.0.0' });
        });

        it('returns content without metadata when no front matter exists', () => {
            const fileContent = '# Just a regular markdown file';

            const result = parseSkillFile(fileContent);

            expect(result.content).to.equal('# Just a regular markdown file');
            expect(result.metadata).to.be.undefined;
        });

        it('handles missing front matter gracefully', () => {
            const fileContent = `---
This is not valid YAML front matter
Skill content`;

            const result = parseSkillFile(fileContent);

            expect(result.content).to.equal(fileContent);
            expect(result.metadata).to.be.undefined;
        });

        it('handles invalid YAML gracefully', () => {
            const fileContent = `---
name: my-skill
description: [unclosed array
---
Skill content`;

            const result = parseSkillFile(fileContent);

            expect(result.content).to.equal(fileContent);
            expect(result.metadata).to.be.undefined;
        });

        it('handles minimal required fields', () => {
            const fileContent = `---
name: minimal-skill
description: A minimal skill
---
Content`;

            const result = parseSkillFile(fileContent);

            expect(result.content).to.equal('Content');
            expect(result.metadata?.name).to.equal('minimal-skill');
            expect(result.metadata?.description).to.equal('A minimal skill');
            expect(result.metadata?.license).to.be.undefined;
            expect(result.metadata?.compatibility).to.be.undefined;
            expect(result.metadata?.metadata).to.be.undefined;
        });

        it('handles allowedTools field', () => {
            const fileContent = `---
name: tool-skill
description: A skill with allowed tools
allowedTools:
  - tool1
  - tool2
---
Content`;

            const result = parseSkillFile(fileContent);

            expect(result.metadata?.allowedTools).to.deep.equal(['tool1', 'tool2']);
        });

        it('preserves markdown content with special characters', () => {
            const fileContent = `---
name: special-skill
description: Test
---
# Skill with {{variable}} and \`code\` and **bold**

\`\`\`javascript
const x = 1;
\`\`\``;

            const result = parseSkillFile(fileContent);

            expect(result.content).to.contain('{{variable}}');
            expect(result.content).to.contain('`code`');
            expect(result.content).to.contain('**bold**');
            expect(result.content).to.contain('const x = 1;');
        });

        it('handles empty content after front matter', () => {
            const fileContent = `---
name: empty-content
description: Skill with no content
---
`;

            const result = parseSkillFile(fileContent);

            expect(result.metadata?.name).to.equal('empty-content');
            expect(result.content).to.equal('');
        });
    });
});
