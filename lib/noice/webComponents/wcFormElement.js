/*
    wpFormElement.js
    4/12/24 Amy Hicox <amy@hicox.com>

    this implements a base class for a webComponent version
    of a noiceCoreUIFormElement basically.

    valid types:
        checkbox        https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/checkbox
        color           https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/color
        date            https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/date
        datetime-local  https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/datetime-local
        email           https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/email
        file            https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/email
        month           https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/month
        number          https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/number
        password        https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/password
        radio           https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/radio
        range           https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/range
        search          https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/search
        tel             https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/tel     (telephone number)
        text            https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/text    (default)
        time            https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/time
        url             https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/url
        week            https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/week
        select          https://developer.mozilla.org/en-US/docs/Web/HTML/Element/select
        textarea        [WIP] https://developer.mozilla.org/en-US/docs/Web/HTML/Element/textarea

    it's a bit much to hack in right now since we're using noiceCoreRow, etc for validation stuff
    but there's built in validation at the element level completely outside a form that can be useful
    maybe that's for the next refactoring binge:

        https://developer.mozilla.org/en-US/docs/Web/API/ValidityState
        https://developer.mozilla.org/en-US/docs/Web/HTML/Constraint_validation

    TO-DO: DOCS

    NOTE:
    this.formElement.setAttribute('placeholder', this.label)
    ya rly! WC3 gave us a legit way of doing 'embed' label_position.
    for later though.

*/
import { noiceAutonomousCustomElement } from '../noiceAutonomousCustomElement.js';
import { getGUID } from '../noiceCore.js';

class wcFormElement extends noiceAutonomousCustomElement {




static classID = wcFormElement;

static classAttributeDefaults = {
    display: { observed: true, accessor: true, type: 'bool', value: true, forceAttribute: true},
    required: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    disabled: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    label_position: { observed: true, accessor: true, type: 'enum', value: 'top', values: ['top', 'left', 'embed', 'none'], forceAttribute: true, forceInit: true },
    show_undo_button: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    show_menu_button: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    undo_button_text: { observed: true, accessor: true, type: 'str', value: '⎌' },
    menu_button_text: { observed: true, accessor: true, type: 'str', value: '⋯' },
    label: { observed: true, accessor: true, type: 'str', value: null },
    label_width: { observed: true, accessor: true, type: 'str', value: 'auto' },
    size: { observed: true, accessor: true, type: 'int', value: '' },
    name: { observed: true, accessor: true, type: 'str', value: 'wcFormElement', forceAttribute: true },
    type: { observed: true, accessor: true, type: 'enum', value: 'text', values: [
        'checkbox', 'color', 'date', 'datetime-local', 'email', 'file', 'month', 'number',
        'password', 'radio', 'range', 'search', 'tel', 'text', 'time', 'url', 'week', 'select',
        'textarea'
    ], forceAttribute: true},
    options: { observed: true, accessor: true, type: 'json', key: 'values', value: []},
    default_value: { observed: true, accessor: true, type: 'str', value: '' },
    capture_value_on: { observed: true, accessor: true, type: 'enum', value: 'none', values: ['none', 'focusout', 'return', 'focusoutOrReturn', 'keypress', 'input', 'change'] },
    spellcheck: { observed: true, accessor: true, type: 'bool', value: false },
    mono: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },

    // errors and messages
    message_is_error: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    message: { observed: true, accessor: true, type: 'str', value: '' },

    // valueTransformer() stuff
    upper_case: { observed: true, accessor: true, type: 'bool', value: false },
    trim_whitespace: { observed: true, accessor: true, type: 'bool', value: false },
    xss_filter: { observed: true, accessor: true, type: 'bool', value: true },

    // only applies to type: select
    include_null: { observed: true, accessor: true, type: 'bool', value: false },

    // only applies to number
    min: { observed: true, accessor: true, type: 'float', value: 0 },
    max: { observed: true, accessor: true, type: 'float', value: null },
    step: { observed: true, accessor: true, type: 'float', value: 1 },

    // these only apply to type: textarea
    cols: { observed: true, accessor: true, type: 'int', value: 20 },
    rows: { observed: true, accessor: true, type: 'int', value: 2 },
    wrap: { observed: true, accessor: true, type: 'enum', values:['hard','soft','off'], value: 'soft' },

    // for *reasons* we have some attributes that are basically aliases to other attributes
    nullable: { observed: true, accessor: true, type: 'bool', value: true },    // aliases ! required
    edit: { observed: true, accessor: true, type: 'bool', value: true },        // aliases ! disabled
    editable: { observed: true, accessor: true, type: 'bool', value: true },    // aliases edit
    undoable: { observed: true, accessor: true, type: 'bool', value: false },   // aliases show_undo_button
    inputmode: { observed: true, accessor: true, type: 'str', value: 'text' },
    maxlength: { observed: true, accessor: true, type: 'int', value: 0 },
}

// observedAttributes
static observedAttributes = Object.keys(this.classID.classAttributeDefaults).filter((a) =>{ return(this.classID.classAttributeDefaults[a].observed === true); });

static classStyleDefaults = {
    'disabled-label-color': { value: 'rgba(53, 57, 59,.5)', global: true },
    'disabled-field-background-color': { value: 'rgba(201, 95, 27, .1)', global: true },
    'disabled-field-text-color': { value: 'rgba(201, 95, 27, .5)', global: true },
    'disabled-field-border': { value: '2px solid rgb(191,191,191)', global: true },
    'disabled-field-box-shadow': { value: 'none', global: true },
    'required-label-color': { value: 'rgb(201, 95, 27)', global: true },
    'button-background-color': { value: 'rgba(240, 240, 240, .8)', global: true },
    'button-foreground-color': { value: 'rgba(201, 95, 27,.75)', global: true },
    'button-border': { value: '1px solid rgba(201, 95, 27,.75)', global: true},
    'label-color': { value: 'rgba(53, 57, 59,.75)', global: true },
    'label-font': { value: 'Comfortaa', global: true },
    'label-font-size': { value: 'inherit', global: true },
    'field-border-radius': { value: '.5em', global: true },
    'field-background': { value: 'radial-gradient(ellipse at top left, rgba(240, 240, 240, .25), rgba(240, 240, 240, .1), rgba(0, 0, 0, .13))', global: true },
    'field-background-color': { value: 'rgb(235, 235, 235)', global: true },
    'field-border': { value: '1px solid rgba(201, 95, 27, .3)', global: true },
    'field-foreground': { value: 'rgba(53, 57, 59,.75)', global: true },
    'field-boxshadow': { value: '2px 2px 2px rgba(49, 49, 49, .6) inset', global: true },
    'field-font': { value: 'inherit', global: true },
    'field-focus-foreground': { value: 'rgb(53, 57, 59)', global: true },
    'field-focus-background': { value: 'rgb(240, 240, 240)', global: true },
    'field-focus-background-color': { value: 'rgb(240, 240, 240)', global: true },
    'field-focus-box-shadow': { value: 'none', global: true },
    'field-error-border-color': { value: 'rgb(230, 0, 161)', global: true },
    'optgroup-background-color': { value: 'rgba(201, 95, 27, .3)', global: true },
    'optgroup-foreground-color': { value: 'rgba(53, 57, 59,.75)', global: true },
    'option-background-color': { value: 'rgb(235, 235, 235)', global: true },
    'option-foreground-color': { value: 'rgba(53, 57, 59,.75)', global: true },
    'field-modified-start-color': { value: 'rgba(242, 177, 52, .5)', global: true },
    'field-modified-end-color': { value: 'rgba(53, 57, 59,.75)', global: true },
    'message-color': { value: 'rgb(155, 136, 177)', global: true },
    'error-message-color': { value: 'rgb(230, 0, 161)', global: true },
    'message-font-style': { value: 'italic', global: true },
    'default-option-font-style': { value: 'italic', global: true },
    'default-option-color': { value: 'inherit', global: true },
}


/*
    constructor
*/
constructor(args){
    super(args);
    this._className = 'wcFormElement';
    this._version = 1;
    this._guidCache = {};
    this._elements = {};
    this._options = [];
    this._listeners = {};
    this.captureValueDisable = false;
    this.nullOption = null;
    this.cssVarPrefix = '--wc-formelement';

    // we need getGUID for linking labels and lists to the formElement
    this.getGUID = getGUID;

    // attributeChangeHandlers
    this.attributeChangeHandlers = {
        label_position: (n, o, v, s) => { s.setLabelPosition(v, o); },
        disabled: (n, o, v, s) => { s.toggleDisabled(v); },
        message: (n, o, v, s) => { s.updateMessage(v); },
        undo_button_text: (n, o, v, s) => { s.updateButtonText('btnUndo', v); },
        menu_button_text: (n, o, v, s) => { s.updateButtonText('btnMenu', v); },
        label: (n, o, v, s) => { s.updateLabelText(v); },
        size: (n, o, v, s) => { s.setSize(v); },
        name: (n, o, v, s) => { s.setName(v); },
        type: (n, o, v, s) => { s.setType(v, o); },
        options: (n, o, v, s) => { s.setOptions(v); },
        default_value: (n, o, v, s) => { s.setDefaultValue(v); },
        capture_value_on: (n, o, v, s) => { s.setCaptureValueOn(v); },
        cols: (n, o, v, s) => { s.setFormElementProperty('cols', v); },
        rows: (n, o, v, s) => { s.setFormElementProperty('rows', v); },
        wrap: (n, o, v, s) => { s.setFormElementProperty('wrap', v); },
        spellcheck: (n, o, v, s) => { s.setFormElementProperty('spellcheck', v); },
        label_width: (n, o, v, s) => { s.setLabelWidth(v); },
        required: (n, o, v, s) => { s.setRequired(v); },
        nullable: (n, o, v, s) => { s.setNullable(v); },
        edit: (n, o, v, s) => { s.setEdit(v); },
        editable: (n, o, v, s) => { s.setEdit(v); },
        undoable: (n, o, v, s) => { s.setUndoable(v); },
        upper_case: (n, o, v, s) => { if (v === true){ s.valueTransformer('upper_case'); } },
        trim_whitespace: (n, o, v, s) => { if (v === true){ s.valueTransformer('trim_whitespace'); } },
        xss_filter: (n, o, v, s) => { if (v === true){ s.valueTransformer('xss_filter'); } },
        include_null:  (n, o, v, s) => { s.handleIncludeNull(v === true); },
        min: (n, o, v, s) => { if ((s.type == 'number') && (! isNaN(parseFloat(v)))){ s.setFormElementProperty('min', v); } },
        max: (n, o, v, s) => { if ((s.type == 'number') && (! isNaN(parseFloat(v)))){ s.setFormElementProperty('max', v); } },
        step: (n, o, v, s) => { if ((s.type == 'number') && (! isNaN(parseFloat(v)))){ s.setFormElementProperty('step', v); } },
        inputmode: (n, o, v, s) => { s.setFormElementProperty('inputmode', v); },
        maxlength: (n, o, v, s) => {
            if (['text', 'password', 'email', 'search', 'tel', 'url'].indexOf(s.type) >= 0 ){
                s.setFormElementProperty('maxlength', v, (parseInt(v) == 0));
            }
        }
    };
}




/*
    getAttributeDefaults()
    override this in each subclass, as I can't find a more elegant way of
    referencing the static class vars in an overridable way
*/
getAttributeDefaults(){
    return(wcFormElement.classAttributeDefaults);
}
getStyleDefaults(){
    return(wcFormElement.classStyleDefaults);
}




/*
    getFormElementTag(type)
    get the type of formElement based on the given type
*/
getFormElementTag(type){
    return((type == "select")?'select':(type == "textarea")?'textarea':'input');
}





/*
    getFormElementMarkup(labelGUID, dataGUID)
    return the markup for the formElement input based on type and stuff
    might need to extend or override this in subclasses
    the input guid gets used for the id, to link the label and the dataList
*/
getFormElementMarkup(labelGUID, dataGUID){

    let elTag = this.getFormElementTag(this.type);
    return(`<${elTag}
        class="formElement"
        ${this.isNotNull(labelGUID)?`id="${labelGUID}"`:''}
        ${this.isNotNull(dataGUID)?`list="${dataGUID}"`:''}
        name="${this.name}"
        type="${this.type}"
        spellcheck="${this.spellcheck}"
        ${(elTag !== "textarea")?`value="${this.isNull(this.value)?this.isNull(this.default_value)?'':this.default_value:this.value}"`:''}
        ${(this.disabled)?'disabled':''}
        ${(this.required)?'required':''}
        ${(elTag == "textarea")?`cols="${this.cols}"`:''}
        ${(elTag == "textarea")?`rows="${this.rows}"`:''}
        ${(elTag == "textarea")?`wrap="${this.wrap}"`:''}
    >${(elTag == 'textarea')?this.value:''}</${elTag}>`)
}




/*
    formElement getter
    just returns the input element
*/
get formElement(){
    return(this.initialized?this.shadowDOM.querySelector(`${this.getFormElementTag(this.type)}.formElement`):null);
}




/*
    getHTMLContent()
*/
getHTMLContent(){

    // the container div
    let div = document.createElement('div');
    div.className = this._className;
    div.dataset.guid = this.getGUID(this._guidCache);
    let listGUID = this.getGUID(this._guidCache);
    div.insertAdjacentHTML('afterbegin', `
        <label for="${div.dataset.guid}" style="width:${this.label_width}">${this.label}</label>
        <div class="formElementContainer">${this.getFormElementMarkup(div.dataset.guid, listGUID)}</div>
        <div class="btnContainer">
            <button class="btnUndo">${this.undo_button_text}</button>
            <button class="btnMenu">${this.menu_button_text}</button>
            <slot name="customButtons" data-_name="customButtons"></slot>
        </div>
        <div class="message">${this.message}</div>
        <datalist id="${listGUID}"></datalist>
    `);
    this._elements.label = div.querySelector('label');
    this._elements.input = div.querySelector('input');
    this._elements.btnContainer = div.querySelector('div.btnContainer');
    this._elements.btnUndo = this._elements.btnContainer.querySelector('button.btnUndo');
    this._elements.btnMenu = this._elements.btnContainer.querySelector('button.btnMenu');
    this._elements.message = div.querySelector('div.message');
    this._elements.datalist = div.querySelector("datalist");

    let that = this;
    this._elements.btnUndo.addEventListener('click', (evt) => { that.undoClickhandler(evt); });
    this._elements.btnMenu.addEventListener('click', (evt) => { that.menuClickhandler(evt); });

    return(div);
}




/*
    initializedCallback(slf)
    anything you need to do only once, but *after* everything is rendered
    and this.initialized is set.

    this is called from .initialize() and .setType() (sometimes)
*/
initializedCallback(){
    // if we're a select, init our options should we have them
    if ((this.type == "select") || this.isNotNull(this.options)){ this.setOptions(this.options); }

    // setup the listeners
    this.setCaptureValueOn(this.capture_value_on);

    // init alias attributes
    [
        'nullable', 'edit', 'editable', 'undoable', 'min', 'max', 'step',
        'cols', 'rows', 'wrap', 'spellcheck', 'inputmode', 'maxlength', 'size'
    ].forEach((a) => {
        this[a] = this[a];
    }, this);
}




/*
    defaultStyle getter
*/
get defaultStyle(){return(`
    :host([display="false"]){
        display: none;
    }
    :host {
        display: block;
    }
    /* label_position: top */
    :host([label_position="top"]) .wcFormElement {
      grid-template-columns: auto auto;
    }
    :host([label_position="top"]) .wcFormElement label, :host([label_position="top"]) .wcFormElement .message {
      grid-column: 1/3;
      margin-left: .25em;
    }

    /* label_position: left */
    :host([label_position="left"]) .wcFormElement {
      grid-template-columns: auto auto auto;
    }
    :host([label_position="left"]) .wcFormElement label {
      text-align: right;
      margin-right: .25em;
    }
    .wcFormElement .message {
        word-break: break-word;
        max-width: ${(this.isNull(this.size) || isNaN(this.size))?20:this.size}em;
    }
    :host([label_position="left"]) .wcFormElement .message {
      grid-column: 2/3;
      margin-left: .25em;
    }

    /* label_position: embed and none */
    :host([label_position="embed"]) .wcFormElement, :host([label_position="none"]) .wcFormElement {
      grid-template-columns: auto auto;
    }
    :host([label_position="embed"]) .wcFormElement label, :host([label_position="none"]) .wcFormElement label {
      display: none;
    }

    /* layout and geometry */
    .wcFormElement {
      display: grid;
      align-items: center;
      width: max-content;
    }
    .formElement {
      font-size: 1em;
      border-radius: ${this.styleVar('field-border-radius')};
      padding: .25em;
      border-color: transparent;
    }
    .btnContainer {
      width: max-content;
      display: flex;
      flex-direction:  row-reverse;
      align-items: center;
    }
    .btnContainer button {
      font-size: 1.128em;
      height: 1.25em;
      width: 1.25em;
      border-radius: 50%;
      border: none;
      margin-left: .25em;
      display: grid;
      place-content:center;
    }
    :host([show_undo_button="false"]) .btnContainer button.btnUndo {
      display: none;
    }
    :host([show_menu_button="false"]) .btnContainer button.btnMenu {
      display: none;
    }
    .message {
      font-size: .8em;
      font-style: italic;
    }

    /* colors and themes */

    /* disabled */
    :host([disabled="true"]) label, :host([disabled="true"]) .message {
      color: ${this.styleVar('disabled-label-color')};
    }
    :host([disabled="true"]) .formElement, :host([disabled="true"]) .btnContainer button, .btnContainer button:disabled {
      background-color: ${this.styleVar('disabled-field-background-color')};
      color: ${this.styleVar('disabled-field-text-color')};
      border: ${this.styleVar('disabled-field-border')};
      box-shadow: ${this.styleVar('disabled-field-box-shadow')};
    }

    /* required */
    :host([required="true"]:not([disabled="true"])) label {
      color: ${this.styleVar('required-label-color')};
    }

    /* buttons */
    .btnContainer button{
      border: ${this.styleVar('button-border')};
      background-color: ${this.styleVar('button-background-color')};
      color:  ${this.styleVar('button-foreground-color')};
    }

    label {
      color: ${this.styleVar('label-color')};
      font-family: ${this.styleVar('label-font')};
      font-size: ${this.styleVar('label-font-size')};
    }

    /* fields */
    :host([mono="true"]) .formElement {
        font-family: monospace;
    }
    .formElement {
      background: ${this.styleVar('field-background')};
      background-color: ${this.styleVar('field-background-color')};
      border: ${this.styleVar('field-border')};
      color: ${this.styleVar('field-foreground')};
      box-shadow: ${this.styleVar('field-boxshadow')};
      font-family: ${this.styleVar('field-font')};
    }
    .formElement:focus {
      color: ${this.styleVar('field-focus-foreground')};
      background: ${this.styleVar('field-focus-background')};
      background-color: ${this.styleVar('field-focus-background-color')};
      box-shadow: ${this.styleVar('field-focus-box-shadow')};
    }
    :host([message_is_error="true"]) .formElement {
      border-color: ${this.styleVar('field-error-border-color')};
    }
    .formElement optgroup {
      background-color: ${this.styleVar('optgroup-background-color')};
      color: ${this.styleVar('optgroup-foreground-color')};
    }
    .formElement option {
      background-color: ${this.styleVar('option-background-color')};
      color: ${this.styleVar('option-foreground-color')};
    }

    /* transient updated field value indicator */
    :host([data-updated="true"]) .formElement {
        animation: modifyIndicator 1.5s ease-out;
    }
    @keyframes modifyIndicator {
        0%    { background-color: ${this.styleVar('field-modified-start-color')}; }
        100%  { background-color: ${this.styleVar('field-modified-end-color')}; }
    }

    /* message */
    .message {
      color: ${this.styleVar('message-color')};
    }
    :host([message_is_error="true"]) .message {
      color: ${this.styleVar('error-message-color')};
    }
    :host([message_is_error="true"]) .message:before {
      content: '⚠︎ ';
      font-style: normal;
    }
    :host([message_is_error="true"]) .formElement {
        font-style: ${this.styleVar('message-font-style')};
        color: ${this.styleVar('error-message-color')};
    }


    /* the null option */
    option.nullOption {
        font-style: ${this.styleVar('default-option-font-style')};
        color: ${this.styleVar('default-option-color')};
    }
`)}




/*
    ----------------------------------------------------------------------
    all the good stuff functions go down here
    ----------------------------------------------------------------------
*/




/*
    valueFormatter(value)
    when getting the value off the formElement, it will *probably* be normalized
    to a string. Some types we don't actually want that but need to cast the value
    into the appropriate type. For instance .type = 'number'

    may need to expand this but for the moment, just parseFloat'ing type:number
*/
valueFormatter(val){
    return( ((this.type == 'number') && this.isNotNull(val))?parseFloat(val):val );
}



/*
    value getter and setter
*/
get value(){
    return(
        this.valueFormatter((this.initialized && this.isNotNull(this.formElement))?this.formElement.value:this.default_value)
    )
}
set value(v){
    if (this.initialized && this.isNotNull(this.formElement)){ this.formElement.value = this.isNull(v)?'':v; }
}




/*
    captureValue(event)
    dispatch the capture_value event
    event.detail.value has the value
    event.detail.self has a self reference

    see also the captureValueCallback setter.
*/
captureValue(evt){
    if (!(this.captureValueDisable === true)){
        if (this.debug){ this.log(`${this._className} v${this._version} | ${this.name} | captureValue(${this.value})`); }

        // handle all potential valueTransformers at once
        this.valueTransformer();

        this.dispatchEvent(new CustomEvent("capture_value", { detail: {
            value: this.value,
            self: this
        }}));
    }
}




/*
    captureValueCallback setter
*/
set captureValueCallback(f){
    if (f instanceof Function){
        this.addEventListener('capture_value', (evt) => { f(evt.detail.value, evt.detail.self); });
    }
}




/*
    undoClickhandler(evt)
    btnUndo got clicked
    dispatch the undo_click event
    event.detail.button has btnUndo reference
    event.detail.self has a self reference

*/
undoClickhandler(evt){
    this.dispatchEvent(new CustomEvent("undo_click", {detail: {
        button: this._elements.btnUndo,
        self: this
    }}));
}




/*
    undoCallback setter
*/
set undoCallback(f){
    if (f instanceof Function){
        this.addEventListener('undo_click', (evt) => { f(evt.detail.self, evt.detail.button); });
    }
}




/*
    menuClickhandler(evt)
    btnUndo got clicked
    dispatch the menu_click event
    event.detail.button has btnUndo reference
    event.detail.self has a self reference
*/
menuClickhandler(evt){
    this.dispatchEvent(new CustomEvent("menu_click", {detail: {
        button: this._elements.btnMenu,
        self: this
    }}));
}




/*
    menuCallack setter
*/
set menuCallback(f){
    if (f instanceof Function){
        this.addEventListener('menu_click', (evt) => { f(evt.detail.self, evt.detail.button); });
    }
}







/*
    ----------------------------------------------------------------------
    attributeChangeHandler functions go down here
    ----------------------------------------------------------------------
*/




/*
    setLabelPosition(newPosition, oldPosition)
    we'll need this for the 'embed' mode shenanigans
    however, the layout n such is just in the CSS
    so be careful overriding it
*/
setLabelPosition(newPosition, oldPosition){

    // insert shenanigans here
    if (this.debug){ this.log(`setLabelPosition(${newPosition}, ${oldPosition})`); }
    if (newPosition == "embed"){
        this.formElement.setAttribute('placeholder', this.label)
    }else{
        this.formElement.removeAttribute('placeholder')
    }

}




/*
    toggleDisabled(bool)
    disabled is unique in that specifying disabled="false" means the same thing
    as disabled="true". It has to either be there or not at all. w00t!
*/
toggleDisabled(n){
    if (this.initialized){
        this.shadowDOM.querySelectorAll('.formElement').forEach((el) => {
            if (n === true){ el.disabled = true; }else{ el.removeAttribute('disabled'); }
        });
        this.shadowDOM.querySelectorAll('button').forEach((el) => {
            if (n === true){ el.disabled = true; }else{ el.removeAttribute('disabled'); }
        });
    }
}




/*
    setEdit(bool)
    sets the inverse value on toggleDisabled is all
*/
setEdit(bool){
    this.disabled = (!(bool === true));
}




/*
    setUndoable(bool)
*/
setUndoable(bool){
    this.show_undo_button = (bool === true);
}


/*
    updateMessage(message, isError)
    set the message. if isError is true, set message_is_error while we're at it
*/
updateMessage(message, isError){
    if (this.initialized){
        let el = this.shadowDOM.querySelector('.message');
        if (el instanceof Element){ el.textContent = message; }
        if (this.isNotNull(isError)){ this.message_is_error = (isError === true); }
    }
}




/*
    updateButtonText(button.className, value)
*/
updateButtonText(btnClassName, message){
    if (this.initialized){
        let el = this.shadowDOM.querySelector(`.btnContainer button.${btnClassName}`);
        if (el instanceof Element){ el.textContent = message; }
    }
}




/*
    updateLabelText(value)
*/
updateLabelText(message){
    if (this.initialized){
        let el = this.shadowDOM.querySelector(`label`);
        if (el instanceof Element){ el.textContent = message; }
    }
}




/*
    setSize(value)
*/
setSize(size){
    if (this.initialized){
        let el = this.shadowDOM.querySelector(`.formElement`);
        if (el instanceof Element){ el.setAttribute('size', size); }
    }
}




/*
    setName(name)
*/
setName(name){
    let el = this.formElement;
    if (el instanceof Element){ el.setAttribute('name', name); }
}




/*
    setType(type, oldType)
    I mean ... I dunno, maybe it'll just work?
*/
setType(type, oldType){
    // can't use formElement attribute because the .type attribute already changed :-/
    let el =this.shadowDOM.querySelector('div.formElementContainer .formElement');
    if (el instanceof Element){

        // if the formElement tag changed we've gotta yank it and re-render it
        if (this.getFormElementTag(type) != this.getFormElementTag(oldType)){
            el.remove();
            this.shadowDOM.querySelector('div.formElementContainer').insertAdjacentHTML('afterbegin', this.getFormElementMarkup(el.getAttribute('id'), el.getAttribute('list')));
            this.initializedCallback();
        }else{
            el.setAttribute('type', type);
        }
    }
}




/*
    setOptions(data);
    options has changed, we need to either spew them into the list or the select depending
    data can be one of these formats:

        [ array, of, values]
        [ [value, aliasValue], ... ]
        { <heading>: [array, of, values], <heading2>: [[value, aliasValue]. value, ...]}

    NOTE: when setting 'selected' on type:select options
    this.value does not exist because it's trying to get the value of the formElement which we
    have yet to give a value list. We DID however make value="${this.value}" or whatever inside
    getFormElementMarkup(). So that's why we're checking and comparing the stringified
    getAttribute('value')

*/
setOptions(data){

    if (this.initialized){

        // such tomfoolery
        const nullAtStart = this.isNull(this.value);

        // handle selects
        if (this.type == "select"){

            // empty exiting values
            for (let i=(this.formElement.options.length - 1); i >= 0; i--){ this.formElement.remove(i); }
            if (this.nullOption instanceof Element){ delete(this.nullOption); }

            // regular old array but might contain objects with value aliases
            if (data instanceof Array){
                this.attributeDefaults.options.value = [];
                data.map((value) => {
                    let el = document.createElement('option');

                    // if it's an embedded array it's [<value>, <displayText>]
                    if ((value instanceof Array) && (value.length >= 2)){
                        el.value = value[0];
                        el.text = value[1];
                        el.selected = (this.formElement.getAttribute('value') == `${value[0]}`);
                    }else{
                        el.value = value;
                        el.text = value;
                        el.selected = (this.formElement.getAttribute('value') == `${value}`);
                    }
                    return(el);
                }, this).forEach((el) => {
                    this.attributeDefaults.options.value.push(el.textContent);
                    this.formElement.add(el);
                }, this);

                // convolution
                this.attributeDefaults.options.value = JSON.stringify({values: this.attributeDefaults.options.value});

            // optgroup stuff
            }else if (data instanceof Object){

                // object keys are optgroup headings, and should contain arrays
                // yeah it could get nested, but I'm not even trynna deal with it today
                // root level only
                Object.keys(data).map((heading) => {
                    let el = document.createElement('optgroup');
                    el.label = heading;
                    if (data[heading] instanceof Array){
                        data[heading].map((value) => {
                            let elo = document.createElement('option');

                            // if it's an embedded array it's [<value>, <displayText>]
                            if ((value instanceof Array) && (value.length >= 2)){
                                elo.value = value[0];
                                elo.text = value[1];
                                elo.selected = (this.formElement.getAttribute('value') == `${value[0]}`);
                            }else{
                                elo.value = value;
                                elo.text = value;
                                elo.selected = (this.formElement.getAttribute('value') == `${value}`);
                            }
                            return(elo);
                        }).forEach((opt) => { el.append(opt); })
                    }
                    return(el);
                }).forEach((el) => { this.formElement.add(el); });

                // convolution
                this.attributeDefaults.options.value = JSON.stringify(data);
            }

        // handle everything else
        }else if (data instanceof Array){
            let el = this.shadowDOM.querySelector('datalist');
            if (el instanceof Element){
                el.innerHTML = data.map((v) => {return(`<option value="${v}"></option>`)}).join("");
            }
            // convolution
            this.attributeDefaults.options.value = JSON.stringify({values: data});
        }

        // handle include_null if we've got that
        this.handleIncludeNull(this.include_null, nullAtStart);
    }
}




/*
    getOptions()
    it's convoluted.
*/
getOptions(){
    if (this.initialized){
        if (this.type == "select"){

            // get what's in there
            let optGroups = this.formElement.querySelectorAll('optgroup');
            if (optGroups.length > 0){
                // hannle that mess
                let out = {};
                optGroups.forEach((el) =>{
                    out[el.label] = Array.from(el.querySelectorAll('option')).map((ell) => { return(ell.textContent); });
                });
                return(out);
            }else{
                return(Array.from(this.formElement.querySelectorAll('option')).map((el) => {
                    return(el.textContent);
                }));
            }

        }else{

            // get the value list
            let el = this.shadowRoot.querySelector('datalist');
            if (el instanceof Element){
                return(Array.from(el.querySelectorAll('option')).map((eel) => {return(eel.textContent)}))
            }else{
                return([])
            }

        }
    }else{
        return(this.attributeDefaults.options);
    }
}




/*
    setDefaultValue(value)
*/
setDefaultValue(value){
    if (this.isNull(this.value)){ this.value = value; }
}




/*
    setCaptureValueOn(mode)
    modes: ['none', 'focusout', 'return', 'focusoutOrReturn', 'keypress', 'input', 'change']
*/
setCaptureValueOn(mode){
    if (this.initialized){

        // tear down any existing listeners
        Object.keys(this._listeners).forEach((evt) => { this.formElement.removeEventListener(evt, this._listeners[evt]); }, this);
        let that = this;
        switch(mode){
            case 'focusout':
                that._listeners.focusout = that.getEventListenerWrapper((evt) => { that.captureValue(evt); });
                that.formElement.addEventListener('focusout', that._listeners.focusout);
                break;
            case 'return':
                that._listeners.keydown = that.getEventListenerWrapper((evt) => { if (evt.keyCode == 13){ that.captureValue(evt); } });
                that.formElement.addEventListener('keydown', that._listeners.keydown);
                break;
            case 'focusoutOrReturn':
                that._listeners.keydown = that.getEventListenerWrapper((evt) => { if (evt.keyCode == 13){ that.formElement.blur(); } });
                that._listeners.focusout = that.getEventListenerWrapper((evt) => { that.captureValue(evt); });
                that.formElement.addEventListener('focusout', that._listeners.focusout);
                that.formElement.addEventListener('keydown', that._listeners.keydown);
                break;
            case 'keypress':
                that._listeners.keypress = that.getEventListenerWrapper((evt) => { that.captureValue(evt); });
                that.formElement.addEventListener('keypress', that._listeners.keypress);
                break;
            case 'input':
                that._listeners.input = that.getEventListenerWrapper((evt) => { that.captureValue(evt); });
                that.formElement.addEventListener('input', that._listeners.input);
                break;
            case 'change':
                that._listeners.change = that.getEventListenerWrapper((evt) => { that.captureValue(evt); });
                that.formElement.addEventListener('change', that._listeners.change);
                break;
        }
    }
}




/*
    setFormElementProperty(property, value, removeFlag)
*/
setFormElementProperty(p, v, removeFlag){
    if ((this.initialized) && (this.formElement instanceof Element)){
        if (removeFlag === true){
            this.formElement.removeAttribute(p);
        }else{
            this.formElement.setAttribute(p, v);
        }
    }
}




/*
    setRequired(bool)
    set the 'required' attribute true, or delete it entirely
*/
setRequired(b){
    if (this.initialized){
        if (b === true){
            this.formElement.setAttribute('required', true);
        }else{
            this.formElement.removeAttribute('required');
        }
    }
}
setNullable(b){
    this.required = (!(b === true));
}



/*
    setLabelWidth(width)
*/
setLabelWidth(width){
    if (this.initialized){
        this.DOMElement.querySelector('label').style.width = `${width}`;
    }
}




/*
    valueTransformer(attribute_name)
    handles upper_case, trim_whitespace, and xss_filter if enabled
*/
valueTransformer(attribute_name){
    if (
        (['text','email','search','tel','url','textarea'].indexOf(this.type) >= 0) &&
        this.isNotNull(this.value)
    ){
        let tmp = (this.captureValueDisable === true);
        this.captureValueDisable = false;

        // upper_case
        if ((this.upper_case === true) && ((attribute_name == "upper_case") || (this.isNull(attribute_name)))){ this.value = `${this.value}`.toUpperCase(); }

        // trim_whitespace
        if ((this.trim_whitespace === true) && ((attribute_name == "trim_whitespace") || (this.isNull(attribute_name)))){ this.value = `${this.value}`.trim(); }

        // xss filter
        if ((this.xss_filter === true) && ((attribute_name == "xss_filter") || (this.isNull(attribute_name)))){
            let div = document.createElement('div');
            div.textContent = this.value;
            this.value = div.innerHTML;
        }

        this.captureValueDisable = tmp;
    }
}




/*
    handleIncludeNull(bool)
    if we are type: select. if bool is true, include the special "no value value" as
    the first option, else remove it if it exists and bool isn't true
*/
handleIncludeNull(bool, setNullSelected){

    if (this.type == "select"){
        if ((bool === true) && (this.formElement instanceof Element) && (! (this.nullOption instanceof Element))){
            this.formElement.insertAdjacentHTML('afterbegin', '<option value="" class="nullOption">(clear)</option>');
            this.nullOption = this.formElement.querySelector('option.nullOption');
            if (setNullSelected === true){ this.formElement.selectedIndex = 0; }

        }else if ((this.nullOption instanceof Element) && (!(bool === true))){
            this.nullOption.remove();
            this.nullOption = null;

        }
    }
}




}
const _classRegistration = wcFormElement.registerElement('wc-form-element');
export { _classRegistration as wcFormElement };
