/*
    noiceCoreValue.js
    Amy Hicox <amy@hicox.com> 3/29/24

    this models a data element value.
    which is to say an object container for a single value with lots of stuff
    this is basically the non-UI backend for on-screen fields eh?

        attributes:
        *   .value                  <any legal javascript value>
        *   .undoable               <bool (default:false)>
        *   .undoValue              <null or the value of .value last time .changeFlag was false>
        *   .previousValue          <the previous value of .value, if no previous change will be the defaultValue>
        *   .valueChangeCallback    <async function(value, undoValue, selfRef)> -- executes BEFORE value change (abortable)
        *   .valueChangedCallback   <async function(value, undoValue, selfRef)> -- executes AFTER value changed (non-abortable)
        *   .hasErrors              <bool (default:false)> returns true if .errors contains 1 or more error objects with severity:error
        *   .errors                 <array-of-objects> (noiceExceptionObjects)
        *   .values                 <array-of-values (default:[])> array of legal values for the field
        *   .setValuesCallback      <function (values, self)> -- gets called when you set .values
        *   .enforceMenuValues      <bool (default:true)> if .values specified, throw error on validate() if value not in .values
        *   .display                <bool (default:false)> just an arbirary bool. we call displayStateChangeCallback() when it changes value.
        *   .nullable               <bool (default:false>)> .validate() will throw an error if value is null
        *   .editable               <bool (default:true>)> if set false attmpts to set .value will be bypassed
        *   .validateOnChange       <bool (default:true)> call .validate() on changes to .value unless set false
        *   .validationCallback     <async function(value, self)> if specified call this on .validate
        *   .hasWarnings            <bool: default:false> true if .errors contains 1 or more error ob jects with severity:warning
        *   .changeFlag             <boo; default:false> true if .value !== .undoValue -- note this only really works if undoable is set
        *   .changeFlagCallback     <function(newBool, oldBool, self) -- executed when changeFlag changes value (if specified)
        *   .logCallback            <function(string, self)>
        *   .debug                  <bool: default false>
        *   .validationStateChangeCallback: <function(hasErrors, hasWarnings, errors, self)>
        *   .editableStateChangeCallback:   <function(editableBool, oldEditableBool, self)>
        *   .nullableStateChangeCallback:   <function(nullableBool, oldNullableBool, self)>
        *   .displayStateChangeCallback:    <function(displayBool, oldDisplayeBool, self)>
            .defaultValue           <any> if specified at instantiation initialize this value wihhout triggering callbacks and init changeFlag false

        functions:
        *   async setValue(value, bool)     change the value of .value resolves or rejects after handling callbacks
                                            if bool is hot, don't execute valueChangeCallback, just directly set the value and exit

        *    async undo(bool)                reset .value to .undoValue, if undoBool pass that to setValue
        *    async validate()                resolves true if no errors found, false otherwise. executes .validationCallback and
                                            handles .nullable and .enforceMenuValues
        *    addValidationError(errorNum)       where 'error' is a noiceException object with a sevierty of 'warning' or 'error'
        *    removeValidationError(errorNum)
        *    clearValidationErrors()
        *    clearValidationWarnings()

        *    log(str)                        if .logCallback is there, send it to that, else console.log

        some things you might wanna extend onto here
            * types & type-based validations
            * limits & limit validations
            * a UI (lol)

        NOTE: as of 3/29/24 @ 1723 -- this has been coded but not tested
        next steps:
            * test suite
            * documentation
            * extensions above
            * a UI class noiceCoreUIInput? (not digging the "formInput" terminology from this morning )
*/
import { noiceObjectCore, noiceException, noiceCoreChildClass } from './noiceCore.js';
class noiceCoreValue extends noiceCoreChildClass {




/*
    constructor({
        value: <>
        ... all that stuff up there ...
    })
*/
constructor(args, defaults, callback){
    super(args, noiceObjectCore.mergeClassDefaults({
        _version: 1,
        _className: 'noiceCoreValue',
        _value: null,
        _undoValue: null,
        _previousValue: null,
        _hasErrors: false,
        _hasWarnings: false,
        _errors: [],
        _values: [],
        _enforceMenuValues: false,
        _nullable: false,
        _editable: false,
        _display:  true,
        _validateOnChange: true,
        _changeFlag: false,
        debug: false
    },defaults),callback);

    // init default value if one was specified
    if (this.hasOwnProperty('defaultValue')){
        this._defaultValue = this.defaultValue;
        this.setValue(this.defaultValue, true);
    };

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
    value
    setValue -> valueChangeCallback() -> undoable/set undoValue -> set ._value -> valueChangedCallback() -> setChangeFlag
*/
get value(){ return(this._value); }
set value(v){
    let that = this;
    this.setValue(v).catch((error) => {
        that.log(`value attribute setter | setValue() threw unexpectedly: ${error}`, true);
    })
}
setValue(v, bypassBool, bypassEditable, bypassValueChangedCallback){
    let that = this;
    return(new Promise((toot, boot) => {
        if ((that.editable) || (bypassEditable === true)){

            if (bypassBool === true){
                that._value = that.dataTypeMunger(v);
                that._undoValue = that._value;
                that._previousValue = that._value;
                that._changeFlag = false;
                that.validate().then(() => { toot(that.value); });
            }else{
                // handle valueChangeCallback if we have one
                new Promise((_t,_b) => { _t((that.valueChangeCallback instanceof Function)?that.valueChangeCallback(that.dataTypeMunger(v), that._previousValue, that):that.dataTypeMunger(v)); }).then((cVal) => {

                    // set the value
                    if (that.undoable){ that._undoValue = that._value; }
                    that._previousValue = that._value;
                    that._value = cVal;

                    /*
                        ok so this is an issue
                        if your value changeCallback or your valueChangedCallback add validationErrors
                        the validateOnChange is gonna blow them away

                        IF your logic needs to mustate the value of ITS OWN FIELD
                        AND does not add a validationError or warning on ITS OWN FIELD
                        THEN you can implement on valueChangeCallback()

                        IF your logic requires the new value of the field to already be set
                        AND has no side effects AND cannot introduce a warning or error
                        THEN you might want to implement on valueChangedCallback() instead

                        IF your logic introduces a new warning or error it MUST be implemented
                        as a valueChangeCallback

                        NOTE: you may have to split logic between these phases.
                        'tis what 'tis yo
                    */

                    // execute valueChangedCallback if we have one
                    new Promise((_t,_b) => { _t(((that.valueChangedCallback instanceof Function) && (! (bypassValueChangedCallback === true)))?that.valueChangedCallback(that._value, that._previousValue, that):that._value); }).catch((error) => {
                        // log it but we don't really care
                        that.log(`setValue() | valueChangedCallback() threw unexpectedly (ignored) | ${error}`, true);
                    }).then(() => {
                        that.changeFlag = (that.value !== that.undoValue);

                        // handle validation if validateOnChange is set
                        new Promise((_t,_b) => { _t(that.validateOnChange?that.validate():true); }).catch((error) => {
                            that.log(`setValue() | validateOnChange | validate() threw unexpectedly (ignored) | ${error}`);
                        }).then((valueOK) => {
                            toot(that.value);
                        });
                    });

                }).catch((error) => {
                    // valueChangeCallback aborted value change
                    that.log(`setValue() | valueChangeCallback() aborted | ${error}`, true);
                    boot(error);
                });
            }
        }else{
            that.log(`setValue() | aborted | editable is set false`, true);
            toot(that.value);
        }
    }));
}




/*
    dataTypeMunger(value, selfRef)
    this is called from setValue(). If you've specified a dataInputFilter,
    we will pass the value through that and return whatever the filter returns
    else we'll just return the input

    this is intended to normalize datatypes on the way into .value
    via a callback mechanism
*/
dataTypeMunger(value, selfRef){
    return((this.dataInputFilter instanceof Function)?this.dataInputFilter(value, this):value);
}




/*
    undoValue / changeFlag / undo / previousValue
*/
get undoValue(){ return(this._undoValue); }
set undoValue(v){ this._undoValue = v; }
get previousValue(){ return(this._previousValue); }
set previousValue(v){ this._previousValue = v; }
get changeFlag(){ return(this._changeFlag === true); }
set changeFlag(v){
    if (this.changeFlagCallback instanceof Function){ this.changeFlagCallback((v === true), this.changeFlag, this); }
    if ((! (v === true)) && (this._changeFlag === true) && (this.undoValue != this.value)){ this.undoValue = this.value; this.previousValue = this.value; }
    this._changeFlag = (v === true);
}
undo(bypassBool){
    return(this.setValue(this.undoValue, (bypassBool === true)));
}



/*
    display / nullable / validateNullable / values / enforceMenuValues / validateEnforceMenuValues
*/

get nullable(){ return(this._nullable === true); }
set nullable(v){
    let oldVal = this._nullable;
    this._nullable = (v === true);
    if (! this.nullable){ this.validateNullable(); }
    if (this.nullableStateChangeCallback instanceof Function){ this.nullableStateChangeCallback(this.nullable, oldVal, this); }
}
validateNullable(){
    if ((! this.nullable) && this.isNull(this.value)){
        this.addValidationError({
            messageNumber: 1,
            message: 'a value is required',
            severity: 'error'
        });
    }else{
        this.removeValidationError(1);
    }
    return((! this.nullable) && this.isNull(this.value));
}
get values(){ return(this._values); }
set values(v){
    if (v instanceof Array){
        this._values = v;
        if (this.enforceMenuValues){ this.validateEnforceMenuValues();}
        if (this.setValuesCallback instanceof Function){ this.setValuesCallback(this.values, this); }
    }
}
get enforceMenuValues(){ return(this._enforceMenuValues === true); }
set enforceMenuValues(v){
    this._enforceMenuValues = (v == true);
    if (this.enforceMenuValues){ this.validateEnforceMenuValues(); }
}
validateEnforceMenuValues(){
    if (
        (this.values instanceof Array) &&
        (this.values.length > 0) &&
        (this.enforceMenuValues) &&
        (this.values.indexOf(this.value) < 0) && (! (
            this.isNull(this.value) &&
            (this.allowNullMenuValue == true)
        ))
    ){
        this.addValidationError({
            messageNumber: 2,
            message: 'invalid value',
            severity: 'error'
        });
    }else{
        this.removeValidationError(2);
    }
    return(
        (this.values instanceof Array) &&
        (this.values.length > 0) &&
        (this.enforceMenuValues) &&
        (this.values.indexOf(this.value) < 0)
    )
}




/*
    validateOnChange / validate()
*/
get validateOnChange(){ return(this._validateOnChange === true); }
set validateOnChange(v){ this._validateOnChange = (v === true); }
validate(){
    let that = this;
    return(new Promise((toot, boot) => {


        that.clearValidationErrors();
        that.clearValidationWarnings();

        new Promise((_t, _b) => { _t((that.validationCallback instanceof Function)?that.validationCallback(that.value, that):true); }).catch((error) => {
            // we are ignoring boots from the validationCallback BTW.
            // if you need to set a validation error just do that in your callback and resolve false m'kay?
            that.log(`validate() | validationCallback() threw unexpectedly (ignored) | ${error}`, true);
        }).then((callbackSaysOK) => {

            // check nullable
            that.validateNullable();

            // check enforceMenuValues
            that.validateEnforceMenuValues();

            // check max / min on number types
            that.validateNumberRange();

            toot(that.hasErrors);
        })
    }));
}




/*
    validateNumberRange()
    if we're a number type, and we have a max and/or a min, throw a validation
    error if the value we have violates one of those constraints. you know the deal
    lets make it messageNumber 3 why not?
*/
validateNumberRange(){
    if (
        (['INTEGER', 'DECIMAL', 'Number', 'int', 'float'].indexOf(this.type) >= 0) && (
            (
                this.hasOwnProperty('max') &&
                (! isNaN(parseFloat(this.max))) &&
                (! isNaN(parseFloat(this.value))) &&
                parseFloat(this.value) > parseFloat(this.max)
            ) || (
                this.hasOwnProperty('min') &&
                (! isNaN(parseFloat(this.min))) &&
                (! isNaN(parseFloat(this.value))) &&
                parseFloat(this.value) < parseFloat(this.min)
            )
        )
    ){
        this.addValidationError({
            messageNumber: 3,
            message: `numeric value out of range ${(this.hasOwnProperty('min') && (! isNaN(parseFloat(this.min))))?`min: ${this.min}`:''} ${(this.hasOwnProperty('max') && (! isNaN(parseFloat(this.max))))?`max: ${this.max}`:''}`,
            severity: 'error'
        });
        return(true);
    }else{
        this.removeValidationError(3);
        return(false);
    }
}



/*
    errors / hasErrors / hasWarnings / addValidationError / removeValidationError / validationStateChangeCallback
*/
get errors(){ return(this._errors); }
set errors(v){ if (v instanceof Array){ this._errors = v; }}
get hasErrors(){ return(
    this._errors.filter((a)=>{return(
        (a instanceof Object) && a.hasOwnProperty('severity') && (a.severity == 'error')
    )}).length > 0
)}
get hasWarnings(){ return(
    this._errors.filter((a)=>{return(
        (a instanceof Object) && a.hasOwnProperty('severity') && (a.severity == 'warning')
    )}).length > 0
)}
addValidationError(error){
    if (
        (error instanceof Object) &&
        error.hasOwnProperty('messageNumber') &&
        (! isNaN(parseInt(error.messageNumber))) &&
        error.hasOwnProperty('message') &&
        this.isNotNull(error.message) &&
        (this.errors.filter((a) =>{return((a instanceof Object) && a.hasOwnProperty('messageNumber') && (parseInt(a.messageNumber) == parseInt(error.messageNumber)))}).length == 0)
    ){
        this.errors.push(new noiceException(error));
        if (this.validationStateChangeCallback instanceof Function){ this.validationStateChangeCallback(this.hasErrors, this.hasWarnings, this.errors, this); }
    }
}
removeValidationError(messageNumber){
    if (! isNaN(parseInt(messageNumber))){
        this.errors = this.errors.filter((a) => {return(
            (a instanceof Object) &&
            a.hasOwnProperty('messageNumber') &&
            (parseInt(a.messageNumber) !== parseInt(messageNumber))
        )});
        if (this.validationStateChangeCallback instanceof Function){ this.validationStateChangeCallback(this.hasErrors, this.hasWarnings, this.errors, this); }
    }
}
clearValidationErrors(){
    // just blow away all the errors
    let that = this;
    that.errors = that.errors.filter((a) => {return(
        (a instanceof Object) &&
        (a.hasOwnProperty('severity')) &&
        (a.severity !== 'error')
    )});
    if (this.validationStateChangeCallback instanceof Function){ this.validationStateChangeCallback(this.hasErrors, this.hasWarnings, this.errors, this); }
}
clearValidationWarnings(){
    // just blow away all the warnings
    let that = this;
    that.errors = that.errors.filter((a) => {return(
        (a instanceof Object) &&
        (a.hasOwnProperty('severity')) &&
        (a.severity !== 'warning')
    )});
    if (this.validationStateChangeCallback instanceof Function){ this.validationStateChangeCallback(this.hasErrors, this.hasWarnings, this.errors, this); }
}




/*
    editable
*/
get editable(){ return(this._editable === true); }
set editable(v){
    let oldVal = this.editable;
    this._editable = (v === true);
    if (this.editableStateChangeCallback instanceof Function){ this.editableStateChangeCallback(this.editable, oldVal, this); }
}




/*
    setAttribute(attributeName, attributeValue)

    use this for setting attributes without explicit setter/getters
    (for instnce: editable, nullable, values)
    this is for other less common attributes
    (for insance: max, min, maxLength, etc)

    you could of course, set the nonstandard attribute directly.
    you'd want to use this so that attributeChangeCallback() is
    invoked. Which would be important within the context of a
    noiceCoreRow subclass that has a UI like noiceARSRow for instance
    so that the UI layer can execute actions on the attribute change
*/
setAttribute(name, value){
    const oldValue = this.hasOwnProperty('name')?this.name:null;
    this[name] = value;
    if (this.attributeChangeCallback instanceof Function){ this.attributeChangeCallback(name, this[name], oldValue, this); }
}



}
export { noiceCoreValue };
