/*
    main.js
    this boots the application
*/
import * as Config from '../config/applicationConfig.js';
import { NSCAN5_Application } from './NASH_App.js';

// when the document is ready, make an instance of the app and start bootin'
document.addEventListener("DOMContentLoaded", (evt) => {

    // get an instance of the app
    const NASH = new NASH_App({ config: Config });

    // --> REMOVE BEFORE FLIGHT <--
    window.app = NASH;


    NASH.startup().then((appData) =>{
        // do some thangs
        NASH.log(`startup complete`);
    }).catch((error) => {
        // something bad happened! crash it!
        console.log(`can't start app?: ${error}`);
    });

});
