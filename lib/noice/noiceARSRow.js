/*
    noiceARSRow.js
    Amy Hicox <amy@hicox.com> 4/3/24

    this extends the noiceCoreRow class for integration to rows on indexedDB datastores
    managed by a noiceARSSyncWorker

    ATTRIBUTES
        * formName                              <str> default: null, required
        * threadClient                          <noiceARSSyncWorkerClient> default: null, required
        * auxFieldConfig                        <object {<fieldID>:{configOptions}, ...}
        * mode                                  <enum [modify|create]> default: modify
        * modeChangeCallback                    <function(mode, oldMode, selfRef)>
        * entryId                               <str> - gets the value of whatever field is #1 in the rowData or null
        * dataLoadedCallback(this.rowData)      <async function()> - use for setting up UI. we'll await the output of this if specified on load() and refresh()

    FUNCTIONS
        * initFormFields()                      called from constructor, fetches ars formDef from threadClient,
                                                mangles it and installs it as the fieldConfig
        * getFieldByID(fieldID)                 returns the dataElement matching 'fieldID' or null
        * getFieldByName(fieldName)             same deal, gimme the dataElement matching 'fieldName' or null
        * async load(entryId)                   pull the row identified by entryId from this.formName and install it as rowData (setting up dataElements, etc)
        * async refresh(mergeChanges)           pull data from this.entryId and this.FormName and update dataElement values. if mergeChanges is set true, don't update dataElements where changeFlag = true
        * getFormView()                         return a wcARSFormView element that is the formView of the row

    TO-DO
        * on 'mode' change, update props on dataElements from aux config if mode specific configs exist
        * on instantiate where mode:create, we need to spawn dataElements or something ... mode specific config?
        * grr -- update() might need to spawn new dataElements
 */
import { noiceObjectCore, noiceException, noiceCoreChildClass, getGUID } from './noiceCore.js';
import { noiceCoreRow } from './noiceCoreRow.js';
import { noiceARSSyncWorkerClient } from './noiceARSSyncWorkerClient.js';
import { wcARSFormView } from './webComponents/wcARSFormView.js';
import { wcBasic } from './webComponents/wcBasic.js';
class noiceARSRow extends noiceCoreRow {




/*
    constructor({

    })
*/
constructor(args, defaults, callback){
    super(args, noiceObjectCore.mergeClassDefaults({
        _version:      1,
        _className:    'noiceARSRow',
        _mode:          null,
        _entryId:       null,
        _initialized:   false,
        formView:       null,
        threadClient:   null,           // we gonna need a noiceARSSyncWorkerClient
        formName:       null,           // we're gonna need a name to pull the formDef outa the client
        auxFieldConfig: {},
        validateOnChange: true,         // re-validte on every value change (after instantiation)
        debug:          false
    },defaults),callback);

    // gots ta maintaiiin ... data integrity that is :-)
    if (! this.threadClient instanceof noiceARSSyncWorkerClient){
        throw(new noiceException({
            messageNumber: 1,
            message: 'threadClient is not instance of noiceARSSyncWorkerClient',
            thrownBy: `noiceARSRow constructor()`
        }));
    }
    if (! this.isNotNull(this.formName)){
        throw(new noiceException({
            messageNumber: 2,
            message: 'formName cannot be null',
            thrownBy: `noiceARSRow constructor()`
        }));
    }
    if (! (
        (this.threadClient.threadInfo instanceof Object) &&
        (this.threadClient.threadInfo.formDefinitions instanceof Object) &&
        (this.threadClient.threadInfo.formDefinitions[this.formName] instanceof Object)
    )){
        throw(new noiceException({
            messageNumber: 3,
            message: 'specified formName is not managed by specified threadClient',
            thrownBy: `noiceARSRow constructor()`
        }));
    }


    // do init stuffs here, yo!
    this.initFormFields();

    // initialize the mode (ooooh the *shade* of it all LOL)
    if (this.isNotNull(this.mode)){ this.mode = this.mode; }
}




/*
    mode
    enum: modify | create
*/
get mode(){ return(this._mode); }
set mode(v){

    if (['create', 'modify', 'list', 'clone'].indexOf(v) >= 0){
        let bkp = this._mode;
        this._mode = v;
        this.log(`[${this.formName}]: ${this.entryId} | .mode attribute setter | mode: ${v} oldMode: ${this._mode}`, true);
        if (this.modeChangeCallback instanceof Function){ this.modeChangeCallback(this._mode, bkp, this); }

        // set mode specific configs on each dataElement that we have them for on the new mode
        Object.keys(this.fieldConfig).filter((fieldID) => {return(
            (this.fieldConfig[fieldID].modes instanceof Object) &&
            (this.fieldConfig[fieldID].modes[this.mode] instanceof Object) &&
            this.dataElements.hasOwnProperty(fieldID)
        )}, this).forEach((fieldID) => {
            Object.keys(this.fieldConfig[fieldID].modes[this.mode]).forEach((a) => { this.dataElements[fieldID][a] = this.fieldConfig[fieldID].modes[this.mode][a]; }, this);
        }, this);

        // sync view modes
        this.syncViewModes();

    }else{
        throw(new noiceException({
            messageNumber: 4,
            message: 'invalid value',
            thrownBy: `${this._className}.mode (attribute setter)`
        }));
    }
}




/*
    entryId
    return the value of whatever dataElement has id:1
    if mode:'create' this will be a GUID more than likely
*/
get entryId(){
    let b = Object.keys(this.dataElements).filter((fieldName) => {return(parseInt(this.dataElements[fieldName].id) == 1)}, this);
    return((b.length > 0)?this.dataElements[b[0]].value:null);
}
set entryId(v){
    if (this.isNotNull(v)){
        let entryIdDataElement = this.getFieldByID(1);
        if (this.isNotNull(entryIdDataElement)){
            entryIdDataElement.value = v;
        }else{
            this.getDataElement(this.getFieldNameByID(1), v);
        }
    }
}




/*
    getFieldByID(fieldID)
    returns the dataElement matching 'fieldID' or null
*/
getFieldByID(fieldID){
    let b = (! isNaN(parseInt(fieldID)))?Object.keys(this.dataElements).filter((fieldName) => {return(parseInt(this.dataElements[fieldName].id) == parseInt(fieldID))}, this):[];
    return((b.length > 0)?this.dataElements[b[0]]:null);
}




/*
    getFieldByName(fieldName)
    same deal, gimme the dataElement matching 'fieldName' or null
*/
getFieldByName(fieldName){
    let b = this.isNotNull(fieldName)?Object.keys(this.dataElements).filter((fn) => {return(fn == fieldName)}, this):[];
    return((b.length > 0)?this.dataElements[b[0]]:null);
}




/*
    getFieldNameByID(fieldID)
    return the name of the field idenfied by fieldID
*/
getFieldNameByID(fieldID){
    let b = Object.keys(this.fieldConfig).filter((fieldName) => {return( (! isNaN(parseInt(fieldID))) && (parseInt(this.fieldConfig[fieldName].id) == parseInt(fieldID)) )}, this);
    return((b.length > 0)?b[0].fieldName:null)
}




/*
    getFieldIDByName(fieldName)
    return the name of the field idenfied by fieldID
*/
getFieldIDByName(fieldName){
    let b = Object.keys(this.fieldConfig).filter((fn) => {return( this.isNotNull(fieldName) && (fieldName == fn) )}, this);
    return((b.length > 0)?b[0].id:null)
}



/*
    initFormFields()
    pull the formDefinition corresponding to this.formName and mutate it into a fieldConfig
    then install that fieldConfig
*/
initFormFields(){
    if (! (this._initialized === true)){
        let out = {};
        Object.keys(this.threadClient.threadInfo.formDefinitions[this.formName].nameIndex).forEach((fieldName) => {
            let shawty = this.threadClient.threadInfo.formDefinitions[this.formName].nameIndex[fieldName];
            out[fieldName] = {
                id: shawty.id,
                fieldName: fieldName,
                type: shawty.datatype,
                nullable: (!(shawty.hasOwnProperty('field_option') && (shawty.field_option == "REQUIRED")))
            };

            // merge limits (length, enum values, etc)
            if (shawty.limit instanceof Object){
                if (shawty.limit.hasOwnProperty('max_length')){ out[fieldName].maxlength = shawty.limit.max_length; }
                if ((shawty.datatype == "ENUM") && (shawty.limit.selection_values instanceof Array)){
                    // we have to do this because of the goofy "json" type we setup. in the case where there's a bazillion of these, it could be memory leaky jussayin
                    out[fieldName].options = JSON.stringify({ values: shawty.limit.selection_values.sort((a,b) => {return(parseInt(a.id) - parseInt(b.id))}).map((o) => { return(o.name) })})
                }
            }

            // merge default view label if we can find one
            if (
                (shawty.display_properties instanceof Object) &&
                (shawty.display_properties[Object.keys(shawty.display_properties)[0]] instanceof Object) &&
                shawty.display_properties[Object.keys(shawty.display_properties)[0]].hasOwnProperty('LABEL')
            ){
                out[fieldName].label = shawty.display_properties[Object.keys(shawty.display_properties)[0]].LABEL;
            }

            // merge auxFieldConfig properties if we have them (field config not originating from ARS formDef)
            if (this.auxFieldConfig[fieldName] instanceof Object){
                out[fieldName] = Object.assign({}, out[fieldName], this.auxFieldConfig[fieldName]);
            }

            // set up dbColName, which should be fieldID or indexName
            out[fieldName].dbColName = (
                (this.threadClient.threadInfo.formIndexMappings instanceof Object) &&
                (this.threadClient.threadInfo.formIndexMappings[this.formName] instanceof Object) &&
                this.threadClient.threadInfo.formIndexMappings[this.formName].hasOwnProperty(out[fieldName].id)
            )?this.threadClient.threadInfo.formIndexMappings[this.formName][out[fieldName].id]:out[fieldName].id;

            // modes has to be a unique copy as we're gonna mutate these in the UI
            if (out[fieldName].modes instanceof Object){
                out[fieldName].modes = JSON.parse(JSON.stringify(out[fieldName].modes));
            }

        }, this);
        this.fieldConfig = out;
        this._initialized = true;
    }
    return(true);
}




/*
    dataInputFilter(value, noiceCoreValueObject)
    coerce data types here based on what we got in the fieldConfig for a type
*/
dataInputFilter(value, dataElement){
    // for the moment lets just see if we're working (yeah it's working lol)
    // this.log(`dataTypeFilter() | [${dataElement.type}]: ${value}`);

    /*
        we will likely want to expand this
        but for the moment, we're really just kinda worried with strings and numbers
    */
    if ((dataElement instanceof Object) && dataElement.hasOwnProperty('type') && this.isNotNull(dataElement.type)){

        if (['DECIMAL', 'INTEGER'].indexOf(dataElement.type) >= 0){
            // if it's a number type
            return((! isNaN(parseFloat(value)))?parseFloat(value):value);
        }else if (dataElement.type == 'BOOL'){
            // if it's a bool
            return(value === true);
        }else{
            // everything else is a string lol (may need to revisit this if we're gonna do attachments n stuff)
            return(`${value}`);
        }
    }else{
        return(value);
    }
}




/*
    load(entryId, dateFormat)
    fetches the row identified by `entryId` on the this.formName from the
    indexedDB instance and table mapped by the threadClient and installs it as rowData

    This is a shortcut method, you can just as easily send the rowData in on instantiation
    if you already have it.

    this returns self so it can be chained with the constructor
    like:
        let tikcket = new noiceARSRow({...}).load('000000000000001');

    note: on a no-match this will reject the promise with string 'no match'
*/
load(entryId, dateFormat){
    let that = this;
    return(new Promise((toot, boot) => {
        that.threadClient.getARSRow({
            schema: that.formName,
            ticket: entryId,
            fields: [],
            returnFormat: 'fieldName',
            dateFormat: that.isNull(dateFormat)?'datetime-local':null
        }).then((row) => {

            // this oughta work!
            that.setRowData(row).then(() => {
                that.mode = "modify";
                that._entryId = entryId;

                // toot self for chaining
                toot(that);

            }).catch((error) => {
                that.log(`[${that.formName}]: load(${entryId}) | setRowData() threw unexpectedly: ${error}`);
                boot(error);
            });
        }).catch((error) => {
            if (
                (error instanceof Object) &&
                (error.hasOwnProperty('messageNumber')) &&
                parseInt(error.messageNumber) == 404
            ){
                that.log(`[${that.formName}]: load(${entryId}) | threadClient.getARSRow() | no match`, true);
                boot('no match')
            }else{
                that.log(`[${that.formName}]: load(${entryId}) | threadClient.getARSRow() threw unexpectedly: ${error}`);
                boot(error);
            }
        })
    }));
}




/*
    dataLoadedCallback(rowData, selfRef)
    noiceCoreRow class override - this gets asynchronously fired and awaited out of
    noiceCoreRow.setData(), there will likely be other instances of calls to it as well

    this function is executed AFTER a set of new values has been fed to the row , for instance
    initing a new row post create, or after loading new record in modify mode

    all dataElements should exist and have their default values by here
*/
dataLoadedCallback(rowData, selfRef){
    let that = this;
    return(new Promise((toot, boot) => {

        /*
            insert view init shenanigans here

            init value dependent menus
            if we have instantiated views, the setValuesCallback should
            handle relaying the update to any onscreen menus
        */
        this.initValueDependentMenus().then(() => {

            // sync the data to any formViews we might have
            Object.keys(rowData).forEach((f) => { that.updateViews(f, rowData[f]); });

            // do other stuff someday, maybe?
            toot(true);

        }).catch((error) => {
            this.log(`[${this.formName}]: ${this.entryId} | dataLoadedCallback() | initValueDependentMenus() threw unexpectedly: ${error}`);
            boot(error);
        });

    }));
}




/*
    initValueDependentMenus()
    find all the valueDependentMenu:true dataElements, and call their menuQuery functions
*/
initValueDependentMenus(){
    let that = this;
    return(Promise.all(
        Object.keys(that.fieldConfig).filter((fieldName) => {return(
            (that.dataElements[fieldName] instanceof Object) &&
            that.fieldConfig[fieldName].hasOwnProperty('valueDependentMenu') &&
            (that.fieldConfig[fieldName].valueDependentMenu === true) &&
            (that.fieldConfig[fieldName].menuQuery instanceof Function) &&
            that.fieldConfig[fieldName].hasOwnProperty('valueDependentMenuOrder') &&
            (! isNaN(parseFloat(that.fieldConfig[fieldName].valueDependentMenuOrder)))
        )}).sort((a,b) => {return(
            parseFloat(that.fieldConfig[a].valueDependentMenuOrder) -
            parseFloat(that.fieldConfig[b].valueDependentMenuOrder)
        )}).map((fieldName) => {return(new Promise((toot, boot) => {
            that.fieldConfig[fieldName].menuQuery(that.threadClient, that.dataElements[fieldName], that.rowData).then((vals) =>{
                that.fieldConfig[fieldName].values = vals;
                toot(vals);
            }).catch((error) =>{
                that.log(`${that._className} | v${that._version} | initValueDependentMenus() | ${fieldName} (setting null menu) | menuQuery() threw unexpectedly: ${error}`);
                toot([]);
            })
        }))})
    ));
}




/*
    refresh(mergeChanges)
    if mode:modify, pull all of the data from the dbRecord identified by this.entryId
    and update all of the fields and *do not* set change flags true while doing so
    as these represent the current state of the obect in the db

    if mergeChanges is set true, do not update the value of fields with the changeFlag active
    simply update the values of fields where changeFlag is false

    if dataLoadedCallback is specified,  call this *after* updating row values
*/
refresh(mergeChanges){
    let that = this;
    return(new Promise((toot, boot) => {
        if ((that.mode == "modify") && that.isNotNull(that.entryId) && that.isNotNull(that.formName)){
            that.threadClient.getARSRow({
                schema: that.formName,
                ticket: that.entryId,
                fields: [],
                returnFormat: 'fieldName'
            }).then((row) => {
                Promise.all(Object.keys(row).filter((fieldID) => {return(
                    (! (that.dataElements.hasOwnProperty(fieldID))) ||
                    (! (mergeChanges === true)) ||
                    ((mergeChanges === true) && (!(that.dataElements[fieldID].changeFlag)))
                )}).map((fieldID) => { return(that.getDataElement(fieldID, row[fieldID])); })).then(() => {

                    // now we gotta prune dataElements that no longer exist in the row
                    Promise.all(Object.keys(that.dataElements).filter((fieldID) =>{ return((!(row.hasOwnProperty(fieldID)))); }).map((fieldID) => {return(
                        that.removeDataElement(fieldID)
                    )})).then(() => {
                        that.log(`refresh(${that.entryId}) | successfully updated dataElements`, true);

                        // await dataLoadedCallback if we've got one
                        new Promise((_t) => {_t((that.dataLoadedCallback instanceof Function)?that.dataLoadedCallback(that.rowData, that):false)}).then(() => {
                            toot(that.rowData);
                        }).catch((error) => {
                            that.log(`refresh(${that.entryId}) | successfully updated dataElements | dataLoadedCallback() threw unexpectedly: ${error}`);
                            boot(error);
                        });

                    }).catch((error) => {
                        // pruning data elements failed? shouldn't actually be possible but I'm feelin pedantic
                        that.log(`refresh(${that.entryId}) | at least one dataElement.removeDataElement() calls threw unexpectedly (see log): ${error}`);
                        boot(error);
                    });
                }).catch((error) => {
                    that.log(`refresh(${that.entryId}) | at least one getDataElement() calls threw unexpectedly (see log): ${error}`);
                    boot(error);
                });
            }).catch((error) => {
                that.log(`refresh(${that.entryId}) | threadClient.getARSRow() threw unexpectedly: ${error}`);
                boot(error);
            });
        }else{
            let errstr = `mode is not "modify" or entryId is null or formName is null`;
            that.log(`refresh() | ${errstr}`, true);
            boot(errstr);
        }
    }));
}




/*
    saveCallback(rowData, selfRef)
    ask the threadClient to save or create the thing, then refresh it from the db
    because the threadClient mighta had filters that mutate the record on save
*/
saveCallback(rowData, selfRef){
    let that = this;
    return(new Promise((toot, boot) => {

        /*
            async preSaveCallback(rowData, selfRef)
            this allows external specification of data mutation functions on save
            for instance updating a custom date/user field, etc
            only return mutated field values
        */
        new Promise((__t, __b) => {
            __t((that.preSaveCallback instanceof Function)?that.preSaveCallback(rowData, selfRef):{})
        }).catch((error) => {
            // preSaveCallback() throws are ignored
            that.log(`saveCallback() | mode: ${this.mode} | ignored | preSaveCallback() threw unexpectedly: ${error}`);
        }).then((mergeData) => {

            // await the create or update ..
            new Promise((_t, _b) => {
                switch (that.mode){

                    // create mode
                    case ('create'):
                        that.threadClient.createARSRow({
                            schema: that.formName,
                            fields: Object.assign({}, that.rowData, mergeData)
                        }).then((entryId) => {

                            // note: threadClient.createARSRow will have generated a GUID for us if we didn't supply one on rowData
                            this.entryId = entryId;
                            this.mode = "modify";
                            _t(entryId);

                        }).catch((error) => {
                            // createARSRow threw
                            that.log(`saveCallback() | mode: create | threadClient.createARSRow() threw unexpectedly: ${error}`);
                            _b(error);
                        });
                    break;

                    // clone mode is the same thing as 'create' except the switch won't let me || ?
                    case ('clone'):
                        that.threadClient.createARSRow({
                            schema: that.formName,
                            fields: Object.assign({}, that.rowData, mergeData)
                        }).then((entryId) => {

                            /*
                                reset all the fields with resetUIOnClone:true
                                on fieldConfig.modes.clone to null
                                make an entirely new GUID on the entryID (but return *this* one)
                                and do not change the mode.

                                if we have inheritUndoValue respect that as well
                            */
                            Promise.all(Object.keys(that.fieldConfig).filter((fieldName) => {return(
                                (that.dataElements instanceof Object) &&
                                (that.dataElements[fieldName] instanceof Object) &&
                                (that.fieldConfig[fieldName] instanceof Object) &&
                                (that.fieldConfig[fieldName].modes instanceof Object) &&
                                (that.fieldConfig[fieldName].modes.clone instanceof Object) &&
                                that.fieldConfig[fieldName].modes.clone.hasOwnProperty('resetUIOnClone') &&
                                (that.fieldConfig[fieldName].modes.clone.resetUIOnClone == true)
                            )}).map((fieldName) => {return(new Promise((_t, _b) => {
                                let tmp = that.dataElements[fieldName].value;
                                that.dataElements[fieldName].setValue('', false, true).then(() => {
                                    if (
                                        that.fieldConfig[fieldName].modes.clone.hasOwnProperty('inheritUndoValue') &&
                                        (that.fieldConfig[fieldName].modes.clone.inheritUndoValue == true)
                                    ){
                                        that.dataElements[fieldName]._uglyHack = tmp;
                                    }
                                    _t(true);
                                }).catch((e) => { _b(e) })

                            }))})).catch((error) => {
                                // TO-DO: catch error properly?
                                that.log(`saveCallback() | mode: clone | ignored | post-save failed to reset at least one resetUIOnClone field: ${error}`);
                            }).then(() => {

                                // reset entryId to an entirely new GUID
                                that.oldEntryId = entryId;
                                that.entryId = getGUID();
                                that.mode = "clone";
                                that.changeFlag = false;
                                _t(entryId);
                            });

                            // old and busted
                            //this.entryId = entryId;
                            //this.mode = "modify";
                            //_t(entryId);

                        }).catch((error) => {
                            // createARSRow threw
                            that.log(`saveCallback() | mode: clone | threadClient.createARSRow() threw unexpectedly: ${error}`);
                            _b(error);
                        });
                    break;

                    // modify mode
                    case 'modify':
                        // munge changedFields into the input modifyInputRow needs
                        let fieldsToWrite = that.changedFields
                        Object.keys(fieldsToWrite).forEach((fieldName) => {
                            let value = fieldsToWrite[fieldName].value;
                            delete(fieldsToWrite[fieldName]);
                            fieldsToWrite[fieldName] = value;
                         });
                         Object.assign(fieldsToWrite, mergeData);

                        // tell the threadClient to write it!
                        that.threadClient.modifyARSRow({
                            schema: that.formName,
                            ticket: that.entryId,
                            fields: fieldsToWrite
                        }).then((r) => {
                            that.log(`saveCallback(${that.entryId}) | mode: modify | success`, true);
                            _t(that.entryId);
                        }).catch((error) => {
                            that.log(`saveCallback(${that.entryId}) | mode: modify | threadClient.modifyARSRow() threw unexpectedly: ${error}`);
                            _b(error);
                        });
                    break;
                }

            }).then(() => {

                // refreshments!
                if (that.mode == "clone"){
                    toot(true);
                }else{
                    that.refresh().then((rowData) => {
                        toot(true);
                    }).catch((error) =>{
                        // refresh threw
                        that.log(`saveCallback(${that.entryId}) | mode: ${this.mode} | post-save refresh() threw unexpectedly: ${error}`);
                        boot(error);
                    });
                }

            }).catch((error) => {
                // create or upate failed
                that.log(`saveCallback(${that.entryId}) | mode: ${this.mode} | create or modify transaction threw threw unexpectedly (see log): ${error}`);
                boot(error);
            });
        });
    }));
}




/*
    savedCallback(rowData, selfRef)

    executes after a row save. at the moment just using it to restore undo values after a clone
*/
savedCallback(rowData, selfRef){
    let that = this;
    return(new Promise((_t,_b) => {

        // ugly hack to restore the inheritUndoValue
        Object.keys(that.dataElements).filter((fieldName) => {return(
            that.dataElements[fieldName].hasOwnProperty('_uglyHack')
        )}).forEach((fieldName) => {
            that.dataElements[fieldName].undoValue = that.dataElements[fieldName]._uglyHack;
            delete(that.dataElements[fieldName]._uglyHack);
        });

        _t(true);
    }))
}




/*
    formView stuff
    some things for dealing with the formView

    override this to get the classic async valueChangedCallback:
    valueChange({ fieldID: <colName>, newValue: <val>, oldValue: <val>, fieldReference: <noiceCoreValue object> })
        => this is where "workflow" and such should go -- validation stuff too

        => ACTUALLY NO -> valueChange() and valueChangePostHook() CANNOT SET WARNING/ERRORs
           if you need to set a error or warning at the field level. this goes in
           fieldConfig[fieldName].validationCallback()

    override this to get the "the value change was successful notification" callback:
    valueChangePostHook({ fieldID: <colName>, newValue: <val>, oldValue: <val>, fieldReference: <noiceCoreValue object> })
        => this is where "we have a new state, update the UI" kinda stuff should go

    async setFieldValueFromView(fieldName, fieldValue, viewReference. selfReference)
        => fires on each capture_value event on each wcFormElement in the view
            does not check for actual change. that's on you. This is async so you could await it if needed
            however, the formView does *not* await it. So if the result of setting the field is a condition
            like a validation error and whatnot, this is on you I guess

    changeFlagCallback(newBool, oldBool, selfRef)
        => this override is gonna fire whenever the row changeflag changes
           hook into this to update the formView.change_flag


   LOH 4/29/24 @ 1645 -- COB AND BRAIN FRIED
   it works in as much as you change a field and it sets the row changeFlag true, then
   forwards that onto the formView change_flag and the save button lights up

   if you change the field back to it's previous value this does not unset the changeFlag
   on the row nor the view. This might be a problem with my change detection in noiceCoreValue
   as a matter of fact. Pretty sure it is, but it's just too much to try and untangle right
   at this moment. Brain needs a rest. Maybe on the night shift I dunno.

*/




/*
    getFormView(defaults, wcARSFormViewChildClass)
    gimme a formView with all of the entanglings necessary for it to be
    a front end for this form row

    you gon wanna set defaults.height at the very least (probably)

    if you send a class definition on wcARSFormViewChildClass, we will instantiate that
    instead of wcARSFormView with all the same args. If you need more customization than that
    just override getFormView m'kay?
*/
getFormView(defaults, altClass){
    let that = this;
    if (! (this.formView instanceof Element)){
        let viewClass = (altClass instanceof Object)?altClass:wcARSFormView;
        this.formView = new viewClass(Object.assign({}, {
            entry_id: this._entryId,
            debug: this.debug,
            rowData: this.rowData,
            fieldConfig: this.getRunningConfig(),
            mode: this.mode,
            fieldValueChangeCallback: (fieldName, fieldValue, formElement, selfRef) => { this.setFieldValueFromView(fieldName, fieldValue, formElement, selfRef); },
            show_modified_field_indicator: true,
            fieldUndoCallback: (formElement, btnUndo, selfRef) => { this.handleFieldUndoFromView(formElement, btnUndo, selfRef); },
            fieldMenuCallback: (formElement, btnMenu) => {
                if (
                    (that.fieldConfig[formElement.name] instanceof Object) &&
                    (that.fieldConfig[formElement.name].menuCallback instanceof Function)
                ){
                    that.fieldConfig[formElement.name].menuCallback(formElement, btnMenu, that, that.formView);
                }
            },
            fieldAddedToViewCallback: (field, slf) => {
                if ((that.dataElements instanceof Object) && (that.dataElements[field] instanceof Object)){
                    that.updateViews(field, that.rowData[field]);
                    that.dataElements[field].validate();

                }
            },
            saveCallback: (formView, btnSave) => {
                btnSave.disabled = true;
                that.save().then((rowData) => {
                    btnSave.disabled = false;
                    formView.postSaveExecutor({fail: false, rowData: rowData});
                }).catch((e) =>{
                    // sigh ... I got no idea how to show this
                    this.log(`formView.saveCallback() | arsRow.save() threw unexpectedly: ${e}`);
                    formView.postSaveExecutor({fail: true, error: e});
                });
            },
            savedCallback: (self, btnSave, args) => {

                // don't disable the save button if it failed
                btnSave.disabled = ((args instanceof Object) && args.hasOwnProperty('fail') && (args.fail == false));

                // also if it failed, we need to pop a dialog or something I guess?
                if (
                    (args instanceof Object) &&
                    (args.hasOwnProperty('error'))
                ){
                    self.openDialog(new wcBasic({
                        content: `
                            <div data-_name="container">
                                <p data-_name="errorMessage">${args.error}</p>
                                <button data-_name="btnClose">OK</button>
                            </div>
                        `,
                        styleSheet: `
                            div[data-_name="container"] {
                                display: grid;
                                place-items: center;
                                margin: .5em;
                            }
                            p[data-_name="errorMessage"] {
                                display: block;
                                margin: .5em;
                                font-size: .8em;
                            }
                            button[data-_name="btnClose"]{
                                padding: var(--theme-rect-button-padding);
                                border-radius: var(--theme-standard-radius-large);
                                font-weight: bold;
                                border-color: transparent;
                                color: var(--theme-button-foreground);
                                background-color: var(--theme-button-background);
                            }
                        `,
                        initializedCallback: (slf) => {
                            slf._elements.btnClose.addEventListener('click', (evt) => {self.dialog.exit();})
                        }
                    }), {
                        title: 'failed save',
                        modal: true
                    })
                }

            }
        }, (defaults instanceof Object)?defaults:{}));

        // catch the "initialized" event after the formView is rendered so we can sync pre-existing validations to the UI
        this.formView.addEventListener('initialized', (evt) => {

            // sync errors
            Object.keys(that.validationErrors).forEach((colName) =>{
                that.fieldValidationStateChange({
                    fieldID: colName,
                    hasErrors: true,
                    hasWarnings: (Object.keys(that.validationWarnings).filter((a) => {return(a == colName)}).length > 0),
                    errors: that.validationErrors[colName],
                    fieldReference: that.dataElements[colName]
                });
            });

            // sync warnings
            Object.keys(that.validationWarnings).forEach((colName) =>{
                that.fieldValidationStateChange({
                    fieldID: colName,
                    hasErrors: (Object.keys(that.validationErrors).filter((a) => {return(a == colName)}).length > 0),
                    hasWarnings: true,
                    errors: that.validationWarnings[colName],
                    fieldReference: that.dataElements[colName]
                });
            });
        });
    }



    // reset the mode so the UI can get all the update messages
    return(this.formView);
}




/*
    getRunningConfig()
    return fieldConfig, merged with the current values
    of .editable, .disaply, .nullable and .values for each field
    this is the configuration + any current modifications to dataElement options
*/
getRunningConfig(){
    // make a copy of the config
    let out = Object.assign({}, this.fieldConfig);

    // merge in whatever we got on the current mode
    Object.keys(out).filter((fieldName) => {return(
        (out[fieldName].modes instanceof Object) &&
        (out[fieldName].modes[this.mode] instanceof Object)
    )}, this).forEach((fieldName) => {
        Object.keys(out[fieldName].modes[this.mode]).forEach((a) => { out[fieldName][a] = out[fieldName].modes[this.mode][a]; }, this);
    }, this);

    // copy in overrides from the object's running state
    Object.keys(this.dataElements).filter((fieldName)=>{return(out.hasOwnProperty(fieldName))}).forEach((fieldName) => {
        ['editable', 'nullable', 'values'].forEach((a) => { out[fieldName][a] = this.dataElements[fieldName][a]; });
        if (this.dataElements[fieldName].hasOwnProperty('display')){ out[fieldName].display = this.dataElements[fieldName].display; }
    }, this);
    return(out);
}



/*
    setFieldValueFromView(fieldName, fieldValue, formElement, arsFormView)
    a formElement in the formView has exeucted a capture_value event
    this may not be different than the old value (the formView has no way of knowing)
    so check for a change and then do what ya gotta do down here
*/
setFieldValueFromView(fieldName, fieldValue, formElement, arsFormView){
    let that = this;
    return(new Promise((toot, boot) => {

        // only execute if the fieldValue is different than the current value of the field
        if (that.dataElements.hasOwnProperty(fieldName) && (that.dataElements[fieldName].value != fieldValue)){

            // log it if we're in debug
            that.log(`[${that.formName}]: ${that.entryId} | setFieldValueFromView(${fieldName}) `, true);

            // this seems a rather lame way to build a one key hash with a dynamic key but whatever
            let tmp = {};
            tmp[fieldName] = fieldValue;

            // modify ourselves
            that.modify(tmp).then((rowData) => {

                /*
                    uiPostValueChangeHook(threadClient, fieldName, formElement, arsFormView, rowData)
                    this fires after the *entire* sequence of callbacks initiated by a field value change
                    from the UI resolves. Meaning the callbacks for the value change on the originating
                    field, as well as any callbacks spawned by changes to other fields with callbacks, etc.

                    The whole shebang. It is done by here. So obviously you might wanna fire some more
                    shebangs. For instance maybe doing a query after a known sequence triggered by field
                    value change (such as record select) has completed.

                    this is config defined per-field obviously. A link if you will, an active one even:-p

                    I have one question. Can you dig it?
                */
                toot((
                    (that.fieldConfig instanceof Object) &&
                    (that.fieldConfig[fieldName] instanceof Object) &&
                    (that.fieldConfig[fieldName].uiPostValueChangeHook instanceof Object)
                )?that.fieldConfig[fieldName].uiPostValueChangeHook(that.threadClient, fieldName, formElement, arsFormView, that, rowData):rowData);

            }).catch((error) => {
                that.log(`[${that.formName}]: ${that.entryId} | setFieldValueFromView(${fieldName}) | ignored | modify() threw: ${error}`, true);
                boot(error);
            });

        }else{
            that.log(`[${that.formName}]: ${that.entryId} | setFieldValueFromView(${fieldName}) | ignored | no change or dataElement does not exit`, true);
            toot(fieldValue);
        }
    }));
}




/*
    valueChange({ fieldID: <colName>, newValue: <val>, oldValue: <val>, fieldReference: <noiceCoreValue object> })
    this is the inverse of setFieldValueFromView(). This fires when a .dataElements entry has changed value

    this will fire on every modify. Some of which will come from sources other than the UI, right?
    so in the case for instance where an arsSyncWorker thread updates the row from the server side
    this will fire.

    First order over business. Make sure we don't do infinite UI loops
    it's ok actually to do a round-trip -- like
        1) UI action -> update dataElement
        2) dataElement -> valueChange() -> update UI
    this is in fact necessary as the change from the UI side might invoke code that mutates the value
    on step #2 we're gonna need to implement a flag that says "don't send it back to me yo"

    oh also. this is that place.
    this is the place where we'd execute "workflow" to mutate the field value
    so there's a lot going on here.
*/
valueChange(args){
    let that = this;
    return(new Promise((toot, boot) => {
        that.log(`[${that.formName}]: ${that.entryId} | valueChange() | ${args.fieldID} | [new]: ${args.newValue} | [old]: ${args.oldValue}`, true);

        // if the config defines a valueChangeHandler for the field, do that one first
        new Promise((_t,_b) => {_t(
            (
                (args instanceof Object) &&
                (args.hasOwnProperty('fieldID')) &&
                this.isNotNull(args.fieldID) &&
                (that.dataElements[args.fieldID] instanceof Object) &&
                (that.fieldConfig[args.fieldID] instanceof Object) &&
                (that.fieldConfig[args.fieldID].valueChangeHandler instanceof Function)
            )?that.fieldConfig[args.fieldID].valueChangeHandler(
                that.threadClient, that.dataElements[args.fieldID], args, this.rowData
            ):args.newValue
        )}).then((cVal) => {

            /*
                insert "workflow" here
                honestly this is where form-specific subclasss ought put code but then we'd need
                a separate override, I dunno, let's get the config-based stuff going.
                maybe that's all we need (ROFL)
            */

            // if we've gotta formView with a corresponding formElement, update it
            this.updateViews(args.fieldID, cVal); // note might need to change the value ref
            toot(cVal);

        }).catch((error) => {
            that.log(`[${that.formName}]: ${that.entryId} | valueChange() | ${args.fieldID} | [new]: ${args.newValue} | [old]: ${args.oldValue} | config/valueChangeHandler() threw unexpectedly: ${error}`, true);
            boot(error);
        });
    }));
}




/*
    valueChangePostHook({ fieldID: <colName>, newValue: <val>, oldValue: <val>, fieldReference: <noiceCoreValue object> })
    a field has changed value and all of the code that fires *before* that value set has completed
    this fires *after* all field values have been set. good for driving menus n stuff

    note: this is async but the resolve/reject status is ignored in noiceCoreValue.setValue() however we DO await it one
    way or the other before setValue resolves
*/
valueChangePostHook(args){
    let that = this;
    return(new Promise((toot, boot) => {

        this.log(`[${that.formName}]: ${that.entryId} | valueChangePostHook() | ${args.fieldID} | [new]: ${args.newValue} | [old]: ${args.oldValue}`, true);

        new Promise((_t,_b) => {_t(
            (
                (args instanceof Object) &&
                (args.hasOwnProperty('fieldID')) &&
                this.isNotNull(args.fieldID) &&
                (that.dataElements[args.fieldID] instanceof Object) &&
                (that.fieldConfig[args.fieldID] instanceof Object) &&
                (that.fieldConfig[args.fieldID].valueChangedHandler instanceof Function)
            )?that.fieldConfig[args.fieldID].valueChangedHandler(
                that.threadClient, that.dataElements[args.fieldID], args, this
            ):args.newValue
        )}).then((cVal) => {

            if (that.validateOnChange == true){

                that.validate().catch((error) => {
                    this.log(`[${that.formName}]: ${that.entryId} | valueChangePostHook() | ${args.fieldID} | [new]: ${args.newValue} | [old]: ${args.oldValue} | validateOnChange | validate() threw unexpectedly (ignored): ${error}`, true);
                }).then(() => {
                    toot(args.newValue);
                });

            }else{

                // NOTE: might want to execute some kinda other non-config-defined code down here
                toot(args.newValue);
            }
        }).catch((error) => {
            this.log(`[${that.formName}]: ${that.entryId} | valueChangePostHook() | ${args.fieldID} | [new]: ${args.newValue} | [old]: ${args.oldValue} | config-defined valueChangedHandler() threw unexpectedly (ignored) | ${error}`, true);
            boot(error);
        });
    }));
}



/*
    changeFlagCallback(newBool, oldBool, selfRef)
    this should fire whenever anything in dataElements changed such that
    the row's changeFlag has toggled.
*/
changeFlagCallback(newBool, oldBool, selfRef){
    if (this.formView instanceof wcARSFormView){
        this.formView.change_flag = newBool;
    }
}




/*
    updateViews(fieldID, value)
    in each UI view that we have, update the given fieldID with the given value
*/
updateViews(fieldID, value){

    // formView is all I've got for the moment. there will be more
    if (this.formView instanceof wcARSFormView){
        if (this.isNotNull(fieldID)){
            this.formView.modifyFieldValue(fieldID, value);
        }else{
            // if no fieldID specified send all the changed fields
            Object.keys(this.changedFields).forEach((fieldID) => {
                this.formView.modifyFieldValue(fieldID, this.changedFields[fieldID].value);
            }, this);
        }
    }

    // other kinda views will go here

}




/*
    syncViewModes()
    for each view that we have (formView only for now), sync properties of the mode
    from the config
*/
syncViewModes(){

    // formViews only support submit & modify
    if (this.formView instanceof wcARSFormView){ this.formView.mode = this.mode; }
}




/*
    fieldValidationStateChange({ fieldID: <colName>, hasErrors: <bool>, hasWarnings: <bool>, errors: <array>, fieldReference: <noiceCoreValue Object> }
    a field's validation state has changed -- this is a noiceCoreRow class function override
    basically this is gonna fire when the validation state of a field changes. errors will have the errors
*/
fieldValidationStateChange(args){

    // log it if we're in debug mode, actually nevermind. that's a bit much even for debug. we need a superDebug lol
    //this.log(`[${this.formName}]: ${this.entryId} | fieldValidationStateChange(${args.fieldID}) | [warnings]: ${args.hasWarnings} [errors]: ${args.hasErrors}`, true)

    if (this.formView instanceof wcARSFormView){ this.formView.handleFieldValidationStateChange(args); }

}




/*
    addDataElementCallback(dataElement)
    super.getDataElement() has added a new field.
    this is where we can await asynchronous things like fetching a default
    value list from indexedDB or what have you
*/
addDataElementCallback(dataElement){
    let that = this;
    return(new Promise((toot, boot) => {

        // uncomment this if you want too much debug logging
        //this.log(`[${this.formName}]: addDataElementCallback(${dataElement.fieldName}) | called`, true);

        // inject the setValuesCallback on the dataElement so we can handle updating UI value lists and such
        dataElement.setValuesCallback = (values, dataElementRef) => { that.handleValueListUpdate(dataElementRef.fieldName, values, dataElementRef); }

        // fetch values for fields with a menuQuery in the config
        if (
            (that.fieldConfig[dataElement.fieldName] instanceof Object) &&
            (that.fieldConfig[dataElement.fieldName].menuQuery instanceof Function) && (! (
                that.fieldConfig[dataElement.fieldName].hasOwnProperty('valueDependentMenu') &&
                (that.fieldConfig[dataElement.fieldName].valueDependentMenu === true)
            ))
        ){
            that.fieldConfig[dataElement.fieldName].menuQuery(that.threadClient, dataElement).then((values) => {
                // since this is the default menu, copy values to config as well
                that.fieldConfig[dataElement.fieldName].values = values;
                toot(true);
            }).catch((error) => {
                boot(`addDataElementCallback(${dataElement.fieldName}) | failed to fetch menuQuery: ${error}`);
            });
        }else{
            toot(false);
        }
    }));
}




/*
    handleValueListUpdate(fieldName, valueList, dataElementRef)
    the list of menu options for a field has changed on the dataElement
    if we have an open formView, pass this on to the wcARSFormView.updateFieldMenu() function

    other types of views eventually as well, obviously
*/
handleValueListUpdate(fieldName, valueList, dataElementRef){

    // debug
    this.log(`[${this.formName}]: ${this.entryId} | handleValueListUpdate(${fieldName})`, true);

    if (this.formView instanceof wcARSFormView){
        this.formView.updateFieldMenu(fieldName, valueList);
    }
}




/*
    fieldEditableStateChange({ fieldID: <colName>, editable: <bool>, oldEditable: <bool>})
    this fires when a dataElement's .editable boolean has changed value
    here we distribute that change to any instantiated UIs
*/
fieldEditableStateChange(args){
    // debug
    this.log(`[${this.formName}]: ${this.entryId} | fieldEditableStateChange(${args.fieldID}, ${args.editable})`, true);

    if ((this.formView instanceof wcARSFormView) && (args.editable != args.oldEditable)){
        this.formView.updateFieldProperties(args.fieldID, "editable", args.editable, args.oldEditable);
    }
}




/*
    fieldNullableStateChange({ fieldID: <colName>, nullable: <bool>, oldNullable: <bool>})
    this fires when a dataElement's .nullable boolean has changed value
    here we distribute that change to any instantiated UIs
*/
fieldNullableStateChange(args){
    // debug
    this.log(`[${this.formName}]: ${this.entryId} | fieldNullableStateChange(${args.fieldID}, ${args.nullable})`, true);

    if ((this.formView instanceof wcARSFormView) && (args.nullable != args.oldNullable)){
        this.formView.updateFieldProperties(args.fieldID, "nullable", args.nullable, args.oldNullable);
    }
}




/*
    handleAttributeStateChange({ fieldID: <colName>, name: <str>, value: <bool>, oldValue: <bool>, fieldReference: <noiceCoreValue>})
    this is just a UI hook for setting the value of arbitrary attribute (identified by 'name')
    here we distribute that change to any instantiated UIs
*/
handleAttributeStateChange(args){
    // debug
    this.log(`[${this.formName}]: ${this.entryId} | handleAttributeStateChange(${args.fieldID}, ${args.name}, ${args.value})`, true);

    if ((this.formView instanceof wcARSFormView) && (args.value != args.oldValue)){
        this.formView.updateFieldProperties(args.fieldID, args.name, args.value, args.oldValue);
    }
}

/*
    NOTE 5/22/24 @ 1042
    separate triggers for editable, display. and nullable and they all point to
    updateFieldProperties?

    for the moment these three props are all I need, but pretty much thinking we should just
    have an "attributeUpdate" thing unified for all of em.
*/




/*
    unsetDataElementAttribute(fieldName, attributeName)
    this sets attribute identified by attributeName on the dataElement
    identified by fieldName to the value contained in the config
    (with current .mode override as well)

    this allows us to toggle things like editable, display, values and nullable
    all willy-nilly and restore the running config after
*/
unsetDataElementAttribute(fieldName, attributeName){
    if ((this.dataElements[fieldName] instanceof Object) && (this.fieldConfig[fieldName] instanceof Object)){
        let oc = Object.assign(
            {},
            this.fieldConfig[fieldName],
            (
                (this.fieldConfig[fieldName].modes instanceof Object) &&
                (this.fieldConfig[fieldName].modes[this.mode] instanceof Object)
            )?this.fieldConfig[fieldName].modes[this.mode]:{}
        );
        if (oc.hasOwnProperty(attributeName)){
            // this is getting convoluted LOL
            if (['nullable', 'editable', 'values'].indexOf(attributeName) >= 0){
                this.dataElements[fieldName][attributeName] = oc[attributeName];
            }else{
                this.dataElements[fieldName].setAttribute(attributeName, oc[attributeName]);
            }
        }
    }
}




/*
    validationCallbackHandler({fieldID: colName, value:value, fieldReference: self})
    this is the validationCallback() for every dataElement wired together, as a kinda grand-central
    validationCallback distributor. This is noiceCoreRow class override, as we need to pass the
    threadClient and such to the per-field config-embedded validator() function

    note: we can't call it "validationCallback" in the config as that'll overwrite the hard-coded
    validationCallback in noiceCoreRow.getDataElement() that points to here. so it's 'validator'
    instead. Which I've gotta admit, is a far more badass name anyhow LOL.
*/
validationCallbackHandler(args){
    let that = this;
    return(new Promise((toot, boot) => {
        if (
            (args instanceof Object) &&
            args.hasOwnProperty('fieldID') &&
            that.isNotNull(args.fieldID) &&
            args.hasOwnProperty('value') &&
            args.hasOwnProperty('fieldReference') &&
            (args.fieldReference instanceof Object) &&
            (that.fieldConfig[args.fieldID] instanceof Object) &&
            (that.fieldConfig[args.fieldID].validator instanceof Function)
        ){
            toot(that.fieldConfig[args.fieldID].validator(that.threadClient, args.fieldReference, args.value, that));
        }else{
            // no validator callback, just play nice and return all good
            toot(true);
        }
    }))
}




/*
    setRowData(v)
    override -- this forces us to call initFormFields() before setting rowData
    this is just a switch, at the end of the day we're just passing through to super.setRowData
*/
setRowData(v){
    let that = this;
    return(new Promise((toot, boot) => {
        this.initFormFields();
        toot(super.setRowData(v));
    }));
}




/*
    getCloneRow(appUserAUID)
    return a new noiceARSRow instance cloned from this one
    this constructs a new row in mode:clone with data copied
    from this row, with static overrides and config defined
    options set

    defaultFieldOverrides is an object of fields you wanna
    set default override values for (beyond the out of the box
    ones: Entry ID, Create Date, Modified Date)
*/
getCloneRow(defaultFieldOverrides){
    let that = this;
    return(new Promise((toot, boot) => {

        // static defaults 'Entry ID', 'Create Date', 'Modified Date'
        let entryIDFN = this.threadClient.threadInfo.formDefinitions[this.formName].idIndex['1'].name;
        let createDateFN = this.threadClient.threadInfo.formDefinitions[this.formName].idIndex['3'].name;
        let modifiedDateFN = this.threadClient.threadInfo.formDefinitions[this.formName].idIndex['6'].name;
        let defaultOverrides = {};
        defaultOverrides[entryIDFN] = getGUID();
        defaultOverrides[createDateFN] = that.epochTimestamp();
        defaultOverrides[modifiedDateFN] = that.epochTimestamp();

        // hard-coded field value overrides
        let cloneRowData = Object.assign({}, that.rowData, defaultOverrides, (defaultFieldOverrides instanceof Object)?defaultFieldOverrides:{});

        // reset values where inheritValue == false in the clone mode config
        Object.keys(that.fieldConfig).filter((fieldName) => {return(
            (that.fieldConfig[fieldName] instanceof Object) &&
            (that.fieldConfig[fieldName].modes instanceof Object) &&
            (that.fieldConfig[fieldName].modes.clone instanceof Object) &&
            that.fieldConfig[fieldName].modes.clone.hasOwnProperty('inheritValue') &&
            (that.fieldConfig[fieldName].modes.clone.inheritValue == false) &&
            cloneRowData.hasOwnProperty(fieldName)
        )}).forEach((fieldName) => {cloneRowData[fieldName] = '';});

        new noiceARSRow({
            formName: that.formName,
            threadClient: that.threadClient,
            auxFieldConfig: Object.assign({}, that.auxFieldConfig),
            mode: 'clone'
        }).setRowData(cloneRowData).then((cloneRow) => {

            // handle inheritUndoValue ones here
            Object.keys(that.fieldConfig).filter((fieldName) => {return(
                (that.fieldConfig[fieldName] instanceof Object) &&
                (that.fieldConfig[fieldName].modes instanceof Object) &&
                (that.fieldConfig[fieldName].modes.clone instanceof Object) &&
                that.fieldConfig[fieldName].modes.clone.hasOwnProperty('inheritUndoValue') &&
                (that.fieldConfig[fieldName].modes.clone.inheritUndoValue == true) &&
                that.isNotNull(that.rowData[fieldName]) &&
                cloneRow.dataElements.hasOwnProperty(fieldName)
            )}).forEach((fieldName) => {
                cloneRow.dataElements[fieldName].undoValue = that.rowData[fieldName];
            });

            toot(cloneRow);

        }).catch((error) => {
            that.log(`getCloneRow() | setRowData() on new row from cloned data threw unexpectedly: ${error}`);
            boot(error);
        });
    }));
}




/*
    handleFieldUndoFromView(formElement, btnUndo, selfRef)

    the undo button was clicked on a field in a view, this
    receives the event with a reference to the formElement
    it's btnUndo and the formView it resides in
*/
handleFieldUndoFromView(formElement, btnUndo, selfRef){
    if (
        (this.dataElements instanceof Object) &&
        (this.dataElements[formElement.fieldName] instanceof Object)
    ){
        // just a quick mic check
        this.dataElements[formElement.fieldName].undo();
    }

}




}
export { noiceARSRow };
