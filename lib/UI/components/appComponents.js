/*
    appComponents.js
    Amy Hicox 12/9/24

    get various UIs for use in the app
*/
import { isNull, isNotNull, epochTimestamp } from '../../noice/noiceCore.js';
import { wcBasic } from '../../noice/webComponents/wcBasic.js';
import { wcFormElement } from '../../noice/webComponents/wcFormElement.js';
import { wcPieChart } from '../../noice/webComponents/wcPieChart.js';
import { alignFormElementLabels } from '../../formViewFunctions.js';




/*
    getLoginUI(userList, loginCallback, successCallback)
    basically the guts of auth.js
    userList is an array of objects of the form:
    { location: <str>, fullName: <str>, id: <str> }
*/
function getLoginUI(userList, loginCallback, successCallback){

    return(new wcBasic({
        content: `<div class="appLoginUI" data-_name="main">
            <div class="gfx">
                &nbsp;
            </div>
            <div class="info" data-_name="infoSection">
                <wc-form-element type="select" data-_name="user_id" label="user" label_position="left" capture_value_on="change"></wc-form-element>
                <wc-form-element type="password" data-_name="pass" label="password" label_position="left" capture_value_on="focusoutOrReturn"></wc-form-element>
                <button data-_name="btnLogin">Log In</button>
            </div>
        </div>`,
        styleSheet: `
            div[data-_name="main"] {
                display: grid;
                place-items: center;
                width: 100%;
                height: 100%;
                overflow: hidden;
                grid-template-columns: 1fr 1fr;
            }
            span[data-hide="true"]{
                display: none;
            }
            div.gfx {
                background: var(--theme-burger-icon-scanner-gfx);
                background-size: contain;
                background-repeat: no-repeat;
                background-position: center;
                width: 100%;
                height: 100%;
            }
            div.info {
                display: grid;
                width:min-content;
                max-height: 100%;
                overflow-y: auto;
                border-left: .128em solid var(--theme-default-foreground-color-light);
            }
            wc-form-element {
                margin: .25em;
            }
            button[data-_name="btnLogin"]{
                font-size: 1em;
                width: max-content;
                justify-self: right;
                margin-right: .25em;
                margin-top: .5em;
                font-family: var(--theme-control-font);
            }
        `,
        initializedCallback: (slf) => {

            // populate the dropdown
            let optionTree = {};
            userList.forEach((user) => {
                if (!(optionTree.hasOwnProperty(user.location))){ optionTree[user.location] = []; }
                optionTree[user.location].push(user.fullName);
            });
            slf._elements.user_id.setOptions(optionTree);

            // align the formElements
            alignFormElementLabels(slf._elements.infoSection);

            // hookup the carriage return on the password field
            slf._elements.pass.capture_value_on = 'return';
            slf._elements.pass.captureValueCallback = (val, el) => {
                if (isNotNull(val)){ slf._elements.btnLogin.click(); }
            }

            // hookup the button to the callback
            slf._elements.btnLogin.addEventListener('click', (evt) => {
                slf._elements.btnLogin.disabled = true;

                // get the selected user
                const usr = userList.filter((a) => {return(a.fullName == slf._elements.user_id.value)})[0];
                if (usr instanceof Object){
                    slf._elements.pass.message_is_error = false;
                    slf._elements.pass.message = '';
                    loginCallback(usr, slf._elements.pass.value).then(() => {

                        // login success
                        slf._elements.pass.message_is_error = false;
                        slf._elements.pass.message = `current user: ${usr.fullName}`;
                        if (successCallback instanceof Function){ successCallback(); }

                    }).catch((error) => {

                        // login failed
                        slf._elements.pass.message_is_error = true;
                        slf._elements.pass.message = error;
                        slf._elements.btnLogin.disabled = false;

                    });
                }
            });
        }
    }));
}




/*
    getThreadStatusUI(syncImmediateCallback)
    the UI for catching 'statusUpdate' from arsSyncWorker thread
    if syncImmediateCallback is given hook it up to the sync now button
    if it isn't don't show the sync now button
*/
function getThreadStatusUI(syncImmediateCallback){
    return(new wcBasic({
        content: `<div class="appInfoDialogContent" data-_name="main">
            <div class="pieCtr">
                <wc-pie-chart size="5.5em" data-_name="pie"></wc-pie-chart>
                <button data-_name="btnForceSync">sync now</button>
            </div>
            <div class="info">
                <span class="message" data-_name="message"></span>
                <span class="detail" data-_name="detail"></span>
                <span class="additionalDetail" data-_name="additionalDetail"></span>
            </div>
        </div>`,
        styleSheet: `
            div[data-_name="main"] {
                display: grid;
                place-items: center;
                width: 100%;
                height: 100%;
                overflow: hidden;
                grid-template-columns: 9em auto;
            }
            div[data-_name="main"][data-error="true"] div.info span.message {
                color: rgb(230, 0, 161);
            }
            div[data-_name="main"][data-error="true"] div.pieCtr {
                width: 66%;
                height: 100%;
                background: url('./gfx/warning_icon_fuscia.svg');
                background-repeat: no-repeat;
                background-position: center;
                background-size: auto;

            }
            div[data-_name="main"][data-error="true"] div.pieCtr wc-pie-chart {
                display: none;
            }
            span[data-hide="true"]{
                display: none;
            }
            div.pieCtr {
                display: grid;
            }
            div.info {
                display: grid;
                align-content: center;
                width: 100%;
                min-height: 9.5em;
                max-height: 100%;
                overflow-y: auto;
                border-left: .128em solid var(--theme-default-foreground-color-light);
            }
            div.info span {
                margin: .5em;
            }
            div.info span.message {
                font-weight: bolder;
                font-size: 1.128em;
            }
            div.info span.additionalDetail {
                font-style: italic;
            }
            div[data-_name="main"][data-run_animation="true"]:not([data-error="true"]) div.pieCtr:before{
                content: '';
                display: block;
                width: 6em;
                height: 6em;
                position: absolute;
                z-index: 1;
                background: var(--theme-burger-icon-refresh-gfx);
                background-color: var(--wc-balloon-dialog-content-background-color, rgb(30, 32, 33));
                background-size: contain;
                background-position: center;
                background-repeat: no-repeat;
                animation: pathRotator 4s linear infinite;
            }
            button[data-_name="btnForceSync"] {
                width: max-content;
                justify-self: center;
                display: none;
                font-family: var(--theme-control-font);
                background-color: var(--theme-highlight-color);
                color: var(--wc-balloon-dialog-header-text-color);
                border-radius: var(--theme-standard-radius-large);
                border-color:transparent;
                z-index: 4;
            }
            button[data-_name="btnForceSync"]:active {
                background-color: var(--theme-button-background);
            }
            button[data-_name="btnForceSync"]:disabled {
                background-color: var(--theme-button-background);
                opacity: .5;
                filter: grayscale(.9);
            }
            div[data-_name="main"][data-idle="true"] div.pieCtr button[data-_name="btnForceSync"] {
                display: block;
            }
            @keyframes pathRotator {
                0% { transform: rotate(0deg) }
                100% { transform: rotate(360deg) }
            }
        `,
        initializedCallback: (slf) => {

            // add charts to the pie
            slf._elements.pie.addChart({ name: 'network', chart_color:'rgba(6, 133, 135, .66)', value: 0 });
            slf._elements.pie.addChart({ name: 'timer', chart_color:'rgba(242, 177, 52, .25)', value: 0 });
            slf._elements.pie.addChart({ name: 'error', chart_color:'rgba(190, 57, 57, .66)', value: 0 });

            // a function to update the ui
            slf._lastUpdate = 0;
            slf._idle = false;
            slf.update = (data) => {

                // handle text updates
                ['message', 'detail', 'additionalDetail'].forEach((a) => {
                    slf._elements[a].textContent = ((data instanceof Object) && data.hasOwnProperty(a) && isNotNull(data[a]))?data[a]:'';
                    slf._elements[a].dataset.hide = isNull(slf._elements[a].textContent);
                });

                // handle error indicator
                slf._elements.main.dataset.error = (data.hasOwnProperty('error') && (data.error == true));

                // hanle idle indicator
                slf._elements.main.dataset.idle = slf._idle = (data.hasOwnProperty('idle') && (data.idle == true));

                // handle run_animation
                slf._elements.main.dataset.run_animation = (data.hasOwnProperty('runAnimation') && (data.runAnimation == true));

                // handle pie chart updates
                if (data.hasOwnProperty('updatePieCharts') && (data.updatePieCharts instanceof Array)){
                    data.updatePieCharts.forEach((a)=> { slf._elements.pie.updateChart((a.name == "database")?'main':a.name, a.value); });
                }

                // reset idle timer pie chart if we aren't idle
                if (! (slf.hasOwnProperty('_idle') && (slf._idle == true))){ slf._elements.pie.updateChart('timer', 0); }

                slf._lastUpdate = epochTimestamp();
            };

            // hook for the "sync now" button
            if (syncImmediateCallback instanceof Function){
                slf._elements.btnForceSync.addEventListener('click', (evt) => {
                    slf._elements.btnForceSync.disabled = true;
                    syncImmediateCallback().then(() => { slf._elements.btnForceSync.disabled = false; });
                });
            }else{
                slf._elements.btnForceSync.style.display = "none";
            }
        }
    }))
}




export { getLoginUI, getThreadStatusUI };
