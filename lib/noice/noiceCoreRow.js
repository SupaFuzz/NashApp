/*
    noiceCoreRow.js
    Amy Hicox <amy@hicox.com> 4/1/24

    this models a collection of noiceCoreValue elements related by the fact that they
    all belong to the same record. Where noiceCoreValue objects  might abstract "columns",
    nocieCoreRow objects abstracts a row.

    attributes:

        - changeFlag                <bool> default: false
        - changeFlagCallback        <function(n,o,s){...}>
        - dataElements              <obj> default: {} | { <fieldID>: <noiceCoreValue>, ...}
        - hasDataElements           <bool> default: false | true if at least once noiceCoreValue is instantiated in .dataElements
        - rowData                   <obj> default: {} | { <fieldID>:<value>, ... } - note: setting this wipes out and reinstantiates all the dataElements
        * logCallback               <function(str)>
        * saveCallback              <function(this.rowData)>
        - validationErrors          <obj { <fieldID>:[{validationError}, ...]}
        - validationWarnings        <obj { <fieldID>:[{validationWarning}, ...]}
        - hasErrors                 <bool> default: false
        - hasWarnings               <bool> default: false
        - fieldConfig               <obj> default: {} | { <fieldID>:{<configAttribute>:<value>,
        - saveOnChange              <bool default: false>
        - changedFields             <obj {<fieldID>:{value: <value>, oldValue: <oldValue>, selfRef}, ... }>
        - addDataElementCallback    <async function(dataElement)> - if specified, is called with the dataElement reference when a dataElement is spawned for the row (see set rowData)
        - removeDataElementCallback <async function(dataElement)> - if specified is called when a dataElement is removed. we will await resolution before deleting the dataElement, however promise rejections are ignored

    functions:
        - log(str, debugModeLogBool) -      will failover to console.log if not logCallback is specified
        - save(forceBool) -                 awaits validdate(), aborts if validationErrors unless forceBool set, calls saveCallback(), resets changeFlags and validations, returns this.rowData (post save)
        - validate() -                      executes validate against all fields in .dataElements, returns or of all hasErrors from all fields
        - modify(fieldValues) -             updates the row with the specified field values, rejects promise on validationErrors but does not revert change. resolves to this.rowData on success
        - async getDataElement(fieldID, defaultValue) - creates or updates the dataElement identified by fieldID and sets the optional defaultValue. Returns the dataElement reference too. If addDataElementCallback is present we await that before returning if we had to spawn a new one
        - removeDataElement(fieldID)        removes the dataElement identified by fieldID, if removeDataElementCallback is specified, we will call that and await it's resolution before removing the field

    to-do in extension class:
        * extend config to implement validationCallbacks
        * extend config to implement valueTransformers (input/output filters basically)
        * arsRow extension class abstracts formConfig to generate fieldConfig
*/
import { noiceObjectCore, noiceException, noiceCoreChildClass } from './noiceCore.js';
import { noiceCoreValue } from './noiceCoreValue.js';
class noiceCoreRow extends noiceCoreChildClass {




/*
    constructor({

    })
*/
constructor(args, defaults, callback){
    super(args, noiceObjectCore.mergeClassDefaults({
        _version: 1,
        _className: 'noiceCoreRow',
        _rowData:   {},
        _dataElements: {},
        _hasErrors: false,
        _validationErrors: {},
        _hasWarnings: false,
        _validationWarnings: {},
        _fieldConfig: {},
        _hasDataElements: false,
        _changeFlag: false,
        _changedFields: {},
        saveOnChange: false

    },defaults),callback);

    // do init stuffs here, yo!

}




/*
    log(str, debugOnlyBool)
    log a string, either to console.log or to .logCallback if specified
    if debugOnlyBool is set true, only execute log if this.debug == true
*/
log(str, debugOnlyBool){
    if ((debugOnlyBool !== true) || ((this.debug === true) && (debugOnlyBool === true))){
        let logger = (this.logCallback instanceof Function)?this.logCallback:console.log;
        logger(`${this._className} v${this._version} | ${str}`);
    }
}




/*
    save(forceBool)
    await saveCallback() if we have one, then reset the changeFlag on all the fields
    no need to actually blow away undoValues I don't suppose.
*/
save(forceBool){
    let that = this;
    return(new Promise((toot, boot) => {

        // validation stuff
        new Promise((_t,_b) => { _t((forceBool === true)?true:that.validate()) }).then((recordIsOK) => {
            if (recordIsOK){

                // await saveCallback if we got one
                new Promise((_t,_b) =>{ _t((that.saveCallback instanceof Function)?that.saveCallback(that.rowData, that):false); }).then(() => {

                    // reset change flags
                    Object.keys(that.dataElements).filter((a)=>{return(that.dataElements[a].changeFlag)}).map((a)=>{return(that.dataElements[a])}).forEach((field) => {
                        field.changeFlag = false;
                    });
                    that.changeFlag = false;

                    // if we were in force mode, reset validation errors as well
                    if (forceBool === true){
                        Object.keys(that.dataElements).filter((a)=>{return(that.dataElements[a].errors.length > 0)}).map((a)=>{return(that.dataElements[a])}).forEach((field) => {
                            field.clearValidationErrors();
                            field.clearValidationWarnings();
                        });
                    }

                    // await savedCallback if we have one
                    new Promise((_t,_b) =>{ _t((that.savedCallback instanceof Function)?that.savedCallback(that.rowData, that):false); }).catch((error) => {
                        that.log(`save(${forceBool}) | ignored | savesCallback() threw unexpectedly: ${error}`);
                    }).then(() => {

                        // all done!
                        toot(that.rowData);
                    });

                }).catch((error) => {
                    // saveCallback threw
                    that.log(`save(${forceBool}) | saveCallback() threw unexpectedly: ${error}`);
                    boot(error);
                });

            }else{
                // abort for validation errorrs
                that.log(`save(${forceBool}) | validation errors prevent save`, true);
                boot('validation errors prevent save');
            }

        }).catch((error) => {

            // validate() threw
            // NOTE: this is a legit error, not a validation error
            that.log(`save(${forceBool}) | validate() threw unexpectedly: ${error}`);
            boot(error);
        });
    }));
}




/*
    modify({<fieldID>:<value>, ...})
    apply specified field changes, resolve to post-filtered/actioned record
    else if validation errors, boot
*/
modify(fieldValues){
    let that = this;
    return(new Promise((toot, boot) => {
        if (fieldValues instanceof Object){
            Promise.all(Object.keys(fieldValues).filter((fieldID) =>{return(
                that.dataElements.hasOwnProperty(fieldID)
            )}).map((fieldID) => {return(
                that.dataElements[fieldID].setValue(fieldValues[fieldID])
            )})).then(() => {
                if (that.hasErrors){
                    boot(`row has validation errors`);
                }else{
                    new Promise((_t,_b) =>{_t((that.saveOnChange === true)?that.save():that.rowData)}).then((rowData) => {
                        toot(rowData);
                    }).catch((error) => {
                        // saveOnChange / save() threw?!
                        that.log(`modify(${JSON.stringify(fieldValues)}) | saveOnChange enabled | save() threw unexpectedly: ${error}`);
                        boot(error);
                    });
                }
            }).catch((error) => {
                // one or more setValue calls threw
                that.log(`modify(${JSON.stringify(fieldValues)}) | at least one setValue() threw unexpectedly: ${error}`);
                boot(error);
            });
        }else{
            that.log(`modify() | invalid input`, true);
            boot('invalid input');
        }
    }));
}




/*
    validate()
    execute validate() on all of the fields in dataElements
    resolve to a bool. true if no validation errors, else false
*/
validate(){
    let that = this;
    return(new Promise((toot, boot) => {
        Promise.all(Object.keys(that.dataElements).map((fieldID) => { return(that.dataElements[fieldID].validate()); })).then(() => {
            toot(Object.keys(that.dataElements).filter((fieldID) => {return(that.dataElements[fieldID].hasErrors)}).length == 0);
        }).catch((error) => {
            that.log(`validate() | at least one field validate() call threw (see log) | ${error}`);
            boot(error);
        });
    }));
}








/*
    --------------------------------------------------------------------------------
    ATTRIBUTES
    --------------------------------------------------------------------------------
*/




// hasDataElements (bool / read-only) -- true if we have as many dataElements as we do rowData keys
get hasDataElements(){
    let da = this.dataElements;
    return(
        Object.keys(da).filter((a) =>{ return(da[a] instanceof noiceCoreValue) }).length ==
        Object.keys(da).length
    );
}




/*
    fieldConfig
    {<fieldID>: {key:value, ...}}
*/
get fieldConfig(){ return(this._fieldConfig); }
set fieldConfig(v){
    if (v instanceof Object){ this._fieldConfig = v; }
    Object.keys(this.dataElements).filter((a) => {
        return(this._fieldConfig[a] instanceof Object)
    }, this).map((a)=>{return(
        this.dataElements[a]
    )}, this).forEach((field) => {
        Object.keys(this._fieldConfig[field.fieldID]).forEach((a) => {field[a] = this._fieldConfig[field.fieldID][a]; })
    }, this);
}




// dataElements (object / read-only) -- { <fieldName>: <noiceCoreValue Object>, ... }
get dataElements(){ return(this._dataElements); }
set dataElements(v){ if (v instanceof Object){ this._dataElements = v;} }

// rowData - read-write -- { <fieldName>: <value>, ... }
get rowData(){
    let that = this;
    if (that.hasDataElements){
        let tmp = {};
        Object.keys(that.dataElements).forEach((o) =>{ tmp[o] = that.isNull(that.dataElements[o].value)?'':that.dataElements[o].value; });
        return(tmp);
    }else{
        return(that._rowData);
    }
}
set rowData(v){ this.setRowData(v); }
setRowData(v){
    let that = this;
    return(new Promise((toot, boot) => {
        if (v instanceof Object){

            // spawn and update existing dataElements
            Promise.all(Object.keys(v).map((colName) => { return(this.getDataElement(colName, v[colName])) }, this)).then(() => {

                // prune dataElements that no longer exist in the input
                Promise.all(Object.keys(this.dataElements).filter((fieldID) => {return(!(v.hasOwnProperty(fieldID)))}, this).map((fieldID) => {
                    return(that.removeDataElement(fieldID));
                }, this)).then(() => {

                    // await dataLoadedCallback if we've got one
                    new Promise((_t) => {_t((that.dataLoadedCallback instanceof Function)?that.dataLoadedCallback(that.rowData, that):false)}).then(() => {

                        if (that.isNotNull(that.mode)){ that.mode = that.mode; }
                        toot(that);
                    }).catch((error) => {
                        boot(`dataLoadedCallback threw unexpectedly: ${error}`);
                    });

                }).catch((error) => {
                    boot(`failed to remove at least one dataElement (see log): ${error}`);
                });

            }).catch((error) => {
                boot(`failed to create at least one dataElement (see log): ${error}`);
            });

        }else{
            boot('input is not an Object');
        }
    }))
}



/*
    removeDataElement(fieldID)
    remove the noiceCoreValue object on the .dataElements attribute
    identified by fieldID. If removeDataElementCallback is sspecified
    call that first.

    NOTE: if removeDataElementCallback rejects it's promise, we'll log it
    and otherwise ignore it, still removing the dataElement
*/
removeDataElement(fieldID){
    let that = this;
    return(new Promise((toot, boot) => {
        if (that.dataElements.hasOwnProperty(fieldID)){
            new Promise((_t) => {_t((that.removeDataElementCallback instanceof Function)?that.removeDataElementCallback(that.dataElements[fieldID]):true)}).catch((error) => {
                that.log(`removeDataElement(${fieldID}) | ignored | removeDataElementCallback() threw unexpectedly | ${error}`);
            }).then(() => {
                delete(that.dataElements[fieldID]);
                toot(true);
            });
        }
    }));
}



/*
    getDataElement(colName, defaultValue)
    this returns the dataElement on this.dataElements, corresponding to colName
    if no matching dataElement is found this will create a new one, and return that
    append it to this.dataElements (that's on the caller)

    if we had to create the dataElement and addDataElementCallback is specified, we call that
*/
getDataElement(colName, defaultValue){
    let that = this;
    return(new Promise((toot, boot) => {
        if (that.isNotNull(colName)){

            // if we don't have one, make one
            if (! (that.dataElements.hasOwnProperty(colName))){
                that.dataElements[colName] = new noiceCoreValue(Object.assign({},
                    {
                        editable: true,
                        validateOnChange: true,
                        fieldID: colName,
                        defaultValue: that.isNotNull(defaultValue)?defaultValue:null,
                        valueChangeCallback: async(n,o,s) => { return(that.valueChange({ fieldID: colName, newValue: n, oldValue: o, fieldReference: s })); },
                        valueChangedCallback: async(n,o,s) => { return(that.valueChangePostHook({ fieldID: colName, newValue: n, oldValue: o, fieldReference: s })); },
                        validationCallback: async(value, self) => { return(that.validationCallbackHandler({fieldID: colName, value:value, fieldReference: self})); },
                        validationStateChangeCallback: (e, w, errs, s) => { that.fieldValidationStateChange({ fieldID: colName, hasErrors: e, hasWarnings: w, errors: errs, fieldReference: s })},
                        editableStateChangeCallback: (t,f,s) => { that.fieldEditableStateChange({fieldID: colName, editable: t, oldEditable: f, fieldReference: s}) },
                        nullableStateChangeCallback: (t,f,s) => { that.fieldNullableStateChange({fieldID: colName, nullable: t, oldNullable: f, fieldReference: s}) },
                        attributeChangeCallback: (n, t,f,s) => { that.handleAttributeStateChange({fieldID: colName, name: n, value: t, oldValue: f, fieldReference: s}) },
                        //displayStateChangeCallback: (t,f,s) => { that.fieldDisplayStateChange({fieldID: colName, display: t, oldDisplay: f, fieldReference: s}) },
                        changeFlagCallback: (n, o, s) => { that.fieldChangeFlagToggle({fieldID: colName, changeFlag: n, oldChangeFlag: o, fieldReference: s}); },
                        logCallback: (a,b) => { that.log(a,b); },
                        dataInputFilter: (v,s) => { return((that.dataInputFilter instanceof Function)?that.dataInputFilter(v,s):v) }
                    },
                    (that.fieldConfig[colName] instanceof Object)?that.fieldConfig[colName]:{}
                ));
                new Promise((_t) => {_t((that.addDataElementCallback instanceof Function)?that.addDataElementCallback(that.dataElements[colName]):true)}).then(() => {
                    toot(that.fieldConfig[colName]);
                }).catch((error) => {
                    // addDataElementCallback barfed
                    that.log(`getDataElement(${colName}, ${defaultValue}) | created dataElement but addDataElementCallback() threw unexpectedly: ${error}`);
                    boot(error);
                });
            }else{
                // if we already have the dataElement and just have a new default value, await that
                new Promise((_t) => {_t(((that.isNotNull(defaultValue) && that.dataElements.hasOwnProperty(colName)))?that.dataElements[colName].setValue(defaultValue, true):false)}).then(() => {
                    toot(that.fieldConfig[colName]);
                }).catch((error) => {
                    // setValue for default value barfed?
                    that.log(`getDataElement(${colName}, ${defaultValue}) | setting new defaultValue for existing dataElement threw unexpectedly: ${error}`);
                    boot(error);
                });
            }
        }else{
            // no colName
            boot(`invalid input: 'colName' is required`);
        }
    }));
}




// changeFlag
get changeFlag(){
    return((Object.keys(this.dataElements).filter((a)=>{return(this.dataElements[a].changeFlag)}, this )).length > 0);
}
set changeFlag(v){
    let to = (v === true);
    if (this.changeFlagCallback instanceof Function){
        this.changeFlagCallback(to, this._changeFlag, this);
    }
    this._changeFlag = to;
}




// validationErrors
get validationErrors(){
    let that = this;
    let out = {};
    Object.keys(that.dataElements).filter((fieldID) => {return(that.dataElements[fieldID].hasErrors)}).forEach((fieldID) => {
        out[fieldID] = that.dataElements[fieldID].errors.filter((a) => {return(a.severity == "error")});
    });
    return(out);
}




// validationWarnings
get validationWarnings(){
    let that = this;
    let out = {};
    Object.keys(that.dataElements).filter((fieldID) => {return(that.dataElements[fieldID].hasWarnings)}).forEach((fieldID) => {
        out[fieldID] = that.dataElements[fieldID].errors.filter((a) => {return(a.severity == "warning")});
    });
    return(out);
}




// hasErrors
get hasErrors(){
    return(Object.keys(this.dataElements).filter((fieldID) => {return(this.dataElements[fieldID].hasErrors)}, this).length > 0);
}




// hasWarnings
get hasWarnings(){
    return(Object.keys(this.dataElements).filter((fieldID) => {return(this.dataElements[fieldID].hasWarnings)}, this).length > 0);
}




// changedFields
get changedFields(){
    let out = {};
    Object.keys(this.dataElements).filter((fieldID) => {return(this.dataElements[fieldID].changeFlag)}, this).map((fieldID) => {return(this.dataElements[fieldID])}, this).forEach((field) => {
        out[field.fieldID] = { value: field.value, oldValue: field.undoValue, fieldReference: field };
    });
    return(out);
}







/*
    --------------------------------------------------------------------------------
    FIELD CALLBACKS
    these functions are executed as callbacks on the fields in this.dataElements
    --------------------------------------------------------------------------------
*/




/*
    fieldChangeFlagToggle({fieldID: <colName>, changeFlag: <bool>, oldChangeFlag: <bool>, fieldReference: <noiceCoreValue>})
    the changeFlag has been *potentially* affected in a field in this.dataElements -= to be sure, check old != new values
    also update this.changeFlag from here, which allows the this.changeFlagCallback to do it's thing.
    UI subclasses may want to inject something here for updating changed field visual status
*/
fieldChangeFlagToggle(args){
    let that = this;
    if (args.changeFlag != args.oldChangeFlag){
        let otherChangeFlags = (Object.keys(that.dataElements).filter((a)=>{return( (a.fieldID != args.fieldID) && a.changeFlag )}).length > 0);
        that.changeFlag = (args.changeFlag || otherChangeFlags);
    }
}




/*
    fieldNullableStateChange({ fieldID: <colName>, editable: <bool>, oldEditable: <bool>, fieldReference: <noiceCoreValue>})
    this is just a UI hook for toggling nullable visually
    actually maybe this doesn't even belong here and we ought to inject this from
    a ui subclass. I dunno. placeholder for now.
*/
fieldNullableStateChange(args){
    // placeholder
    return(true);
}




/*
    handleAttributeStateChange({ fieldID: <colName>, name: <str>, value: <bool>, oldValue: <bool>, fieldReference: <noiceCoreValue>})
    this is just a UI hook for setting the value of arbitrary attribute (identified by 'name')
    this is a placeholder in this class. override in subclases to handle it
*/
handleAttributeStateChange(args){
    // placeholder
    return(true);
}




/*
    fieldEditableStateChange({ fieldID: <colName>, editable: <bool>, oldEditable: <bool>})
    this is also just a UI hook -- this one for lock/unlocking fields visually
*/
fieldEditableStateChange(args){
    // placeholder
    return(true);
}




/*
    fieldValidationStateChange({ fieldID: <colName>, hasErrors: <bool>, hasWarnings: <bool>, errors: <array>, fieldReference: <noiceCoreValue Object> }
    a field's validation state has changed
    I suppose you could hang something off here to update *this* object's .hasErrors bool or what have you.
    but really this is also a UI hook for toggling validation error indicators and whatnot
*/
fieldValidationStateChange(args){
    // placeholder
    return(true);
}




/*
    valueChange({ fieldID: <colName>, newValue: <val>, oldValue: <val>, fieldReference: <noiceCoreValue object> })
*/
valueChange(args){
    return(new Promise((toot, boot) => {
        // place holder
        toot(args.newValue);
    }));
}




/*
    valueChangePostHook({ fieldID: <colName>, newValue: <val>, oldValue: <val>, fieldReference: <noiceCoreValue object> })
    exactly like valueChange, except that the resolution or fulfillment status of this function affects nothing and
    it is executed *after* the field value change has been committed to the field -- use this to drive consequence free
    stuff like UI indicators. Use valueChange to control value change flow and await commits, etc.
*/
valueChangePostHook(args){
    return(new Promise((toot, boot) => {
        // place holder
        toot(args.newValue);
    }));
}




/*
    validationCallbackHandler({fieldID: colName, value:value, fieldReference: self})
    this is the validationCallback() for every dataElement wired together, as a kinda grand-central
    validationCallback distributor

    a few things:

        * validationCallbacks - insert your own validationError/warnings on the field reference
          resolve to a bool: true (we're good), false (there are errors) -- this is by convention
          nothing really executes on that resolve bool (at least presently) -- we're gonna check
          .hasErrors and .hasWarnings really. But that's how we're gonna do it

        * this function executes per-field.
          if (fieldConfig[args.fieldID].validationCallback instanceof Function), we're gonna
          execute that and resolve with whatever bool it returns

        * row-level validations
          yeah. there's gonna be some validations that can only be performed at the row level
          like "this field + that one, on second tuesday of the month" kinda crap
          THAT is gonna go in noiceCoreRow.validationCallback() executed out of noiceCoreRow.validate()
          NOTE: noiceCoreRow.validate() exists but just executes noiceCoreValue.validate() on all fields.
          so got some work yet to do on that  -- actually for the moment i'm just ignoring this
          we DO NOT do row-level validations at this stage. maybe later. for now if you wanna validate
          it's gotta be on a specific field
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
                (args.fieldReference instanceof noiceCoreValue) &&
                (row.fieldConfig[args.fieldID] instanceof Object) &&
                (row.fieldConfig[args.fieldID].validationCallback instanceof Function)
        ){
            toot(row.fieldConfig[args.fieldID].validationCallback(args.value, args.fieldReference));
        }else{
            // no validator callback, just play nice and return all good
            toot(true);
        }
    }))
}



}
export { noiceCoreRow };
