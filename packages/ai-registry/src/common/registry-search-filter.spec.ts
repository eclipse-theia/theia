// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { matchesRegistrySearch, meaningfulIdentifier } from './registry-search-filter';

describe('meaningfulIdentifier', () => {
    it('reduces a reverse-DNS id to its last domain label plus path', () => {
        expect(meaningfulIdentifier('com.asana/mcp')).to.equal('asana mcp');
        expect(meaningfulIdentifier('io.github.anthropics/algorithmic-art')).to.equal('anthropics algorithmic-art');
    });
    it('leaves a plain string unchanged', () => {
        expect(meaningfulIdentifier('Hugging Face')).to.equal('Hugging Face');
    });
});

describe('matchesRegistrySearch', () => {

    const asana = { name: 'com.asana/mcp', identifier: 'com.asana/mcp', description: 'Asana Rovo MCP Server' };
    const grafana = { name: 'io.github.grafana/mcp-grafana', identifier: 'io.github.grafana/mcp-grafana', description: 'An MCP server giving access to Grafana dashboards.' };
    const github = { name: 'GitHub', identifier: 'io.github.github/github-mcp-server', description: 'Connect AI assistants to GitHub.' };
    const art = { name: 'algorithmic-art', identifier: 'io.github.anthropics/algorithmic-art', description: 'Creating algorithmic art using p5.js.' };
    const slideshow = { name: 'html-slideshow-deck', identifier: 'io.github.anthropics/html-slideshow-deck', description: 'Generate decks similar to PowerPoint presentations.' };

    it('matches the exact entry for a specific query and excludes unrelated ones', () => {
        expect(matchesRegistrySearch(asana, 'asana')).to.equal(true);
        expect(matchesRegistrySearch(grafana, 'asana')).to.equal(false);
        expect(matchesRegistrySearch(github, 'asana')).to.equal(false);
    });

    it('does not match unrelated entries via the shared reverse-DNS namespace', () => {
        // `git` must not match every `io.github.*` entry.
        expect(matchesRegistrySearch(grafana, 'git')).to.equal(false);
        expect(matchesRegistrySearch(art, 'git')).to.equal(false);
        // ...but a genuine GitHub entry still matches.
        expect(matchesRegistrySearch(github, 'git')).to.equal(true);
    });

    it('matches a substring of the kebab-case name', () => {
        expect(matchesRegistrySearch(art, 'art')).to.equal(true);
    });

    it('matches a word prefix in the description', () => {
        expect(matchesRegistrySearch(slideshow, 'powerpoint')).to.equal(true);
    });

    it('does not match scattered characters across a long description', () => {
        expect(matchesRegistrySearch(art, 'pdf')).to.equal(false);
    });

    it('requires every term of a multi-word query to match', () => {
        const pptx = { name: 'pptx', identifier: 'io.github.anthropics/pptx', description: 'Create and edit PowerPoint presentations.' };
        expect(matchesRegistrySearch(pptx, 'powerpoint presentation')).to.equal(true);
        expect(matchesRegistrySearch(pptx, 'powerpoint spreadsheet')).to.equal(false);
    });

    it('treats an empty query as a match', () => {
        expect(matchesRegistrySearch(asana, '   ')).to.equal(true);
    });
});
