/*
    wcARSFormView.js
    4/23/24     Amy Hicox <amy@hicox.com>

    events:
    * field_value_change { name: formElement.name, value: formElement.value, formElement: formElement, self: this }
*/
import { noiceAutonomousCustomElement } from '../noiceAutonomousCustomElement.js';
import { wcFormElement } from './wcFormElement.js';
wcFormElement.registerElement('wc-form-element');
import { wcBalloonDialog } from './wcBalloonDialog.js';
wcBalloonDialog.registerElement('wc-balloon-dialog');

class wcARSFormView extends noiceAutonomousCustomElement {


static classID = wcARSFormView;
static classAttributeDefaults = {
    entry_id: { observed: true, accessor: true, type: 'str', value: '', forceAttribute: true },
    mode: { observed: true, accessor: true, type: 'enum', values: ['create', 'modify'], value: 'create', forceAttribute: true },
    disabled: { observed: true, accessor: true, type: 'bool', value: false },
    db_sync: { observed: true, accessor: true, type: 'bool', value: true, forceAttribute: true },
    change_flag: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    height: { observed: true, accessor: true, type: 'str', value: '100vh' },
    max_height: { observed: true, accessor: true, type: 'str', value: 'auto' },
    align_labels: { observed: true, accessor: true, type: 'bool', value: true },
    dialog_open: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    show_modified_field_indicator: { observed: true, accessor: true, type: 'bool', value: false },
    narrow: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    show_close_button: { observed: true, accessor: true, type: 'bool', value: true, forceAttribute: true }
};
static observedAttributes = Object.keys(this.classID.classAttributeDefaults).filter((a) =>{ return(this.classID.classAttributeDefaults[a].observed === true); });

static classStyleDefaults = {
    'background': { value: 'rgb(235, 235, 235)', global: true },
    'header-background': { value: 'radial-gradient(ellipse at top left, rgba(240, 240, 240, .25), rgba(240, 240, 240, .1), rgba(0, 0, 0, .25))', global: true },
    'header-background-color': { value: 'rgba(201, 95, 27)', global: true },
    'header-box-shadow': { value: '0px 2px 3px rgba(20, 22, 23, .25)', global: true},
    'control-font': { value: "Comfortaa", global: true },
    'header-border-bottom': { value: '.128em solid rgba(45, 45, 45, .3)', global: true },
    'header-foreground-color': { value: 'rgb(216, 210, 210)', global: true },
    'btnsave-disabled-color': { value: 'rgb(211, 218, 221)', global: true },
    'btnsave-disabled-border-color': { value: 'rgb(211, 218, 221)', global: true },
    'btnsave-color': { value: 'rgb(242, 177, 52)', global: true },
    'btnsave-background': { value: 'rgba(242, 177, 52, .35)', global: true },
    'btnsave-border': { value: '2px solid  rgba(242, 177, 52, .8)', global: true },
    'btnsave-padding': { value: '.25em .5em .25em .5em', global: true },
    'cancel-icon-light-gfx': { value: `url('./gfx/cancel-icon-light.svg')`, global: true },
    'legend-color': { value: 'rgba(201, 95, 27, .6)', global: true },
    'legend-padding': { value: '.25em .5em .25em .5em', global: true },
    'justify-field-container': { value: 'left', global: true },
    'field-container-font-size': { value: 'inherit', global: true },
    'field-container-narrow-font-size': { value: 'inherit', global: true }
};


/*
    constructor
*/
constructor(args){
    super(args);
    this._className = 'wcARSFormView';
    this._version = 1;
    this._elements = {};
    this.formElements = {};
    this._rowData = {};
    this.logger = ((args instanceof Object) && (args.logger instanceof Function))?args.logger:console.log;
    this.cssVarPrefix = '--wc-formview';
    /*
        come back here and do the throw if we don't got 'em after we figure the rest out

        things we need to instantiate
        .rowData = { fieldName: value, ... }
        .fieldConfig = { fieldName: { id: <int>, name: <str>, type: <enum>, values: [ ... ],  modes: { ... }}}

        you can use also to set indiviual field values
        .setFieldValue(name, value)

        remember -- the arsRow *owns* the wcARSFormView not the other way round
        when a field changes value it gets the valueChangeCallback(), which should be bound already to the arsRow dataElement

        setting .fieldConfig should call renderFieldContainer() again.

        also .mode that's required too or needs to default?

    */

    // attributeChangeHandlers
    this.attributeChangeHandlers = {
        // (n)ame, (o)ldValue, (v)alue, (s)elf -- you're welcome :-)
        height: (n, o, v, s) => { s.setHeight(v, o); },
        max_height: (n, o, v, s) => { s.setMaxHeight(v, o); },
        align_labels: (n, o, v, s) => { s.alignLabels(v); },
        change_flag: (n, o, v, s) => { s.setChangeFlag(v); },
        disabled: (n, o, v, s) => { s.toggleDisabled(v, o); },
        mode: (n, o, v, s) => { s.changeMode(v, o); },
        narrow: (n, o, v, s) => { s.toggleNarrow(v, o); },
        entry_id: (n, o, v, s) => { s.setEntryID(v, o); }
    };
}




/*
    getAttributeDefaults()
*/
getAttributeDefaults(){
    return(wcARSFormView.classAttributeDefaults);
}
getStyleDefaults(){
    return(wcARSFormView.classStyleDefaults);
}




/*
    getHTMLContent()
*/
getHTMLContent(){
    let div = document.createElement('div');
    div.style.height = this.height;
    div.style.maxHeight = this.max_height;
    div.className = this._className;

    /*
        insert shenanigans here
        thinking something like ...

        --------------------------------------------------
        | <entry_id>    | <mode> | <btnSave> | <db_sync> |
        --------------------------------------------------
        |                                                |
        | <field container>                              |

        we're gonna need to figure out how we want to deal with entry_id change
        and loading, etc. Also how to handle create mode.

        if this is born from markup it won't have a reference to .rowData and .fieldConfig as input
        and hence we won't know what fields to draw. So I think we'll have to render
        with a null field container, then update as we get input
    */
    div.insertAdjacentHTML('afterbegin', `
        <div class="header" data-sync="${this.db_sync}">
            <div class="recordIdentification">
                <span class="textField" data-name="entryId">${this.isNull(this.entry_id)?this.entryId:this.entry_id}</span>
                <span class="textField" data-name="mode">(${this.mode})</span>
            </div>
            <div class="buttonContainer">
                <button class="btnClose"></button>
                <button class="btnSave">${(this.mode == "create")?'create':'save'}</button>
            </div>
        </div>
        <div class="fieldContainer"></div>
    `);

    // element references
    this._elements.fieldContainer = div.querySelector('div.fieldContainer');
    this._elements.entryId = div.querySelector('span.textField[data-name="entryId"]');
    this._elements.mode = div.querySelector('span.textField[data-name="mode"]');
    this._elements.btnSave = div.querySelector('button.btnSave');
    this._elements.btnClose = div.querySelector('button.btnClose');

    // render the formElements for this mode
    this.renderFieldContainer(this._elements.fieldContainer);
    return(div);
}




/*
    arsTypeToFormElementType(arsType)
    return the wcFormElement.type value corresponding to the
    arsConfig.type. This is a simple string converter
*/
arsTypeToFormElementType(arsType){
    const arsTypeMapping = {
        'CHAR':         'text',
        'ENUM':         'select',
        'TIME':         'datetime-local',
        'DATE':         'date',
        'DECIMAL':      'number',
        'INTEGER':      'number',
        'TIME_OF_DAY':  'time',
        'CURRENCY':     'text',

        // this is a manual override to get textareas
        'textarea':     'textarea'

        /*
            unsupported remedy datatypes we'll deal with later

            ENUM has subtypes -- for now, all enum's are selects
            checkbox -> type: 'ENUM', display_properties[0].DATA_RADIO = 2
            radio    -> type: 'ENUM', display_properties[0].DATA_RADIO = 1

            DIARY and REAL -- gonna need wcFormElement extension classes
            'REAL':         ?
            'DIARY':        ?,

            may wanna make a 'CURRENCY' type extension field as well depending.
        */
    };
    return((arsTypeMapping.hasOwnProperty(arsType))?arsTypeMapping[arsType]:null);
}




/*
    getFormElement(fieldConfigEntry)
*/
getFormElement(fieldConfigEntry){
    let that = this;
    if (! this.formElements.hasOwnProperty(fieldConfigEntry.fieldName)){

        // new school
        this.formElements[fieldConfigEntry.fieldName] = new wcFormElement(Object.assign(
            { capture_value_on: 'focusoutOrReturn' },
            fieldConfigEntry,
            (fieldConfigEntry.values instanceof Array)?{ options: JSON.stringify({ values: fieldConfigEntry.values }) }:{},
            {
                type: this.arsTypeToFormElementType(fieldConfigEntry.type),
                captureValueCallback: (val, s) => { that.fieldValueChange(val, s); },
                undoCallback: (s, btn) => { that.fieldUndo(s, btn) },
                menuCallback: (s, btn) => { that.fieldMenu(s, btn) },
                default_value: this.rowData.hasOwnProperty(fieldConfigEntry.fieldName)?this.rowData[fieldConfigEntry.fieldName]:null,
                name: fieldConfigEntry.fieldName
            }
        ));

        /* old school
        this.formElements[fieldConfigEntry.fieldName] = new wcFormElement(Object.assign(
            {
                capture_value_on: 'focusoutOrReturn',
            },
            fieldConfigEntry,
            ((fieldConfigEntry.modes instanceof Object) && (fieldConfigEntry.modes[this.mode] instanceof Object))?fieldConfigEntry.modes[this.mode]:{},
            (fieldConfigEntry.values instanceof Array)?{ options: JSON.stringify({ values: fieldConfigEntry.values }) }:{},
            {
                type: this.arsTypeToFormElementType(fieldConfigEntry.type),
                captureValueCallback: (val, s) => { that.fieldValueChange(val, s); },
                undoCallback: (s, btn) => { that.fieldUndo(s, btn) },
                menuCallback: (s, btn) => { that.fieldMenu(s, btn) },
                default_value: this.rowData.hasOwnProperty(fieldConfigEntry.fieldName)?this.rowData[fieldConfigEntry.fieldName]:null,
                name: fieldConfigEntry.fieldName
            }
        ));
        */
    }

    return(this.formElements[fieldConfigEntry.fieldName]);
}




/*
    log()
    may expand this at some point, but this.logger controls where it goes
*/
log(str){
    this.logger(`${this._className} v${this._version} | ${str}`);
}




/*
    manageFormElements()

    this instantiates wcFormElement objects correlating to fields on this.fieldConfig
    where:
        this.fieldConfig[<fieldName>].modes[this.mode].display == true

    for each field matching this condition, if it does not exist, will be instantited.
    for each pre-existing field that does not exist in the config with this condition will be removed

    output is on this.formElements[fieldName]
*/
manageFormElements(){
    if ( (this.fieldConfig instanceof Object) ){

        // make anything missing
        Object.keys(this.fieldConfig).filter((fieldName) =>{return(
            (! this.formElements.hasOwnProperty(fieldName)) &&
            (this.fieldConfig[fieldName] instanceof Object) &&
            (this.fieldConfig[fieldName].modes instanceof Object) &&
            (this.fieldConfig[fieldName].modes[this.mode] instanceof Object) &&
            this.fieldConfig[fieldName].modes[this.mode].hasOwnProperty('display') &&
            (this.fieldConfig[fieldName].modes[this.mode].display === true)
        )}, this).forEach((fieldName) => { this.formElements[fieldName] = this.getFormElement(this.fieldConfig[fieldName])}, this);

        // prune anything removed
        Object.keys(this.formElements).filter((fieldName) => {return(!(
            (this.fieldConfig[fieldName] instanceof Object) &&
            (this.fieldConfig[fieldName].modes instanceof Object) &&
            (this.fieldConfig[fieldName].modes[this.mode] instanceof Object) &&
            this.fieldConfig[fieldName].modes[this.mode].hasOwnProperty('display') &&
            (this.fieldConfig[fieldName].modes[this.mode].display === true)
        ))}, this).forEach((fieldName) => {
            this.formElements[fieldName].remove();
            delete(this.formElements[fieldName]);
        }, this);

    }else{
        if (this.debug){ this.log(`${this._className} v${this._version} | manageFormElements() called with no fieldConfig`); }
    }
}




/*
    renderFieldContainer(fieldContainerElement)
    resets fieldContainer innerHTML to null
    spews the contents of this.formElements into fieldContainer
    with associated markup etc to render how you want the fields displayed
    you might want to override this in subclasses to customise display modes
    etc. ye verily.
*/
renderFieldContainer(fieldContainerElement){
    this.manageFormElements();

    /*
        TO-DO: insert shenanigans here
    */
    fieldContainerElement.innerHTML = '';

    /*
        this is a braindead render the fields in alphabetical order demo
        this should be the class default.
    */
    Object.keys(this.formElements).sort().forEach((fieldName) => {
        fieldContainerElement.appendChild(this.formElements[fieldName]);
    }, this);
}




/*
    entryId getter returns the value of fieldID = 1 (or null)
*/
get entryId(){
    return(
        (
            (this.fieldConfig instanceof Object) &&
            (Object.keys(this.fieldConfig).filter((fieldName) => { return(this.fieldConfig[fieldName].id == 1) }, this).length > 0) &&
            (this.rowData instanceof Object) &&
            this.rowData.hasOwnProperty(Object.keys(this.fieldConfig).filter((fieldName) => { return(this.fieldConfig[fieldName].id == 1) }, this)[0])
        )?this.rowData[Object.keys(this.fieldConfig).filter((fieldName) => { return(this.fieldConfig[fieldName].id == 1) }, this)[0]]:null
    )
}




/*
    defaultStyle attribute getter
*/
get defaultStyle(){
    /*
        put the internal stylesheet here
    */
    return(
`:host {
    display: block;
    position: relative;
}
:host([dialog_open="true"]) div.${this._className} {
    filter: grayscale(70%) invert(.2);
}
div.${this._className} {
    display: grid;
    grid-template-rows: auto auto;
    align-content: baseline;
    overflow: hidden;
    box-sizing: border-box;
    background-color: ${this.styleVar('background')};
}
.header {
    width: 100%;
    height: min-content;
    display: grid;
    grid-template-columns: auto auto;
    align-items: center;
    background: ${this.styleVar('header-background')};
    background-color: ${this.styleVar('header-background-color')};
    font-family:  ${this.styleVar('control-font')};
    border-bottom: ${this.styleVar('header-border-bottom')};
    box-shadow: ${this.styleVar('header-box-shadow')};
}
.header .recordIdentification {
    color: ${this.styleVar('header-foreground-color')};
    padding-left: .5em;
}
.header .buttonContainer {
    display: flex;
    flex-direction: row-reverse;
    align-items:  center;
    padding: .5em;
}
.header .buttonContainer button {
    font-size: 1em;
    margin: .25em;
    border-radius: .66em;
    font-family: ${this.styleVar('control-font')};
}
.header .buttonContainer button.btnSave:disabled {
    background-color: transparent;
    color: ${this.styleVar('btnsave-disabled-color')};
    border-color: ${this.styleVar('btnsave-disabled-border-color')};
    opacity: .5;
}
.header .buttonContainer button.btnSave {
    color: ${this.styleVar('btnsave-color')};
    background-color: ${this.styleVar('btnsave-background')};
    border: ${this.styleVar('btnsave-border')};
    padding: ${this.styleVar('btnsave-padding')};
}
:host([show_close_button="false"]) .header .buttonContainer button.btnClose {
    display: none;
}
.header .buttonContainer button.btnClose {
    width: 1.5em;
    height: 1.5em;
    border: none;
    border-radius: 0;
    background: ${this.styleVar('cancel-icon-light-gfx')};
    background-size: contain;
    background-repeat: no-repeat;
}
.fieldContainer {
    position: relative;
    overflow-y: auto;
    overflow-x: hidden;
    display: grid;
    justify-content: ${this.styleVar('justify-field-container')};
    padding-right: 2em;

}
.fieldContainer fieldset {
    margin: .5em;
    border-left: none;
    border-right: none;
    border-bottom: none;
    border-top: ${this.styleVar('header-border-bottom')};
}
.fieldContainer legend {
    color: ${this.styleVar('legend-color')};
    padding: ${this.styleVar('legend-padding')};
}
:host([narrow="true"]) .fieldContainer fieldset wc-form-element {
    font-size: ${this.styleVar('field-container-narrow-font-size')};
}
.fieldContainer fieldset wc-form-element {
    margin-bottom: .5em;
    font-size: ${this.styleVar('field-container-font-size')};
}`
    );
}




/*
    setHeight(v)
*/
setHeight(v){
    if (this.initialized){
        this.DOMElement.style.height = `${v}`;
    }
}




/*
    setMaxHeight(v)
*/
setMaxHeight(v){
    if (this.initialized){
        this.DOMElement.style.maxHeight = `${v}`;
    }
}




/*
    alignLabels(bool)
    that fancy style lol
*/
alignLabels(boo){
    if (this.initialized){

        if (boo === true){
            // get the field with the longest label
            let t = Object.keys(this.formElements).map((a)=>{return(this.formElements[a])}, this).sort((a,b)=>{return(b.label.length - a.label.length)});
            let maxLabel = (t.length > 0)?t[0]._elements.label:null;

            if (maxLabel instanceof Element){

                let oneEM = parseFloat(getComputedStyle(maxLabel).fontSize);
                let setLength = Math.ceil(maxLabel.getBoundingClientRect().width/oneEM);

                // blow it down to all of em
                Object.keys(this.formElements).map((a)=>{return(this.formElements[a])}, this).forEach((el) => { el.label_width = `${setLength + 1}em`; });
            }
        }else{
            Object.keys(this.formElements).map((a)=>{return(this.formElements[a])}, this).forEach((el) => { el.label_width = 'auto'; });
        }
    }
}




/*
    setChangeFlag(bool, changedFields)
    this sets the change flag true or false
    keep in mind this is the UI layer, literally everything that could
    mutate the change_flag MUST be controlled by a backend.

    this changeFlag is quite dumb. It literally turns the save button on and off
    and that's about all.
*/
setChangeFlag(bool){
    if (this._elements.btnSave instanceof Element){
        this._elements.btnSave.disabled = (! (bool === true));
    }
    this.dispatchEvent(new CustomEvent("change_flag", { detail: { self: this, change_flag: (bool === true)}}));
}
set changeFlagCallback(f){
    if (f instanceof Function){
        this.addEventListener('change_flag', (evt) => { f(evt.detail.change_flag, evt.detail.self); });
    }
}




/*
    modifyFieldValue(fieldName, value, captureValueBool)
    if the given fieldName has a correspnding formElement, set the given value on it
    if captureValueBool is set true, execute captureValue() on the wcFormElement object
    after setting the value
*/
modifyFieldValue(fieldName, value, captureValueBool){
    if (this.initialized && (this.formElements[fieldName] instanceof wcFormElement)){
        this.formElements[fieldName].value  = value;
        if (captureValueBool === true){ this.formElements[fieldName].captureValue(); }
        if (this.show_modified_field_indicator === true){
            this.formElements[fieldName].dataset.updated = true;
            let that = this;
            setTimeout(() => {
                if (that.formElements.hasOwnProperty(fieldName)){ that.formElements[fieldName].dataset.updated = false; }
            }, (1.5 * 1000));
        }
    }
}




/*
    toggleDisabled(bool)
    attributeChangeHandler for 'disabled' attribute
    when set true we lock every field, button and control in the web componet
    if not set true, we return each field to it's native config-defined disable state
    or whatever state it had whwn we locked it
*/
toggleDisabled(bool, oldBool){

    // if it's changing
    if ((bool === true) != (oldBool === true)){

        // this is no elegance
        Object.keys(this.formElements).forEach((fieldID) => {
            let formElement = this.formElements[fieldID];
            if (bool === true){

                // if the new state is disabled
                formElement._previous_disabled = formElement.disabled;
                formElement.disabled = true;

            }else{

                // if the new state is enabled
                if (formElement.hasOwnProperty('_previous_disabled')){
                    formElement.disabled = formElement._previous_disabled;
                    delete(formElement._previous_disabled);
                }else if (
                    (this.fieldConfig instanceof Object) &&
                    (this.fieldConfig[fieldID] instanceof Object) &&
                    (this.fieldConfig[fieldID].modes instanceof Object) &&
                    (this.fieldConfig[fieldID].modes[this.mode] instanceof Object) &&
                    this.fieldConfig[fieldID].modes[this.mode].hasOwnProperty('edit')
                ){
                    formElement.disabled = (! (this.fieldConfig[fieldID].modes[this.mode].edit === true));
                }else{
                    formElement.disabled = false;
                }

            }
        }, this);

        // oh yes and also the save button
        if (bool === true){
            this._elements.btnSave._previous_disabled = this._elements.btnSave.disabled;
            this._elements.btnSave.disabled = true;
        }else{
            this._elements.btnSave.disabled = this._elements.btnSave.hasOwnProperty('_previous_disabled')?this._elements.btnSave._previous_disabled:false;
            delete(this._elements.btnSave._previous_disabled);
        }

    }
}




/*
    changeMode(newMode, oldMode)
    the formView mode is changing
*/
changeMode(newMode, oldMode){

    // distribute any mode-specific properties to the formElements should we have them
    Object.keys(this.formElements).filter((fieldName) => {return(
        (this.fieldConfig[fieldName] instanceof Object) &&
        (this.fieldConfig[fieldName].modes instanceof Object) &&
        (this.fieldConfig[fieldName].modes[newMode] instanceof Object)
    )}, this).forEach((fieldName) => {
        Object.keys(this.fieldConfig[fieldName].modes[newMode]).forEach((a) => {
            this.formElements[fieldName][a] = this.fieldConfig[fieldName].modes[newMode][a];
        }, this);

        // in create mode for selects, we need the include_null flag
        if (
            (newMode == "create") &&
            (this.formElements[fieldName].type == "select") &&
            (! (this.formElements[fieldName].include_null == true))
        ){
            this.formElements[fieldName].include_null = true;
        }
    }, this);

    this.dispatchEvent(new CustomEvent("mode_change", { detail: {
        self: this,
        old_mode: oldMode,
        new_mode: newMode
    }}));

    let that = this;
    requestAnimationFrame(() => {
        that.dispatchEvent(new CustomEvent("ui_loaded", { detail: {
            self: that
        }}));
    });

}




set modeChangeCallback(f){
    if (f instanceof Function){
        this.addEventListener('mode_change', (evt) => { f(evt.detail.self, evt.detail.new_mode, evt.detail.old_mode); });
    }
}




/*
    handleFieldValidationStateChange({ fieldID: <fieldName>, hasErrors: <bool>, hasWarnings: <bool>, errors: <array>, fieldReference: <noiceCoreValue Object> }
    a field's validation state has changed
    basically this is gonna fire when the validation state of a field changes. errors will have the errors
*/
handleFieldValidationStateChange(args){

    // log it if we're in debug mode (fix this to relay through an external logger later)
    if (this.debug){ this.log(`${this._className} v${this._version} | handleFieldValidationStateChange(${args.fieldID}) | [warnings]: ${args.hasWarnings} [errors]: ${args.hasErrors}`); }

    // we have a formView containing field the event is for?
    if (
        (args instanceof Object) &&
        args.hasOwnProperty('fieldID') &&
        this.isNotNull(args.fieldID) &&
        (this.formElements[args.fieldID] instanceof wcFormElement)
    ){

        // event has nothing and field has something -> clear message on field
        if (
            args.hasOwnProperty('hasWarnings') && (args.hasWarnings === false) &&
            args.hasOwnProperty('hasErrors') && (args.hasErrors === false) &&
            this.isNotNull(this.formElements[args.fieldID].message)
        ){
            this.formElements[args.fieldID].message = '';
            this.formElements[args.fieldID].message_is_error = false;

        // event has something -> set message on field
        }else if (
            (args.hasOwnProperty('hasWarnings') && (args.hasWarnings === true)) ||
            (args.hasOwnProperty('hasErrors') && (args.hasErrors === true))
        ){
            this.formElements[args.fieldID].message_is_error = (args.hasErrors === true);
            this.formElements[args.fieldID].message = (args.errors instanceof Array)?args.errors.filter((a) => {return(
                (a instanceof Object) &&
                a.hasOwnProperty('severity') &&
                this.isNotNull(a.severity) &&
                a.hasOwnProperty('message') &&
                this.isNotNull(a.message)
            )}, this).map((error) => {return(
                // eh. just looks cleaner this way. message_is_error CSS will take care of letting them know it's an errors
                //`${(error.severity == 'warning')?'🛈 ':''}${error.message}`
                `${error.message}`
            )}, this).join(", "):'';
        }
    }
}




/*
    close()
    anything that wants to remove the element from the document (perhaps a lose focus or
    someone clicked the close button) should come through here. We're going to check the
    change_flag and pop the "are you sure?" dialog if it's set, then await that output
    before calling the 'close' event. closeCallback attribute setter will be the usual
    setup the listener but don't keep a reference thing.

    in to-do section because embedded dialog isn't a thing yet and change_flag isn't a thing
    yet either. For now it just calls this.remove() lol
*/
close(){

    // total placeholder stuff
    this.remove();

    this.dispatchEvent(new CustomEvent("view_closed", { detail: {
        self: this
    }}));

}
set viewClosedCallback(f){
    if (f instanceof Function){
        this.addEventListener('view_closed', (evt) => { f(evt.detail.self); });
    }
}



/*
    initializedCallback()
*/
initializedCallback(){
    /*
        pretty much setup() as in days of yore
        gets called once the first time the element is appended to something
        *after* initialization and the rest of the guts have fired, so this is
        truly for custom one-off stuff here
    */

    // note this gonna need to get called whenever we add or remove fields
    // putting it at the end of renderFieldContainer() didn't work
    // so basically on mode change I guess
    this.alignLabels(this.align_labels);

    // init aliased attributes
    ['change_flag'].forEach((a) => { this[a] = this[a]; }, this);

    // clickHandlers
    let that = this;
    that._elements.btnClose.addEventListener('click', (evt) => { that.close(); });
    that._elements.btnSave.addEventListener('click', (evt) => { that.save(); });

    // initialize our mode
    this.changeMode(this.mode);

    // dispatch the "initialized" event
    this.dispatchEvent(new CustomEvent("initialized", { detail: { self: this }}));

}

/*
    7/10/24 @ 1219
    we need a hook off initializedCallback to get the parent noiceARSRow
    to sync any validationErrors/warnings that may have pre-existed the
    formView
*/




/*
    fieldValueChange(value, wcFormElement)
    a field value has changed from the UI side
*/
fieldValueChange(value, formElement){
    if (this.debug){ this.log(`fieldValueChange(${formElement.name}, ${value})`); }

    // send the field_value_changed custom event
    this.dispatchEvent(new CustomEvent("field_value_change", { detail: {
        name: formElement.name,
        value: formElement.value,
        formElement: formElement,
        self: this
    }}));

    // defocus the field because sometimes we got issues with that
    formElement.formElement.blur();
}
set fieldValueChangeCallback(f){
    if (f instanceof Function){
        this.addEventListener('field_value_change', (evt) => { f(evt.detail.name, evt.detail.value, evt.detail.formElement, evt.detail.self); });
    }
}




/*
    fieldUndo()
    the undo button got clicked on a formElement
*/
fieldUndo(formElement, btnUndo){
    if (this.debug){ this.log(`fieldUndo(${formElement.name})`); }
    this.dispatchEvent(new CustomEvent("field_undo", {detail: {
        field: formElement,
        button: btnUndo,
        self: this
    }}));
}
set fieldUndoCallback(f){
    if (f instanceof Function){
        this.addEventListener('field_undo', (evt) => { f(evt.detail.field, evt.detail.button, evt.detail.self); });
    }
}





/*
    fieldMenuCallback(formElement, button)
*/
set fieldMenuCallback(f){
    if (f instanceof Function){
        this.addEventListener('menu_click', (evt) => { f(evt.detail.self, evt.detail.button); });
    }
}




/*
    fieldMenu()
    the menu button got clicked on a formElement
*/
fieldMenu(formElement, btnMenu){
    if (this.debug){ this.log(`fieldMenu(${formElement.name})`); }

    this.dispatchEvent(new CustomEvent("menu_click", {detail: {
        button: btnMenu,
        self: formElement
    }}));

    /*
        6/6/24 @ 1643

        ok. yes we could just set a menuCallback in the config and let the
        formElement call it. However, that callback will need access to the db
        at the very least. Which means neither the formElement nor the formView
        could execute it.

        SO ... we have a fieldMenuCallback here, which is a listener thing

        inside noiceARSRow, we can dispatch the thing properly
    */

}




/*
    updateFieldMenu(fieldName, valueList)
    set the specified valueList as the .options on the
    formElement matching fieldName if it exists
*/
updateFieldMenu(fieldName, valueList){
    if (this.formElements[fieldName] instanceof wcFormElement){
        this.formElements[fieldName].setOptions(valueList);
    }
}




/*
    updateFieldProperties(fieldName, propertyName, newValue, oldValue)
    update the properties of a field
*/
updateFieldProperties(fieldName, propertyName, newValue, oldValue){
    if (this.formElements[fieldName] instanceof wcFormElement){
        this.formElements[fieldName][propertyName] = newValue;
    }
}




/*
    openDialog(domTree, { options })
    open the embedded dialog and set the dialogContent to the given domTree
    create the wc-balloon-dialog with the given options to the constructor
    return a promise that resolves when the dialog is closed
*/
openDialog(el, args){
    let that = this;
    return (new Promise((toot, boot) => {
        that.dialog = new wcBalloonDialog(Object.assign({
            relativeElement: that.DOMElement,
            arrow_position: 'none',
            full_screen: false,
            centered: true,
            title: `${that.entryId} - dialog`,
            dialogContent: el,
            exitValue: true,
            exitCallback: async(slf) => {
                delete(that.dialog);
                that.dialog_open = false;
                toot(slf.exitValue);
                return(true);
            }
        }, args));
        that.shadowDOM.appendChild(that.dialog);
        that.dialog._elements.body.style.maxWidth = `97%`;
        that.dialog_open = true;
    }));
}




/*
    userQuery({
        prompt: <str>, a title
        detail: <str>, detail text paragraph
        options: {<str>:<val>, ...} // es6 default hash key ordering ftw
    })

    display a modal dialog blocking the table with the specified options.
    resolve the promise with the textContent of the button that got selected

    shamelessly copped outa noiceCoreUITable lol
*/
userQuery(args){
    let that = this;
    return(new Promise((toot, boot) => {

        // construct the dialogContent
        let h = document.createElement('div');
        let s = h.attachShadow({mode: 'open'});
        let div = document.createElement('div');
        div.className = 'userQuery';
        s.appendChild(div);
        div.insertAdjacentHTML('afterbegin', `
            <!--<h2 class="prompt"></h2>-->
            <p class="detail"></p>
            <div class="buttonContainer"></div>
        `);
        if (args.hasOwnProperty('detail') && that.isNotNull(args.detail)){
            if (args.detail instanceof Element){
                div.querySelector('p.detail').innerHTML = '';
                div.querySelector('p.detail').appendChild(args.detail);
            }else{
                div.querySelector('p.detail').textContent = args.detail;
            }
        }else{
            div.querySelector('p.detail').remove();
        }
        let outValue = null;
        if (args.options instanceof Object){
            Object.keys(args.options).map((s) => {
                let btn = document.createElement('button');
                btn.textContent = s;
                btn.addEventListener('click', (evt) => {
                    btn.disabled = true;
                    outValue = args.options[s];
                    that.dialog.exit();
                });
                return(btn);
            }).forEach((el) => { div.querySelector("div.buttonContainer").appendChild(el); })
        }

        // embed some style
        const mnuStyle = document.createElement('style');
        mnuStyle.textContent = `/* insert css here */
:host {
    display: grid;
    place-items: center;
}
div.userQuery {
    overflow: auto;
    max-width: 100%;
}
p.detail {
    padding: 0 .5em 0 .5em;
}
div.buttonContainer {
    text-align:center;
    margin-bottom: .5em;margin-bottom: .5em;
}
button {
    font-size: var(--wc-formview-dialog-button-font-size, .8em);
    margin: var(--wc-formview-dialog-button-margin, .25em);
    border: var(--wc-formview-dialog-button-border, ransparent);
    border-radius: var(--wc-formview-dialog-button-radius, .66em);
    font-family: var(--wc-formview-dialog-button-font, Comfortaa);
    padding: var(--wc-formview-dialog-button-padding, .25em .5em .25em .5em);
    color: var(--wc-formview-dialog-button-color, rgba(5, 15, 20, .8));
    background-color: var(--wc-formview-dialog-button-background, rgb(240, 240, 240));
}
`;
        s.appendChild(mnuStyle);

        that.openDialog(h, { title: args.prompt, modal: true }).then(() => {
            toot(outValue);
        });
    }));
}




/*
    save()
    this is the clickHandler for btnSave
    it will dispatch the 'view_save' event
    you can catch that manually externally, or set the saveCallback
    write-only attribute, which just points an event handler to it
*/
save(){
    this.dispatchEvent(new CustomEvent("view_save", { detail: {
        self: this,
        btnSave: this._elements.btnSave
    }}));

}
set saveCallback(f){
    if (f instanceof Function){
        this.addEventListener('view_save', (evt) => { f(evt.detail.self, evt.detail.btnSave); });
    }
}
postSaveExecutor(args){
    // this gets called by whatever saveCallback is pointing to, to indicate that save is competed
    this.dispatchEvent(new CustomEvent("view_saved", { detail: {
        self: this,
        btnSave: this._elements.btnSave,
        args: args
    }}));
}
set savedCallback(f){
    if (f instanceof Function){
        this.addEventListener('view_saved', (evt) => { f(evt.detail.self, evt.detail.btnSave, evt.detail.args); });
    }
}




/*
    toggleNarrow(bool)
    if true, set all label_position = "top"
    else whatever's in the config for this mode
*/
toggleNarrow(bool){
    if (this.initialized){
        if (bool){
            Object.keys(this.formElements).map((a) => {return(this.formElements[a])}, this).forEach((el) => {
                el.label_position = "top";
            }, this);
        }else{
            Object.keys(this.fieldConfig).filter((name) => {return(
                this.formElements.hasOwnProperty(name)
            )}, this).forEach((name) => {
                this.formElements[name].label_position = this.fieldConfig[name].label_position;
            })
        }
    }else{
        this._narrow = (bool === true);
    }
}




/*
    setEntryID(val, oldVal)
    the value of this.entry_id has changed
*/
setEntryID(val, oldVal){
    this.dispatchEvent(new CustomEvent("entry_id_changed", { detail: {
        self: this,
        entry_id: val,
        old_entry_id: oldVal
    }}));
}
set entryIDCallback(f){
    if (f instanceof Function){
        this.addEventListener('entry_id_changed', (evt) => { f(evt.detail.self, evt.detail.entry_id, evt.detail.old_entry_id); });
    }
}




}
const _classRegistration = wcARSFormView.registerElement('wc-ars-form-view');
export { wcARSFormView };
