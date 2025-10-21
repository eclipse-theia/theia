// *****************************************************************************
// Copyright (C) 2025 EclipseSource and others.
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
import { parseTemplateWithMetadata, ParsedTemplate } from './prompttemplate-parser';

describe('Prompt Template Parser', () => {

    describe('YAML Front Matter Parsing', () => {
        it('extracts YAML front matter correctly', () => {
            const fileContent = `---
isCommand: true
commandName: hello
commandDescription: Say hello
commandArgumentHint: <name>
commandAgents:
  - Universal
  - Agent2
---
Template content here`;

            const result: ParsedTemplate = parseTemplateWithMetadata(fileContent);

            expect(result.template).to.equal('Template content here');
            expect(result.metadata).to.not.be.undefined;
            expect(result.metadata?.isCommand).to.be.true;
            expect(result.metadata?.commandName).to.equal('hello');
            expect(result.metadata?.commandDescription).to.equal('Say hello');
            expect(result.metadata?.commandArgumentHint).to.equal('<name>');
            expect(result.metadata?.commandAgents).to.deep.equal(['Universal', 'Agent2']);
        });

        it('returns template without front matter when none exists', () => {
            const fileContent = 'Just a regular template';

            const result: ParsedTemplate = parseTemplateWithMetadata(fileContent);

            expect(result.template).to.equal('Just a regular template');
            expect(result.metadata).to.be.undefined;
        });

        it('handles missing front matter gracefully', () => {
            const fileContent = `---
This is not valid YAML front matter
Template content`;

            const result: ParsedTemplate = parseTemplateWithMetadata(fileContent);

            // Should return content as-is when front matter is invalid
            expect(result.template).to.equal(fileContent);
        });

        it('handles invalid YAML gracefully', () => {
            const fileContent = `---
isCommand: true
commandName: [unclosed array
---
Template content`;

            const result: ParsedTemplate = parseTemplateWithMetadata(fileContent);

            // Should return template without metadata on parse error
            expect(result.template).to.equal(fileContent);
            expect(result.metadata).to.be.undefined;
        });

        it('validates command metadata types', () => {
            const fileContent = `---
isCommand: "true"
commandName: 123
commandDescription: valid
commandArgumentHint: <arg>
commandAgents: "not-an-array"
---
Template`;

            const result: ParsedTemplate = parseTemplateWithMetadata(fileContent);

            expect(result.template).to.equal('Template');
            expect(result.metadata?.isCommand).to.be.undefined; // Wrong type
            expect(result.metadata?.commandName).to.be.undefined; // Wrong type
            expect(result.metadata?.commandDescription).to.equal('valid');
            expect(result.metadata?.commandArgumentHint).to.equal('<arg>');
            expect(result.metadata?.commandAgents).to.be.undefined; // Wrong type
        });

        it('filters commandAgents to strings only', () => {
            const fileContent = `---
commandAgents:
  - ValidAgent
  - 123
  - AnotherValid
  - true
  - LastValid
---
Template`;

            const result: ParsedTemplate = parseTemplateWithMetadata(fileContent);

            expect(result.metadata?.commandAgents).to.deep.equal(['ValidAgent', 'AnotherValid', 'LastValid']);
        });

        it('handles partial metadata fields', () => {
            const fileContent = `---
isCommand: true
commandName: test
---
Template content`;

            const result: ParsedTemplate = parseTemplateWithMetadata(fileContent);

            expect(result.template).to.equal('Template content');
            expect(result.metadata?.isCommand).to.be.true;
            expect(result.metadata?.commandName).to.equal('test');
            expect(result.metadata?.commandDescription).to.be.undefined;
            expect(result.metadata?.commandArgumentHint).to.be.undefined;
            expect(result.metadata?.commandAgents).to.be.undefined;
        });

        it('preserves template content with special characters', () => {
            const fileContent = `---
isCommand: true
---
Template with $ARGUMENTS and {{variable}} and ~{function}`;

            const result: ParsedTemplate = parseTemplateWithMetadata(fileContent);

            expect(result.template).to.equal('Template with $ARGUMENTS and {{variable}} and ~{function}');
            expect(result.metadata?.isCommand).to.be.true;
        });
    });
});
