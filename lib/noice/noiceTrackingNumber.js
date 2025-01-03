/*
    noiceTrackingNumber.js
    a noice2 module for stuff we need to deal with tracking numbers
    deconstructed from coreUITrackingNumber.js (noice 1)
*/
import { noiceObjectCore, noiceCoreUtility} from './noiceCore.js';

class noiceTrackingNumber extends noiceCoreUtility {




/*
    constructor
*/
constructor(args, defaults, callback){
    super(args, noiceObjectCore.mergeClassDefaults({
        _version:               1,
        _className:             'noiceTrackingNumber',
        logger:                 null
    },defaults),callback);

    // call up the regex national guard!
    this.getRegexArmy();
}




/*
    log(str)
    NOTE: we should seriously implement logging this way from now on
*/
log(str){
    let that = this;
    let func = (that.logger instanceof Function)?that.logger:console.log;
    func(`${that._className} v${that._version} | ${str}`);
}




/*

    getAddItemUI(, poNumberList, manufacturerList, poNumber, prrNumber, manufacturer)
    returns an object of this form:
    {
        DOMElement: <element>,
        formElements: {formElement references},
        buttons: {save: <button>, cancel: <button>}
    }
    args is an object of this form:
    {
        trackingNumberStr: <str (current value of field)>
        poNumberList: <obj {<poNumber>: [<prrNumber>, ...]}>
        manufacturerList: <array of values for manufacturer menu>
        poNumber: <str> if specified, default value of poNumber field
        prrNumber: <str> if specified, default value of prrNumber field
        manufacturer: <str> if specified, default value of manufacturer field
        closeCallback: <function(bool)> called after save or on cancel function's bool gets true if actually saved
    }
*/
getAddItemUI(args){

    let that = this;
    let div = document.createElement('div');
    div.className = "noiceTrackingNumberUI";
    let out = {
        DOMElement: div,
        formElements: {},
        buttons: {}
    };

    div.insertAdjacentHTML('afterbegin', `
        <div class="trackingNumberFrame"></div>
        <div class="messageFrame"><span>
            this is a new Tracking Number. To use it, complete Check-In by entering values for
            <strong>Carrier</strong>, <strong>PO Number</strong>, <strong>Item Count</strong>
            and <strong>Manufacturer</strong> below then touch the <strong>save</strong> button.</span>
        </div>
        <div class="fieldFrame"></div>
        <div class="btnContainer">
            <button class="btnCancel">cancel</button>
            <button class="btnSave" disabled>save</button>
        </div>
    `);

    // insert the parsed tracking number
    div.querySelector('div.trackingNumberFrame').appendChild(that.parseTrackingNumber(args.hasOwnProperty('trackingNumberStr')?args.trackingNumberStr:''));
    out.value = div.querySelector('div.trackingNumberFrame').textContent;

    // insert the formElements (NOTE: we need to modularize noiceCoreUIFormElement -- someday but not today)

    // carrier field (required)
    let knownCarriers = {};
    Object.keys(that.strTypes).map((a) => {return(that.strTypes[a].carrier)}).forEach((a) => { knownCarriers[a] = null; });
    out.formElements.carrier = new noiceCoreUIFormElementInput({
        id: 8,
        name: 'carrier',
        maxLength: 254,
        label: 'Carrier',
        labelLocation: 'left',
        valueLength: 'auto',
        xssFilterEnable: true,
        values: Object.keys(knownCarriers),
        nullable: false,
        normalizeUpperCase: true,
        valueChangeCallback: function(n,o,s){ return(that.addItemUIFieldChange(n,o,s,args, out)); }
    }).append(div.querySelector('div.fieldFrame'));

    // po number field
    out.formElements.poNumber = new noiceCoreUIFormElementInput({
        id: 260100023,
        name: 'poNumber',
        maxLength: 64,
        label: 'PO Number',
        labelLocation: 'left',
        valueLength: 'auto',
        xssFilterEnable: true,
        values: Object.keys((args.poNumberList instanceof Object)?args.poNumberList:{}),
        nullable: false,
        normalizeUpperCase: true,
        value: (args.hasOwnProperty('poNumber') &&that.isNotNull(args.poNumber))?args.poNumber:'',
        valueChangeCallback: function(n,o,s){ return(that.addItemUIFieldChange(n,o,s,args, out)); }
    }).append(div.querySelector('div.fieldFrame'));

    // prr number (note values will need to be set from addItemUIFieldChange)
    out.formElements.prrNumber = new noiceCoreUIFormElementInput({
        id: 200000020,
        name: 'prrNumber',
        maxLength: 64,
        label: 'PRR Number',
        labelLocation: 'left',
        valueLength: 'auto',
        xssFilterEnable: true,
        enable: true,
        normalizeUpperCase: true,
        value: (args.hasOwnProperty('prrNumber') && that.isNotNull(args.prrNumber))?args.prrNumber:'',
        valueChangeCallback: function(n,o,s){ return(that.addItemUIFieldChange(n,o,s,args, out)); }
    }).append(div.querySelector('div.fieldFrame'));

    // num items field
    out.formElements.numItems = new noiceCoreUIFormElementNumber({
        id: 1234560124,
        name: 'itemCount',
        label: 'Item Count',
        labelLocation: 'left',
        valueLength: 'auto',
        xssFilterEnable: true,
        value: (args.hasOwnProperty('quantity') && that.isNotNull(args.quantity))?args.quantity:0,
        step: 1,
        min: 0,
        max: (args.hasOwnProperty('quantity') && that.isNotNull(args.quantity))?args.quantity:null,
        valueChangeCallback: function(n,o,s){ return(that.addItemUIFieldChange(n,o,s,args, out)); }
    }).append(div.querySelector('div.fieldFrame'));

    // manufacturer field
    out.formElements.manufacturer = new noiceCoreUIFormElementInput({
        id: 240001003,
        name: 'manufacturer',
        maxLength: 254,
        label: 'Manufacturer',
        labelLocation: 'left',
        valueLength: 'auto',
        xssFilterEnable: true,
        values: (args.manufacturerList instanceof Array)?args.manufacturerList:[],
        normalizeUpperCase: true,
        value: (args.hasOwnProperty('manufacturer') && that.isNotNull(args.manufacturer))?args.manufacturer:'',
        valueChangeCallback: function(n,o,s){ return(that.addItemUIFieldChange(n,o,s,args, out)); }
    }).append(div.querySelector('div.fieldFrame'));

    // hooks for buttons
    out.buttons.save = div.querySelector('button.btnSave');
    out.buttons.save.addEventListener('click', (evt) => {
        out.buttons.save.disabled = true;
        that.handleAddItemUISave(out).then((b) => {
            out.buttons.save.disabled = false;
            if (args.closeCallback instanceof Function){ args.closeCallback(b); }
        });
    })
    out.buttons.cancel = div.querySelector('button.btnCancel');
    out.buttons.cancel.addEventListener('click', (evt) => {
        out.buttons.cancel.disabled = true;
        that.handleAddItemUICancel().then(() => {
            out.buttons.cancel.disabled = false;
            if (args.closeCallback instanceof Function){ args.closeCallback(false); }
        });
    });

    return(out);
}




/*
    addItemUIFieldChange(newValue, oldValue, fieldSelf)
    valueChangeCallback() for the formElements in the addItemUI
*/
addItemUIFieldChange(newValue, oldValue, fieldSelf, args, out){
    let that = this;

    // handle poNumber->prrNumber menu cascade
    if ((newValue != oldValue) && (fieldSelf.name == "poNumber")){
        // sigh -- old school noiceCoreUIFormElement is such a pain ...
        requestAnimationFrame(() => {
            if (
                (out instanceof Object) &&
                (out.formElements instanceof Object) &&
                (out.formElements.prrNumber instanceof Object)
            ){
                out.formElements.prrNumber.values = (
                    (args.poNumberList instanceof Object) &&
                    (args.poNumberList[newValue] instanceof Object)
                )?Object.keys(args.poNumberList[newValue]):[];
                if (
                    that.isNotNull(out.formElements.prrNumber.value) &&
                    (out.formElements.prrNumber.values.indexOf(out.formElements.prrNumber.value) < 0)
                ){
                    out.formElements.prrNumber.value = '';
                }
            }
        });
    }

    window.requestAnimationFrame(() => {
        out.buttons.save.disabled = (that.isNull(out.formElements.carrier.value) || that.isNull(out.formElements.poNumber.value));
    });

    return(newValue);
}




/*
    handleAddItemUISave(addItemUI)
    click handler for the save button on the addItemUI
*/
handleAddItemUISave(addItemUI){
    let that = this;
    return(new Promise((toot, boot) => {

        /*
            basically -- I'm trusting the user on this one
            ProVM is such a crap datafeed there's far more that
            aren't in there than otherwise. Ain't no reason
            for the validation hassle.

            is the save button unlocked? ok let's go lol
        */
        let o = {
            entryId: that.getGUID(),
            __transaction: 'create',
            __transactionDate: that.epochTimestamp()
        };
        ['carrier', 'poNumber', 'prrNumber', 'numItems', 'manufacturer'].forEach((f) => {
            o[addItemUI.formElements[f].id] = addItemUI.formElements[f].value;
        });
        that._app.setARSFormFieldValueByName('NPAM:NSCAN2:TrackingNumberRegistry', 'Submitter', that._app.registeredUser.registeredUserAUID, o);
        that._app.setARSFormFieldValueByName('NPAM:NSCAN2:TrackingNumberRegistry', 'Center', that._app.registeredUser.registeredUserCenter, o);
        that._app.setARSFormFieldValueByName('NPAM:NSCAN2:TrackingNumberRegistry', 'Tracking Number', addItemUI.value, o);
        that._app.setARSFormFieldValueByName('NPAM:NSCAN2:TrackingNumberRegistry', 'Status', 'open', o);
        that._app.setARSFormFieldValueByName('NPAM:NSCAN2:TrackingNumberRegistry', 'Received Date', o.__transactionDate, o);
        let dbRow = that._app.convertARSFieldIDsToFormRow('NPAM:NSCAN2:TrackingNumberRegistry', o);

        that._app.inventoryDB.put({
            storeName: 'trackingNumberRegistry',
            object: dbRow
        }).then(() => {
            toot(true);
        }).catch((error) => {
            that.log(`${that._className} v${that._version} } | handleAddItemUISave() | indexedDB.put() failed: ${error}`);
            boot(error);
        });
    }));
}




/*
    handleAddItemUICancel()
    click handler for the save button on the addItemUI
*/
handleAddItemUICancel(){
    let that = this;
    return(new Promise((toot, boot) => {

        // placeholder
        console.log('handleAddItemUICancel() called');
        toot(false);
    }));
}




/*
    parseTrackingNumber(str)

    as you might expect, there's really not a standard for tracking numbers and carriers
    don't really publish their formats. Like, this is the best I can really do with
    what I can find on the internet and it is what it is. It's not the end of the world
    if we can't parse it or auto-identify the carrier.

    but if we can, it is a pretty damn cool trick. s'holmybeera'ight?.
*/
parseTrackingNumber(str){
    let that = this;
    let match = null;
    Object.keys(that.strTypes).forEach((strName) => {
        if (that.isNull(match) && that.strTypes[strName].rgx.test(str)){ match = strName; }
    });
    if (that.isNotNull(match) && (that.strTypes[match].formatter instanceof Function)){
        return(that.strTypes[match].formatter(str));
    }else{
        let div = document.createElement('div');
        div.className = "trackingNumber";
        div.dataset.strType = 'unknown';
        div.textContent = str;
        return(div);
    }
}



/*
    getRegexArmy()
    this is purely for code cleanliness, otherwise it'd all be in the constructor.
    behold! my army of regular expressions for identifying & parsing tracking numbers

    mostly based on info I found here:
    https://andrewkurochkin.com/blog/code-for-recognizing-delivery-company-by-track
*/
getRegexArmy(){
    let that = this;

    // new optional size sequence hotness
    function stringChopper(str, size, rev){
        let out = [];
        let buf = [];
        let arr = `${str}`.split('');
        if (rev == true){ arr = arr.reverse(); }

        let sizeSequence = [];
        let sizeSequencePtr = 0;
        if (size instanceof Array){
            sizeSequence = size;
        }else{
            sizeSequence.push(size);
        }

        arr.forEach((char, idx) => {
            buf.push(char);
            if ((buf.length == parseInt(sizeSequence[sizeSequencePtr])) || ((idx + 1) == arr.length)) {
                if (rev == true){ buf = buf.reverse(); }
                out.push(buf.join(''));
                buf = [];
                if (size instanceof Array){ sizeSequencePtr += 1; }
            }
        });
        if (rev == true){ out = out.reverse(); }
        return(out);
    }

    this.strTypes = {

        // order matters, these are ordered. ES6 orders hash keys now, hallelu!

        usps_d22: {
            rgx: /^(94|93|92|94|95)([0-9]{22})$/,
            length: 24,
            carrier: 'USPS',
            formatter: (str) => {
                let div = document.createElement('div');
                div.className = "trackingNumber";
                div.dataset.strType = 'usps_d22';
                div.dataset.carrier = "USPS";
                try {
                    let match = `${str}`.match(/^(94|93|92|94|95)([0-9]{22})$/);
                    let spans = stringChopper(match[2], 4);
                    div.insertAdjacentHTML('afterbegin', `
                        <span class="prefix">${match[1]}</span>${spans.map((a) => {return(`<span class="strGroup">${a}</span>`)}).join('')}
                    `);
                }catch(e){
                    that.log(`getRegexArmy() | usps_d22 formatter threw unexpectedly: ${e}`);
                    div.textContent = str;
                }
                return(div);
            }
        },

        usps_d20: {
            rgx: /^(94|93|92|94|95)([0-9]{20})$/,
            length: 22,
            carrier: 'USPS',
            formatter: (str) => {
                let div = document.createElement('div');
                div.className = "trackingNumber";
                div.dataset.strType = 'usps_d20';
                div.dataset.carrier = "USPS";
                try {
                    let match = `${str}`.match(/^(94|93|92|94|95)([0-9]{20})$/);
                    let spans = stringChopper(match[2], 4);
                    div.insertAdjacentHTML('afterbegin', `
                        <span class="prefix">${match[1]}</span>${spans.map((a) => {return(`<span class="strGroup">${a}</span>`)}).join('')}
                    `);
                }catch(e){
                    that.log(`getRegexArmy() | usps_d20 formatter threw unexpectedly: ${e}`);
                    div.textContent = str;
                }
                return(div);
            }
        },

        usps_d14: {
            rgx: /^(70|14|23|03)[0-9]{14}$/,
            length: 16,
            carrier: 'USPS',
            formatter: (str) => {
                let div = document.createElement('div');
                div.className = "trackingNumber";
                div.dataset.strType = 'usps_d14';
                div.dataset.carrier = "USPS";
                try {
                    let match = `${str}`.match(/^(70|14|23|03)([0-9]{14})$/);
                    let spans = stringChopper(match[2], 4);
                    div.insertAdjacentHTML('afterbegin', `
                        <span class="prefix">${match[1]}</span>${spans.map((a) => {return(`<span class="strGroup">${a}</span>`)}).join('')}
                    `);
                }catch(e){
                    that.log(`getRegexArmy() | usps_d14 formatter threw unexpectedly: ${e}`);
                    div.textContent = str;
                }
                return(div);
            }
        },

        usps_a2:  {
            rgx: /^([A-Z]{2})([0-9]{9})([A-Z]{2})$/,
            length: 13,
            carrier: 'USPS',
            formatter: (str) => {
                let div = document.createElement('div');
                div.className = "trackingNumber";
                div.dataset.strType = 'usps_a2';
                div.dataset.carrier = "USPS";
                try {
                    let match = `${str}`.match(/^([A-Z]{2})([0-9]{9})([A-Z]{2})$/);
                    let spans = stringChopper(match[2], 3);
                    div.insertAdjacentHTML('afterbegin', `
                        <span class="prefix">${match[1]}</span>${spans.map((a) => {return(`<span class="strGroup">${a}</span>`)}).join('')}<span class="postfix">${match[3]}</span>
                    `);
                }catch(e){
                    that.log(`getRegexArmy() | usps_a2 formatter threw unexpectedly: ${e}`);
                    div.textContent = str;
                }
                return(div);
            }
        },

        usps_m8:  {
            rgx: /^(M0|82)([0-9]{8})$/,
            length: 10,
            carrier: 'USPS',
            formatter: (str) => {
                let div = document.createElement('div');
                div.className = "trackingNumber";
                div.dataset.strType = 'usps_m8';
                div.dataset.carrier = "USPS";
                try {
                    let match = `${str}`.match(/^(M0|82)([0-9]{8})$/);
                    let spans = stringChopper(match[2], 4);
                    div.insertAdjacentHTML('afterbegin', `
                        <span class="prefix">${match[1]}</span>${spans.map((a) => {return(`<span class="strGroup">${a}</span>`)}).join('')}
                    `);
                }catch(e){
                    that.log(`getRegexArmy() | usps_m8 formatter threw unexpectedly: ${e}`);
                    div.textContent = str;
                }
                return(div);
            }
        },

        ups_1z:   {
            rgx: /^(1Z)([0-9A-Z]{16})$/i,
            length: 18,
            carrier: 'UPS',
            formatter: (str) => {
                let div = document.createElement('div');
                div.className = "trackingNumber";
                div.dataset.strType = 'ups_1z';
                div.dataset.carrier = "UPS";
                try {
                    let match = `${str}`.match(/^(1Z)([0-9A-Z]{16})$/i);
                    let spans = stringChopper(match[2], [3,3,2,4,4]);

                    div.insertAdjacentHTML('afterbegin', `<span class="prefix">${match[1]}</span>${spans.map((s, i, a) => {
                        return(`<span class="strGroup ${(i >= (a.length - 2))?'postfix':''}">${s}</span>`);
                    }).join('')}`);
                }catch(e){
                    that.log(`getRegexArmy() | ups_1z formatter threw unexpectedly: ${e}`);
                    div.textContent = str;
                }
                return(div);
            }
        },

        ups_t:    {
            rgx: /^(T)+([0-9A-Z]{10})$/,
            length: 11,
            carrier: 'UPS',
            formatter: (str) => {
                let div = document.createElement('div');
                div.className = "trackingNumber";
                div.dataset.strType = 'ups_t';
                div.dataset.carrier = "UPS";
                try {
                    let match = `${str}`.match(/^(T)+([0-9A-Z]{10}$)/);
                    let spans = stringChopper(match[2], 5);
                    div.insertAdjacentHTML('afterbegin', `
                        <span class="prefix">${match[1]}</span>${spans.map((a) => {return(`<span class="strGroup">${a}</span>`)}).join('')}
                    `);
                }catch(e){
                    that.log(`getRegexArmy() | ups_t formatter threw unexpectedly: ${e}`);
                    div.textContent = str;
                }
                return(div);
            }
        },

        ups_d9:   {
            rgx: /^([0-9]{9})$/,
            length: 9,
            carrier: 'UPS',
            formatter: (str) => {
                let div = document.createElement('div');
                div.className = "trackingNumber";
                div.dataset.strType = 'ups_d9';
                div.dataset.carrier = "UPS";
                try {
                    let match = `${str}`.match(/^([0-9]{9})$/);
                    let spans = stringChopper(match[1], 3);
                    div.insertAdjacentHTML('afterbegin', `${spans.map((a) => {return(`<span class="strGroup">${a}</span>`)}).join('')}`);
                }catch(e){
                    that.log(`getRegexArmy() | ups_d9 formatter threw unexpectedly: ${e}`);
                    div.textContent = str;
                }
                return(div);
            }
        },

        ups_d26:  {
            rgx: /^[0-9]{26}$/,
            length: 26,
            carrier: 'UPS',
            formatter: (str) => {
                let div = document.createElement('div');
                div.className = "trackingNumber";
                div.dataset.strType = 'ups_d26';
                div.dataset.carrier = "UPS";
                try {
                    let match = `${str}`.match(/^([0-9]{9})$/);
                    let spans = stringChopper(match[1], 4);
                    div.insertAdjacentHTML('afterbegin', `${spans.map((a) => {return(`<span class="strGroup">${a}</span>`)}).join('')}`);
                }catch(e){
                    that.log(`getRegexArmy() | ups_d26 formatter threw unexpectedly: ${e}`);
                    div.textContent = str;
                }
                return(div);
            }
        },

        fdx_34:   {
            rgx: /^([0-9]{34})$/,
            length: 34,
            carrier: 'FedEx',
            formatter: (str) => {
                let div = document.createElement('div');
                div.className = "trackingNumber";
                div.dataset.strType = 'fdx_34';
                div.dataset.carrier = "FedEx";
                try {
                    let match = `${str}`.match(/^([0-9]{34})$/);
                    //let spans = stringChopper(match[1], 4, true);
                    let spans = stringChopper(match[1], [4,4,1,3,3,4,1,2,4,4,4], false);
                    div.insertAdjacentHTML('afterbegin', `${spans.map((s, i, a) => {
                        return(`<span class="strGroup ${(i >= (a.length - 3))?'postfix':''}">${s}</span>`);
                    }).join('')}`);
                }catch(e){
                    that.log(`getRegexArmy() | fdx_34 formatter threw unexpectedly: ${e}`);
                    div.textContent = str;
                }
                return(div);
            }
        },

        fdx_d22:  {
            rgx: /^([0-9]{22})$/,
            length: 22,
            carrier: 'FedEx',
            formatter: (str) => {
                let div = document.createElement('div');
                div.className = "trackingNumber";
                div.dataset.strType = 'fdx_d22';
                div.dataset.carrier = "FedEx";
                try {
                    let match = `${str}`.match(/^([0-9]{22})$/);
                    let spans = stringChopper(match[1], 4);
                    div.insertAdjacentHTML('afterbegin', `${spans.map((a) => {return(`<span class="strGroup">${a}</span>`)}).join('')}`);
                }catch(e){
                    that.log(`getRegexArmy() | fdx_d22 formatter threw unexpectedly: ${e}`);
                    div.textContent = str;
                }
                return(div);
            }
        },

        fdx_d20:  {
            rgx: /^([0-9]{20})$/,
            length: 20,
            carrier: 'FedEx',
            formatter: (str) => {
                let div = document.createElement('div');
                div.className = "trackingNumber";
                div.dataset.strType = 'fdx_d20';
                div.dataset.carrier = "FedEx";
                try {
                    let match = `${str}`.match(/^([0-9]{20})$/);
                    let spans = stringChopper(match[1], 4);
                    div.insertAdjacentHTML('afterbegin', `${spans.map((a) => {return(`<span class="strGroup">${a}</span>`)}).join('')}`);
                }catch(e){
                    that.log(`getRegexArmy() | fdx_d20 formatter threw unexpectedly: ${e}`);
                    div.textContent = str;
                }
                return(div);
            }
        },
        fdx_d15:  {
            rgx: /^([0-9]{15})$/,
            length: 15,
            carrier: 'FedEx',
            formatter: (str) => {
                let div = document.createElement('div');
                div.className = "trackingNumber";
                div.dataset.strType = 'fdx_d15';
                div.dataset.carrier = "FedEx";
                try {
                    let match = `${str}`.match(/^([0-9]{15})$/);
                    let spans = stringChopper(match[1], 5);
                    div.insertAdjacentHTML('afterbegin', `${spans.map((a) => {return(`<span class="strGroup">${a}</span>`)}).join('')}`);
                }catch(e){
                    that.log(`getRegexArmy() | fdx_d15 formatter threw unexpectedly: ${e}`);
                    div.textContent = str;
                }
                return(div);
            }
        },

        fdx_d12:  {
            rgx: /^[0-9]{12}$/,
            length: 12,
            carrier: 'FedEx',
            formatter: (str) => {
                let div = document.createElement('div');
                div.className = "trackingNumber";
                div.dataset.strType = 'fdx_d12';
                div.dataset.carrier = "FedEx";
                try {
                    let match = `${str}`.match(/^([0-9]{15})$/);
                    let spans = stringChopper(match[1], 3);
                    div.insertAdjacentHTML('afterbegin', `${spans.map((a) => {return(`<span class="strGroup">${a}</span>`)}).join('')}`);
                }catch(e){
                    that.log(`getRegexArmy() | fdx_d12 formatter threw unexpectedly: ${e}`);
                    div.textContent = str;
                }
                return(div);
            }
        }
    }
}




}
export { noiceTrackingNumber };
