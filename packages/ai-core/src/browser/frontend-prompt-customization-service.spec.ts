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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import 'reflect-metadata';

import { expect } from 'chai';
import { parseTemplateWithMetadata, ParsedTemplate } from './prompttemplate-parser';
import { CustomizationSource, DefaultPromptFragmentCustomizationService } from './frontend-prompt-customization-service';

disableJSDOM();

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

        it('extracts name and description from front matter', () => {
            const fileContent = `---
name: My Fragment
description: A helpful description of this fragment
---
Template content`;

            const result: ParsedTemplate = parseTemplateWithMetadata(fileContent);

            expect(result.template).to.equal('Template content');
            expect(result.metadata?.name).to.equal('My Fragment');
            expect(result.metadata?.description).to.equal('A helpful description of this fragment');
        });

        it('extracts name and description alongside command metadata', () => {
            const fileContent = `---
name: App Tester
description: Delegate testing to AppTester
isCommand: true
commandName: apptester
---
Template content`;

            const result: ParsedTemplate = parseTemplateWithMetadata(fileContent);

            expect(result.metadata?.name).to.equal('App Tester');
            expect(result.metadata?.description).to.equal('Delegate testing to AppTester');
            expect(result.metadata?.isCommand).to.be.true;
            expect(result.metadata?.commandName).to.equal('apptester');
        });

        it('handles missing name and description gracefully', () => {
            const fileContent = `---
isCommand: true
---
Template content`;

            const result: ParsedTemplate = parseTemplateWithMetadata(fileContent);

            expect(result.metadata?.name).to.be.undefined;
            expect(result.metadata?.description).to.be.undefined;
            expect(result.metadata?.isCommand).to.be.true;
        });

        it('rejects non-string name and description', () => {
            const fileContent = `---
name: 42
description: true
---
Template`;

            const result: ParsedTemplate = parseTemplateWithMetadata(fileContent);

            expect(result.metadata?.name).to.be.undefined;
            expect(result.metadata?.description).to.be.undefined;
        });
    });

    describe('DefaultPromptFragmentCustomizationService - addTemplate conflict resolution', () => {
        before(() => disableJSDOM = enableJSDOM());
        after(() => disableJSDOM());

        interface FragmentEntry {
            id: string;
            template: string;
            sourceUri: string;
            sourceUris: string[];
            priority: number;
            origin: CustomizationSource;
            customizationId: string;
        }

        /**
         * Test subclass that exposes the protected `addTemplate` and `provenanceLabel`
         * methods so we can unit-test conflict resolution without mocking the filesystem.
         */
        class TestableCustomizationService extends DefaultPromptFragmentCustomizationService {
            // Prevent @postConstruct from running (it touches preferences)
            protected override init(): void { }

            public testAddTemplate(
                active: Map<string, FragmentEntry>,
                id: string,
                template: string,
                sourceUri: string,
                all: Map<string, FragmentEntry>,
                priority: number,
                origin: CustomizationSource
            ): void {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (this as any).addTemplate(active, id, template, sourceUri, all, priority, origin);
            }

            public testProvenanceLabel(sourceUri: string): string {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (this as any).provenanceLabel(sourceUri);
            }
        }

        let service: TestableCustomizationService;
        let activeMap: Map<string, FragmentEntry>;
        let allMap: Map<string, FragmentEntry>;

        beforeEach(() => {
            service = new TestableCustomizationService();
            activeMap = new Map();
            allMap = new Map();
        });

        it('adds a fragment when no conflict exists', () => {
            const uri = 'file:///rootA/.prompts/project-info.prompttemplate';
            service.testAddTemplate(
                activeMap, 'project-info', 'Content A', uri, allMap, 2, CustomizationSource.FOLDER
            );

            expect(activeMap.has('project-info')).to.be.true;
            expect(activeMap.get('project-info')!.template).to.equal('Content A');
            expect(activeMap.get('project-info')!.sourceUris).to.deep.equal([uri]);
        });

        it('higher priority replaces lower priority', () => {
            service.testAddTemplate(
                activeMap, 'project-info', 'Low priority',
                'file:///rootA/.prompts/project-info.prompttemplate', allMap, 1, CustomizationSource.CUSTOMIZED
            );
            service.testAddTemplate(
                activeMap, 'project-info', 'High priority',
                'file:///rootB/.prompts/project-info.prompttemplate', allMap, 2, CustomizationSource.FOLDER
            );

            expect(activeMap.get('project-info')!.template).to.equal('High priority');
        });

        it('same source URI updates in place', () => {
            const uri = 'file:///rootA/.prompts/project-info.prompttemplate';
            service.testAddTemplate(activeMap, 'project-info', 'Original', uri, allMap, 2, CustomizationSource.FOLDER);
            service.testAddTemplate(activeMap, 'project-info', 'Updated', uri, allMap, 2, CustomizationSource.FOLDER);

            expect(activeMap.get('project-info')!.template).to.equal('Updated');
            expect(activeMap.get('project-info')!.sourceUris).to.deep.equal([uri]);
        });

        it('equal priority from different sources concatenates with provenance labels', () => {
            service.testAddTemplate(
                activeMap, 'project-info', 'Content A',
                'file:///rootA/.prompts/project-info.prompttemplate', allMap, 2, CustomizationSource.FOLDER
            );
            service.testAddTemplate(
                activeMap, 'project-info', 'Content B',
                'file:///rootB/.prompts/project-info.prompttemplate', allMap, 2, CustomizationSource.FOLDER
            );

            const entry = activeMap.get('project-info')!;
            expect(entry.sourceUris).to.have.lengthOf(2);
            expect(entry.template).to.contain('Content A');
            expect(entry.template).to.contain('Content B');
            expect(entry.template).to.contain('### rootA');
            expect(entry.template).to.contain('### rootB');
        });

        it('three-way merge concatenates all sources in order', () => {
            service.testAddTemplate(
                activeMap, 'project-info', 'Content A',
                'file:///rootA/.prompts/project-info.prompttemplate', allMap, 2, CustomizationSource.FOLDER
            );
            service.testAddTemplate(
                activeMap, 'project-info', 'Content B',
                'file:///rootB/.prompts/project-info.prompttemplate', allMap, 2, CustomizationSource.FOLDER
            );
            service.testAddTemplate(
                activeMap, 'project-info', 'Content C',
                'file:///rootC/.prompts/project-info.prompttemplate', allMap, 2, CustomizationSource.FOLDER
            );

            const entry = activeMap.get('project-info')!;
            expect(entry.sourceUris).to.have.lengthOf(3);
            expect(entry.template).to.contain('### rootA');
            expect(entry.template).to.contain('### rootB');
            expect(entry.template).to.contain('### rootC');
            // Verify ordering: A before B before C
            const idxA = entry.template.indexOf('Content A');
            const idxB = entry.template.indexOf('Content B');
            const idxC = entry.template.indexOf('Content C');
            expect(idxA).to.be.lessThan(idxB);
            expect(idxB).to.be.lessThan(idxC);
        });

        it('provenanceLabel extracts grandparent directory name from URI', () => {
            // For "file:///home/user/my-project/.prompts/foo.prompttemplate"
            // parent is ".prompts", grandparent is "my-project"
            const label = service.testProvenanceLabel(
                'file:///home/user/my-project/.prompts/foo.prompttemplate'
            );
            expect(label).to.equal('my-project');
        });

        it('provenanceLabel falls back to parent if grandparent is empty', () => {
            expect(service.testProvenanceLabel('file:///.prompts/foo.prompttemplate'))
                .to.equal('.prompts');
        });

        it('merged entry preserves primary sourceUri for backwards compatibility', () => {
            const uriA = 'file:///rootA/.prompts/project-info.prompttemplate';
            const uriB = 'file:///rootB/.prompts/project-info.prompttemplate';
            service.testAddTemplate(activeMap, 'project-info', 'Content A', uriA, allMap, 2, CustomizationSource.FOLDER);
            service.testAddTemplate(activeMap, 'project-info', 'Content B', uriB, allMap, 2, CustomizationSource.FOLDER);

            const entry = activeMap.get('project-info')!;
            // Primary sourceUri should be the first one added
            expect(entry.sourceUri).to.equal(uriA);
            // All sources tracked
            expect(entry.sourceUris).to.deep.equal([uriA, uriB]);
        });

        it('all map tracks each source independently', () => {
            const uriA = 'file:///rootA/.prompts/project-info.prompttemplate';
            const uriB = 'file:///rootB/.prompts/project-info.prompttemplate';
            service.testAddTemplate(activeMap, 'project-info', 'Content A', uriA, allMap, 2, CustomizationSource.FOLDER);
            service.testAddTemplate(activeMap, 'project-info', 'Content B', uriB, allMap, 2, CustomizationSource.FOLDER);

            // allCustomizations is keyed by sourceUri, so both should be present
            expect(allMap.has(uriA)).to.be.true;
            expect(allMap.has(uriB)).to.be.true;
            expect(allMap.get(uriA)!.template).to.equal('Content A');
            expect(allMap.get(uriB)!.template).to.equal('Content B');
        });
    });
});
