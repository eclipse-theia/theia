//import { assert } from "chai"
import { expect } from "chai"
import { MainPage } from "./pages/main-page"
//import { Client } from "webdriverio"

describe('theia main elements loading', () => {

    let mainPage: MainPage;

    before(() => {

        mainPage = new MainPage();
    });

    it('theia panels are loaded', () => {
        mainPage.loadPanels();
    });

    it('theia file panels are loaded', () => {
        expect(mainPage.loadFilePanels()).to.be.false;
    });

    it('theia submenus are loaded', () => {
        expect(mainPage.subMenuShowing()).to.be.false;
    });
});