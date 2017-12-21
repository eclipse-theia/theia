import { expect } from "chai"
import { TopPanelMain } from "./topPanelMain"

describe('theia top panel elements loading', () => {

    let topPanelMain: TopPanelMain;

    before(() => {

        topPanelMain = new TopPanelMain();
    });

    /*
    * Test on File menu
    */

    it('Click on File to show sub-menu', () => {
        expect(topPanelMain.displaySubmenu()).to.be.true;
    })

    it('File -> Open New Terminal', () => {
        expect(topPanelMain.fileNewTerminalOpens()).to.be.true;
    });

    it('File -> Close New Terminal', () => {
        expect(topPanelMain.fileNewTerminalCloses()).to.be.false;
    });

    it('File -> Click on View an then Open Problem View', () => {
        expect(topPanelMain.clickOpenProblemsView()).to.be.true;
    })

    it('File -> Click on Open...', () => {
        expect(topPanelMain.clickOpen()).to.be.true;
    });


});