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
import {
    SKILL_FILE_NAME,
    SkillDescription,
    isValidSkillName,
    validateSkillDescription
} from './skill';

describe('Skill Types', () => {

    describe('SKILL_FILE_NAME', () => {
        it('should be SKILL.md', () => {
            expect(SKILL_FILE_NAME).to.equal('SKILL.md');
        });
    });

    describe('isValidSkillName', () => {
        it('should accept simple lowercase names', () => {
            expect(isValidSkillName('skill')).to.be.true;
        });

        it('should accept kebab-case names', () => {
            expect(isValidSkillName('my-skill')).to.be.true;
        });

        it('should accept names with digits', () => {
            expect(isValidSkillName('skill1')).to.be.true;
            expect(isValidSkillName('my-skill-2')).to.be.true;
            expect(isValidSkillName('1skill')).to.be.true;
        });

        it('should accept multi-part kebab-case names', () => {
            expect(isValidSkillName('my-awesome-skill')).to.be.true;
        });

        it('should reject uppercase letters', () => {
            expect(isValidSkillName('MySkill')).to.be.false;
            expect(isValidSkillName('SKILL')).to.be.false;
        });

        it('should reject leading hyphens', () => {
            expect(isValidSkillName('-skill')).to.be.false;
        });

        it('should reject trailing hyphens', () => {
            expect(isValidSkillName('skill-')).to.be.false;
        });

        it('should reject consecutive hyphens', () => {
            expect(isValidSkillName('my--skill')).to.be.false;
        });

        it('should reject spaces', () => {
            expect(isValidSkillName('my skill')).to.be.false;
        });

        it('should reject underscores', () => {
            expect(isValidSkillName('my_skill')).to.be.false;
        });

        it('should reject empty strings', () => {
            expect(isValidSkillName('')).to.be.false;
        });
    });

    describe('SkillDescription.is', () => {
        it('should return true for valid SkillDescription', () => {
            const valid: SkillDescription = {
                name: 'my-skill',
                description: 'A test skill'
            };
            expect(SkillDescription.is(valid)).to.be.true;
        });

        it('should return true for SkillDescription with optional fields', () => {
            const valid: SkillDescription = {
                name: 'my-skill',
                description: 'A test skill',
                license: 'MIT',
                compatibility: '>=1.0.0',
                metadata: { author: 'Test' },
                allowedTools: ['tool1', 'tool2']
            };
            expect(SkillDescription.is(valid)).to.be.true;
        });

        it('should return false for undefined', () => {
            expect(SkillDescription.is(undefined)).to.be.false;
        });

        it('should return false for null', () => {
            // eslint-disable-next-line no-null/no-null
            expect(SkillDescription.is(null)).to.be.false;
        });

        it('should return false for non-objects', () => {
            expect(SkillDescription.is('string')).to.be.false;
            expect(SkillDescription.is(123)).to.be.false;
            expect(SkillDescription.is(true)).to.be.false;
        });

        it('should return false when name is missing', () => {
            expect(SkillDescription.is({ description: 'A skill' })).to.be.false;
        });

        it('should return false when description is missing', () => {
            expect(SkillDescription.is({ name: 'my-skill' })).to.be.false;
        });

        it('should return false when name is not a string', () => {
            expect(SkillDescription.is({ name: 123, description: 'A skill' })).to.be.false;
        });

        it('should return false when description is not a string', () => {
            expect(SkillDescription.is({ name: 'my-skill', description: 123 })).to.be.false;
        });
    });

    describe('SkillDescription.equals', () => {
        it('should return true for equal names', () => {
            const a: SkillDescription = { name: 'skill', description: 'Description A' };
            const b: SkillDescription = { name: 'skill', description: 'Description B' };
            expect(SkillDescription.equals(a, b)).to.be.true;
        });

        it('should return false for different names', () => {
            const a: SkillDescription = { name: 'skill-a', description: 'Same description' };
            const b: SkillDescription = { name: 'skill-b', description: 'Same description' };
            expect(SkillDescription.equals(a, b)).to.be.false;
        });
    });

    describe('validateSkillDescription', () => {
        it('should return empty array for valid skill description', () => {
            const description: SkillDescription = {
                name: 'my-skill',
                description: 'A valid skill description'
            };
            const errors = validateSkillDescription(description, 'my-skill');
            expect(errors).to.be.empty;
        });

        it('should return error when name does not match directory name', () => {
            const description: SkillDescription = {
                name: 'my-skill',
                description: 'A skill'
            };
            const errors = validateSkillDescription(description, 'other-directory');
            expect(errors).to.include("Skill name 'my-skill' must match directory name 'other-directory'");
        });

        it('should return error for invalid name format', () => {
            const description: SkillDescription = {
                name: 'My-Skill',
                description: 'A skill'
            };
            const errors = validateSkillDescription(description, 'My-Skill');
            expect(errors.some(e => e.includes('must be lowercase kebab-case'))).to.be.true;
        });

        it('should return error when description exceeds maximum length', () => {
            const description: SkillDescription = {
                name: 'my-skill',
                description: 'x'.repeat(1025)
            };
            const errors = validateSkillDescription(description, 'my-skill');
            expect(errors.some(e => e.includes('exceeds maximum length'))).to.be.true;
        });

        it('should return error when name is not a string', () => {
            const description = {
                name: 123,
                description: 'A skill'
            } as unknown as SkillDescription;
            const errors = validateSkillDescription(description, 'my-skill');
            expect(errors).to.include('Skill name must be a string');
        });

        it('should return error when description is not a string', () => {
            const description = {
                name: 'my-skill',
                description: 123
            } as unknown as SkillDescription;
            const errors = validateSkillDescription(description, 'my-skill');
            expect(errors).to.include('Skill description must be a string');
        });

        it('should return multiple errors when multiple validations fail', () => {
            const description: SkillDescription = {
                name: 'Invalid_Name',
                description: 'x'.repeat(1025)
            };
            const errors = validateSkillDescription(description, 'wrong-dir');
            expect(errors.length).to.be.greaterThan(1);
        });

        it('should accept description at exactly maximum length', () => {
            const description: SkillDescription = {
                name: 'my-skill',
                description: 'x'.repeat(1024)
            };
            const errors = validateSkillDescription(description, 'my-skill');
            expect(errors).to.be.empty;
        });
    });
});
