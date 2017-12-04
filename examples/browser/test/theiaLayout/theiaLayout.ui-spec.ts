import { expect } from "chai"
import { TheiaLayoutMain } from "./theiaLayoutMain"

describe('theia left panel elements loading', () => {

    let theiaLayoutMain: TheiaLayoutMain;

    before(() => {

        theiaLayoutMain = new TheiaLayoutMain();
    });

    it('theia file panels are loaded', () => {
        expect(theiaLayoutMain.loadFilePanels()).to.be.true;
    });

    it('no sub menu in left tab is active on load', () => {
        expect(theiaLayoutMain.leftMenuTabShows(2)).to.be.false;
        expect(theiaLayoutMain.leftMenuTabShows(3)).to.be.false;
    });

    it('Files opens a workspace', () => {
        expect(theiaLayoutMain.workspaceExists()).to.be.true;
    });

    it('Git container opens', () => {
        expect(theiaLayoutMain.gitContainer()).to.be.true;
    });

    it('Extensions container opens', () => {
        expect(theiaLayoutMain.extensionsContainer()).to.be.true;
    });

    it('theia top panels are loaded', () => {
        theiaLayoutMain.loadTopPanel();
    });

    it('no sub menu tab is not active on load', () => {
        expect(theiaLayoutMain.topMenuTabShows(1)).to.be.false;
        expect(theiaLayoutMain.topMenuTabShows(2)).to.be.false;
        expect(theiaLayoutMain.topMenuTabShows(3)).to.be.false;
        expect(theiaLayoutMain.topMenuTabShows(4)).to.be.false;
    });

    it('submenus are loaded', () => {
        expect(theiaLayoutMain.topMenuShowing(1)).to.be.true;
        expect(theiaLayoutMain.topMenuShowing(2)).to.be.true;
        expect(theiaLayoutMain.topMenuShowing(3)).to.be.true;
        expect(theiaLayoutMain.topMenuShowing(4)).to.be.true;
    });

});