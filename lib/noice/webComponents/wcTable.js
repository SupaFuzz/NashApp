/*
    wcTable.js
    5/17/24 Amy Hicox <amy@hicox.com>

    this is a reimplementation of noiceCoreUITable as a webComponent
    starting over from scratch. second try. a direct port absolutely did not work :-/

*/
import { noiceAutonomousCustomElement } from '../noiceAutonomousCustomElement.js';
import { getGUID, epochTimestamp } from '../noiceCore.js';
import { wcPieChart } from './wcPieChart.js';
import { wcBasic } from './wcBasic.js';
import { wcFormElement } from './wcFormElement.js';

class wcTable extends noiceAutonomousCustomElement {




static classID = wcTable;
static classAttributeDefaults = {

    // simple elementAttributes
    label: { observed: true, accessor: true, type: 'elementAttribute', value: '' },
    footer_message: { observed: true, accessor: true, type: 'elementAttribute', value: '' },

    // managed elementAttributes
    header_row: { observed: true, accessor: true, type: 'elementAttribute', value: '' },

    // managed attributes
    listcontainer_height: { observed: true, accessor: true, type: 'str', value: 'auto' },
    tablecontainer_width: { observed: true, accessor: true, type: 'str', value: 'auto' },
    table_fontsize: { observed: true, accessor: true, type: 'str', value: 'inherit' },
    fit_parent: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },

    // css props -- validated working 5/16/24 @ 1500
    show_footer: { observed: true, accessor: true, type: 'bool', value: true, forceAttribute: true },
    show_btn_prefs: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    show_btn_select_all: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    show_btn_select_none: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    show_btn_export: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    show_btn_search: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    show_footer_message: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    show_row_nudge_buttons: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },

    // should not need further attention
    debug:  { observed: false, accessor: true, type: 'bool', value: false },
    allow_column_sort: { observed: true, accessor: true, type: 'bool', value: false },
    sync_rows_batch_limit: { observed: true, accessor: true, type: 'int', value: 250 },
    allow_cell_edit:  { observed: true, accessor: true, type: 'bool', value: false },
    select_mode: { observed: true, accessor: true, type: 'enum', values:['none','single','multiple'], value: 'none', forceAttribute: true },
    modify_all: { observed: true, accessor: true, type: 'enum', values:['auto','prompt'], value: 'auto' },

    // deferred attributes
    columns: { observed: false, accessor: false, type: 'array', value: [], deferred: true },
    rows: { observed: false, accessor: false, type: 'array', value: [], deferred: true },
    custom_buttons: { observed: false, accessor: false, type: 'array', value: [], deferred: true },
    default_sort: { observed: false, accessor: false, type: 'object', value: {}, deferred: true }

    /*
        ex:
        disabled: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
        message: { observed: true, accessor: true, type: 'str', value: '' },
        size: { observed: true, accessor: true, type: 'int', value: 20 },
        options: { observed: true, accessor: true, type: 'json', key: 'values', value: []},
        wrap: { observed: true, accessor: true, type: 'enum', values:['hard','soft','off'], value: 'off' },
        value: { observed: true, accessor: true, type: 'float', value: 1.618 },
    */
}
static observedAttributes = Object.keys(this.classID.classAttributeDefaults).filter((a) =>{ return(this.classID.classAttributeDefaults[a].observed === true); });




/*
    constructor
*/
constructor(args){
    super(args);
    this._className = 'wcTable';
    this._version = 1;

    // attributeChangeHandlers
    this.attributeChangeHandlers = {
        /*
            ex
            label_position: (attributeName, oldValue, newValue, selfReference) => { selfReference.setLabelPosition(newValue, oldValue); },
        */
        listcontainer_height: (attributeName, oldValue, newValue, selfReference) => { selfReference._elements.tableListContainer.style.height = newValue; },
        tablecontainer_width: (attributeName, oldValue, newValue, selfReference) => { selfReference._elements.tableContainer.style.width = newValue; },
        table_fontsize: (attributeName, oldValue, newValue, selfReference) => { selfReference._elements.uiContainer.style.fontSize = newValue; },
        fit_parent: (attributeName, oldValue, newValue, selfReference) => { selfReference.setFitParent(newValue, oldValue, selfReference); }
    };

    // merge object defaults
    this.mergeClassDefaults({

        // internal classNames
        headerColClassName: 'hdrCol',
        headerRowClassName: 'hdrRow',
        dataRowClassName: 'listRow',
        dataRowColClassName: 'listCol',
        defaultCellEditorInputClass: 'cellEditor',
        defaultPrefUIClass: 'tablePrefEditor',
        defaultPrefUIEditorClass: 'defaultPrefUIEditor',
        userPromptClass: 'userPrompt',
        exportUIClass: 'exportUI',

        // stubs for callbacks
        rowSelectCallback: null,
        renderRowsProgressCallback: null,
        getFooterMessageCallback: null,
        getPrefEditorCallback: null,
        modifyRowCallback: null,
        rowSetupCallback: null,
        resizeObserver: null,

        // stubs for internal getter/setters
        _customButtons: [],
        _columns: [],
        _rows: [],
        _guidCache: {},
        _default_sort: {}
    });

    this.getGUID = getGUID;
}




/*
    getHTMLContent()
*/
getHTMLContent(){

    // the container div
    let div = document.createElement('div');
    div.className = this._className;

    /*
        insert shenanigans here
        also set this._elements references if needed
        also setup default event listeners if needed
    */
    div.innerHTML = `
        <div class="label" data-_name="label"></div>
        <div data-_name="uiContainer">
            <div class="tableContainer" data-_name="tableContainer">
                <div class="tableHeader ${this.headerRowClassName}" data-_name="tableHeader">
                    <div data-_name="header_row"></div>
                </div>
                <div class="tableListContainer" data-_name="tableListContainer"></div>
            </div>
        </div>
        <div class="footer" data-_name="footer">
            <div class="buttonContainer" data-_name="footerButtonContainer">
                <button class="btnPrefs txtBtn" data-_name="btnPrefs">columns</button>
                <button class="btnSelectAll txtBtn" data-_name="btnSelectAll" disabled>select all</button>
                <button class="btnSelectNone txtBtn" data-_name="btnSelectNone" disabled>select none</button>
                <button class="btnExport txtBtn" data-_name="btnExport" disabled>export</button>
                <button class="btnSearch txtBtn" data-_name="btnSearch" disabled data-enable_on_populate="true">search</button>
                <button class="btnNudgeUp txtBtn" data-_name="btnNudgeUp" disabled>&#9650;</button>
                <button class="btnNudgeDown txtBtn" data-_name="btnNudgeDown" disabled>&#9660;</button>
            </div>
            <div class="footer_message" data-_name="footer_message"></div>
        </div>`;
    return(div);
}




/*
    initializedCallback(slf)
    anything you need to do only once, but *after* everything is rendered
    and this.initialized is set.

    this is called from .initialize() and .setType() (sometimes)
*/
initializedCallback(){

    /*
        doeth thine settting up things here
    */

    // listeners for the buttons
    let that = this;
    that._elements.btnPrefs.addEventListener('click', (evt) => { that.openPrefEditor(evt); that._elements.btnPrefs.blur(); });
    that._elements.btnSelectAll.addEventListener('click', (evt) => { that.handleSelectAll(evt); that._elements.btnSelectAll.blur(); });
    that._elements.btnSelectNone.addEventListener('click', (evt) => { that.handleSelectNone(evt); that._elements.btnSelectNone.blur(); });
    that._elements.btnExport.addEventListener('click', (evt) => { that.openExportUI(evt); that._elements.btnExport.blur(); });
    that._elements.btnSearch.addEventListener('click', (evt) => { that.openSearchUI(); that._elements.btnExport.blur(); })
    that._elements.btnNudgeUp.addEventListener('click', (evt) => { that.nudgeSelection('up', 1); that._elements.btnNudgeUp.blur(); });
    that._elements.btnNudgeDown.addEventListener('click', (evt) => { that.nudgeSelection('down', 1); that._elements.btnNudgeDown.blur(); });

    // pre-spawn the table preferences editor frame thingy
    let div = document.createElement('div');
    div.className = that.defaultPrefUIClass;

    div.innerHTML = `<div class="uiContainer" style="width:100%; height:100%;display:grid;align-content:center;justify-content:center;"><div>`;
    that.prefEditorFrameThingy = { DOMElement: div, _elements: { uiContainer: div.querySelector('div.uiContainer') }};
    that.prefEditorFrameThingy.DOMElement.style.overflow = "auto";

    that.table_fontsize = that.table_fontsize;

    // I do not understand why I need two screen draws before I can set height without clipping
    // its like the css borders and padding haven't been added yet. wierd
    requestAnimationFrame(() => { requestAnimationFrame(() => {
        that.fit_parent = that.fit_parent;
    });});

    this.dispatchEvent(new CustomEvent("ui_loaded", { detail: { self: this }}));
}


set uiLoadedCallback(f){
    if (f instanceof Function){
        this.addEventListener('ui_loaded', (evt) => { f(evt.detail.self); });
    }
}

/*
    defaultStyle getter
*/
get defaultStyle(){return(`
    :host {
        display: block;
        position: relative;
    }

    /* visibility toggles */
    :host([show_footer="false"]) div[data-_name="footer"],
    :host([show_btn_prefs="false"]) div[data-_name="footerButtonContainer"] button.btnPrefs,
    :host([show_btn_select_all="false"]) div[data-_name="footerButtonContainer"] button.btnSelectAll,
    :host([select_mode="single"]) div[data-_name="footerButtonContainer"] button.btnSelectAll,
    :host([select_mode="none"]) div[data-_name="footerButtonContainer"] button.btnSelectAll,
    :host([show_btn_select_none="false"]) div[data-_name="footerButtonContainer"] button.btnSelectNone,
    :host([select_mode="none"]) div[data-_name="footerButtonContainer"] button.btnSelectNone,
    :host([show_btn_export="false"]) div[data-_name="footerButtonContainer"] button.btnExport,
    :host([show_btn_search="false"]) div[data-_name="footerButtonContainer"] button.btnSearch,
    :host([show_footer_message="false"]) div[data-_name="footer_message"],
    :host([show_row_nudge_buttons="false"]) div[data-_name="footerButtonContainer"] button.btnNudgeUp,
    :host([show_row_nudge_buttons="false"]) div[data-_name="footerButtonContainer"] button.btnNudgeDown,
    .listRow[data-hidden="true"]
    {
        display: none;
    }

    /* port me */
    div[data-_name="uiContainer"] {
        position: relative;
        width: 100%;
    }
    div[data-_name="footer"] {
        display: grid;
        grid-template-columns: auto auto;
        align-items: center;
    }
    div[data-_name="footer"] div.buttonContainer {
        text-align: left;
    }
    div[data-_name="footer_message"] {
        overflow: auto;
    }
    div[data-_name="tableListContainer"] {
        display: grid;
        scrollbar-width: thin;
        scrollbar-gutter: stable;
        overflow-y: auto;
        min-width: fit-content;
        align-content: baseline;
        height: ${this.listcontainer_height};
    }
    div[data-_name="header_row"] {
        display: grid;
        scrollbar-width: thin;
        scrollbar-gutter: stable;
    }
    div[data-_name="tableContainer"] {
        scrollbar-width: thin;
        overflow: auto;
    }

    :host([show_footer="false"]) div[data-_name="footer"]{
        display: none;
    }

    /* ported styles NOTE: gonna need some vars up in this yo! */
    .tableContainer {
       box-shadow: var(--wc-table-box-shadow, 2px 2px 2px rgba(20, 22, 23, .3) inset);
       background: var(--wc-table-background, radial-gradient(ellipse at center, rgb(150, 167, 173), rgba(150, 167, 173, .6)));
       color: var(--wc-table-foreground-color, rgb(24, 35, 38));
       padding: var(--wc-table-padding, .25em);
       border-radius: var(--wc-table-border-radius, .5em);
       border-width: var(--wc-table-border-width, .128em);
       border-style: var(--wc-table-border-style, solid);
       border-top-color: var(--wc-table-border-top-color, transparent);
       border-left-color: var(--wc-table-border-left-color, transparent);
       border-right-color: var(--wc-table-border-right-color, transparent);
       border-bottom-color: var(--wc-table-border-bottom-color, transparent);
    }
    .hdrRow,.listRow {
       margin-bottom: .128em;
    }
    .hdrRow .hdrCol {
       border: var(--wc-table-header-col-border, 1px solid rgb(36, 36, 36));
       padding: var(--wc-table-header-col-padding, .25em .128em .128em .25em);
       background-color: var(--wc-table-header-col-background-color, rgba(36, 36, 36,.1));
       border-radius: var(--wc-table-header-col-border-radius, .25em);
    }
    .hdrRow .hdrCol[data-sort="descending"]:before {
       content: var(--wc-table-header-col-desc-sort-icon, '\\25BC');
       opacity: .5;
       font-size: var(--wc-table-header-col-desc-sort-icon-size, .8em);
    }
    .hdrRow .hdrCol[data-sort="ascending"]:before {
       content: var(--wc-table-header-col-asc-sort-icon,'\\25B2');
       opacity: .5;
       font-size: var(--wc-table-header-col-asc-sort-icon-size, .8em);
    }
    .hdrRow .hdrCol, .listRow .listCol {
       margin-right: .128em;
       padding: 0 .128em 0 .25em;
    }
    .listRow {
        display: grid;
    }
    .listRow[data-locked="true"]{
       font-style: italic;
       opacity: .5;
    }
    .listRow span.listCol[data-mono="true"] {
        font-family: monospace;
    }
    .listRow span.listCol {
       font-size: .8em;
    }
    .listRow span.listCol[data-locked="true"] {
       opacity: .4;
       text-decoration: line-through;
       background-color: var(--wc-table-list-col-locked-background-color, rgba(24, 35, 38, .2));
    }
    .listRow[data-highlight="true"] {
      background-color: var(--wc-table-list-col-highlight-background-color, rgb(179, 0, 0));
      color: var(--wc-table-list-col-highlight-foreground-color, rgb(22, 23, 25));
   }
    .listRow[data-selected="true"]:not([data-highlight="true"]) {
       background-color: var(--wc-table-list-col-selected-background-color, rgba(240, 240, 240,.8));
       filter: var(--wc-table-list-col-selected-filter, invert(.85));
    }
    .listRow[data-saved="true"]:not([data-selected='true']) {
       animation: savedRow 1.5s linear;
       filter: none;
    }
    .listRow[data-saved="true"][data-selected='true'] {
       animation: savedRowSelected 1.5s linear;
    }
    @keyframes savedRowSelected {
       0%    { background-color: var(--wc-table-row-selected-saved-animation-start-color); }
       100%  { background-color: var(--wc-table-row-selected-saved-animation-end-color); }
    }
    @keyframes savedRow {
       0%    { background-color: var(--wc-table-row-saved-animation-start-color); }
       100%  { background-color: var(--wc-table-row-saved-animation-end-color); }
    }
    .footer_message {
       font-size: var(--wc-table-footer-message-font-size, .8em);
       font-family:var(--wc-table-footer-message-font-family, Comfortaa);
       padding-right: .25em;
    }
    .label{
       font-family: var(--wc-table-label-font-family, Comfortaa);
       padding-left: .25em;
       font-weight: var(--wc-table-label-font-weight, bold);
    }
    .footer .buttonContainer .btnPrefs[data-open="true"]{
       opacity: .5;
    }
    .footer .buttonContainer .btnPrefs {
       background: transparent;
       border-color: transparent;
       color: var(--wc-table-footer-button-color, rgb(240, 240, 240));
       font-size: 1em;
    }
    .footer .buttonContainer button.txtBtn {
        background-color: transparent;
        color: var(--wc-table-footer-button-color, rgb(240, 240, 240));
        border: .128em solid var(--wc-table-footer-button-color, rgb(240, 240, 240));
        border-radius: var(--wc-table-footer-button-border-radius, 1em);
        font-size: var(--wc-table-footer-button-size, .55em);
        height: min-content;
        margin-right: .5em;
    }
    .footer .buttonContainer button.txtBtn:active, .footer .buttonContainer button.txtBtn[data-inv="true"] {
        background-color: var(--wc-table-footer-button-active-background-color, rgb(240, 240, 240));
        color: var(--wc-table-footer-button-active-color, rgb(22, 23, 25));
    }
    .footer .buttonContainer button.txtBtn:disabled {
       opacity: var(--wc-table-footer-button-disabled-opacity, .2);
    }
    .tablePrefEditor {
        position: absolute;
        overflow: hidden;
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 100%;
        left: 0px;
        top: 0px;
        z-index: 2;
        font-size: .8em;
    }
    .tablePrefEditor, .userPrompt, .exportUI {
       background-color: var(--wc-table-export-ui-background-color, rgba(24, 35, 38, .66));
       border-radius: var(--wc-table-export-ui-border-radius, .5em);
    }
    .defaultPrefUIEditor fieldset {
       display: grid;
       grid-template-columns: 1fr 1fr 1fr 1fr;
       text-align: left;
       color: var(--wc-table-pref-editor-fieldset-color, rgb(240,240,240));
       background-color: var(--wc-table-pref-editor-fieldset-background-color, rgba(24, 35, 38, .66));
       border-radius: var(--wc-table-pref-editor-fieldset-border-radius, 1em);
    }
    .defaultPrefUIEditor fieldset legend {
       font-family: var(--wc-table-pref-editor-legend-font-family, Comfortaa);
       font-weight: var(--wc-table-pref-editor-legend-font-weight, bolder);
       font-size: var(--wc-table-pref-editor-legend-font-size, 1.5em);
    }
    .defaultPrefUIEditor .btnContiner {
        width: 100%;
        text-align: right;
    }
    .defaultPrefUIEditor button.btnClose {
       margin-right: 1.5em;
       margin-top: .25em;
       font-family: var(--wc-table-pref-editor-close-button-font-family, Comfortaa);
       background: var(--wc-table-pref-editor-close-button-background, url('data:image/svg+xml;utf8,${this.cancelIcon}'));
       background-repeat: no-repeat;
       background-size: contain;
       padding-left: 1.65em;
       color: var(--wc-table-pref-editor-close-button-foreground-color, rgb(240, 240, 240));
       border: none;
    }
    .userPrompt {
       padding: 1em;
       border: .128em solid var(--wc-table-user-prompt-border-color, rgba(240, 240, 240, .8));
    }
    .userPrompt h2.prompt, .exportUI h2.prompt {
       margin: 0;
       font-family: var(--wc-table-user-prompt-font-family, Comfortaa);
    }
    .userPrompt div.buttonContainer, .exportUI div.buttonContainer {
       text-align: center;
    }
    .userPrompt div.buttonContainer button, .exportUI div.buttonContainer button {
       font-family: var(--wc-table-user-prompt-button-font-family, Comfortaa);
       font-size: var(--wc-table-user-prompt-button-font-size, .8em);
       padding: var(--wc-table-user-prompt-button-padding, .25em .5em .25em .5em);
       margin: .8em;
       border-radius: var(--wc-table-user-prompt-button-border-radius, .5em);
       background-color: var(--wc-table-user-prompt-button-background-color, rgba(240, 240, 240, .8));
       border: var(--wc-table-user-prompt-button-border, .128em solid rgb(20, 22, 23));
       color: var(--wc-table-user-prompt-button-foreground-color, rgb(20, 22, 23));
    }
    .exportUI {
       border: var(--wc-table-exoprt-ui-border, .128em solid rgb(240, 240, 240));
       padding: 1em;
       display: grid;
    }
    .exportUI .detail .chartBknd {
       fill: var(--wc-table-export-ui-chart-bknd, rgb(24, 35, 38));
       stroke: var(--wc-table-export-ui-chart-bknd-stroke, rgba(240, 240, 240, .8));
       stroke-width: var(--wc-table-export-ui-chart-bknd-stroke-width, 2px);
    }
    .exportUI .detail {
       display: grid;
       grid-template-columns: 4em auto;
       align-items: center;
       margin: 1em;
    }
    .exportUI .detail .deets {
       margin-left: .5em;
       display: grid;
    }
    .exportUI .detail .deets .explainer {
       font-style: italic;
       font-size: .8em;
       margin-bottom: .25em
    }
    .exportUI .detail .deets label {
       font-family: var(--wc-table-export-ui-label-font-family, Comfortaa);
    }
    .exportUI .detail .deets label.disabled {
      opacity: .25;
    }
`)};




/*
    getAttributeDefaults()
    override this in each subclass, as I can't find a more elegant way of
    referencing the static class vars in an overridable way
*/
getAttributeDefaults(){
    return(wcTable.classAttributeDefaults);
}




/*
    --------------------------------------------------------------------------------
    CUSTOM STUFF
    above this line is class-standard overrides
    --------------------------------------------------------------------------------
*/




/*
    columns attribute
*/
get columns(){ return(this._columns); }
set columns(v){
    if (
        (v instanceof Array) &&
        (v.length == v.filter((a)=>{return(a instanceof Object) && a.hasOwnProperty('name') && this.isNotNull(a.name)}, this).length)
    ){

        if (this.initialized){
            // this is *the* set of columns meaning we blow away whatever was there
            this._columns = [];
            this.header_row = '';

            // aight! holonnaurbutts ... note addCol will push this._columns for us
            v.forEach((col) => {
                try {
                    this.addColumn(col, false);
                }catch(e){
                    throw(`${this._className} v${this._version} | columns attribute setter | addColumn() threw unexpectedly for ${col.name} | ${e}`);
                }
            }, this);

            // setup the css
            this.applyRowCSS(this._elements.header_row);

            // the cols are added, sync the rows
            this.syncRows();
        }else{
            this._columns = v;
        }

    }else{
        throw(`${this._className} v${this._version} | columns attribute setter | invalid input format`);
    }
}




/*
    addColumn(col, propagateBool)
    add the column, syncRows if propagateBool is true
*/
addColumn(col, propagateBool){
    if (
        (col instanceof Object) &&
        col.hasOwnProperty('name') &&
        this.isNotNull(col.name) &&
        (this.columns.filter((a)=>{return((a instanceof Object) && (a.hasOwnProperty('name')) && (a.name == col.name))}).length == 0)
    ){
        // set default column order
        if (!(col.hasOwnProperty('order') && (! isNaN(parseInt(col.order))))){ col.order = this._columns.length + 1; }

        let span = this.getHeaderCell(col);
        col.visible = col.hasOwnProperty('visible')?(col.visible === true):true;
        this._columns.push(col);
        if (col.visible === true){
            this._elements.header_row.appendChild(span);
            this.applyRowCSS(this._elements.header_row);
            if (propagateBool === true){ this.syncRows(); }
        }else{
            col._el = span;
        }

    }else{
        throw(`${this._className} v${this._version} | addColumn() | invalid input`);
    }
}




/*
    getHeaderCell(column)
*/
getHeaderCell(col){
    let that = this;
    let span = document.createElement('span');
    span.className = that.headerColClassName;
    span.dataset.name = col.name;
    span.dataset.sort = 'none';
    span.textContent = col.name;
    span.addEventListener('click', (evt) => { that.handleColumnSort(span); });
    return(span);
}




/*
    applyRowCSS(rowElement)
    calculate grid-template-columns and apply it to the specified row
    this is the "use CSS to make it look like an old school table" part
*/
applyRowCSS(el){
    if (el instanceof Element){
        el.style.cursor = 'default';
        el.style.userSelect = 'none';
        el.style.width = '100%';
        el.style.height = 'max-content';
        el.style.gridTemplateColumns = this.columns.filter((a)=>{return(a.visible === true)}).sort((a,b) => {return(a.order - b.order)}).map((col) => {
            let width = ((col instanceof Object) && col.hasOwnProperty('width') && this.isNotNull(col.width))?col.width:1;
            return(
                `${width}${/^\d+$/.test(width)?'fr':''}`
            )
        }, this).join(" ");
    }
}




/*
    handleColumnSort(headerColumnElement, mode)
    if mode is given and it's one of the modes we use that, otherwise we toggle through them
*/
handleColumnSort(hdrColEl, mode){
    let that = this;
    if (that.allow_column_sort === true){
        if (that.debug){ console.log(`${that._className} v${that._version} | handleColumnSort(${hdrColEl.dataset.name}) | called`); }

        // it's a three way toggle: none | ascending | descending
        let modes = ['none','ascending','descending'];
        if (that.isNotNull(mode) && (modes.indexOf(mode) >= 0)){
            hdrColEl.dataset.sort = mode;
        }else{
            hdrColEl.dataset.sort = modes[
                (((modes.indexOf(hdrColEl.dataset.sort) + 1) > modes.length -1) || (modes.indexOf(hdrColEl.dataset.sort) < 0))?0:(modes.indexOf(hdrColEl.dataset.sort) + 1)
            ];
        }
        let colObj = that.columns.filter((a)=>{return(a.name == hdrColEl.dataset.name)})[0];

        // ok when unsetting the sort we don't really do anything until all of the cols are sorted none, then we restore the original sort order
        if (hdrColEl.dataset.sort == "none"){
            if (Array.from(that._elements.tableHeader.querySelectorAll(`span.${that.headerColClassName}:not([data-sort="none"])`)).length == 0){
                Array.from(that._elements.tableListContainer.querySelectorAll(`div.${that.dataRowClassName}`)).sort((a,b) => {
                    return(parseInt(a.dataset.rownum) - parseInt(b.dataset.rownum))
                }).forEach((el) => {
                    that._elements.tableListContainer.appendChild(el);
                })
            }
        }else{
            Array.from(that._elements.tableListContainer.querySelectorAll(`div.${that.dataRowClassName}`)).sort((a,b) => {
                let aEl = a.querySelector(`span.${that.dataRowColClassName}[data-name="${hdrColEl.dataset.name}"]`);
                let bEl = b.querySelector(`span.${that.dataRowColClassName}[data-name="${hdrColEl.dataset.name}"]`);

                // new (aware of wcBasic children)
                let aVal = (aEl instanceof Element)?(that.isNull(aEl.textContent) && (aEl.firstChild instanceof Element) && that.isNotNull(aEl.firstChild.textContent))?aEl.firstChild.textContent:aEl.textContent:null;
                let bVal = (bEl instanceof Element)?(that.isNull(bEl.textContent) && (bEl.firstChild instanceof Element) && that.isNotNull(bEl.firstChild.textContent))?bEl.firstChild.textContent:bEl.textContent:null;

                // handle custom sort function
                if ((colObj instanceof Object) && (colObj.sortFunction instanceof Function)){
                    return((hdrColEl.dataset.sort == 'ascending')?colObj.sortFunction(aVal,bVal):colObj.sortFunction(bVal,aVal));

                // handle numeric sort
                }else if (/^\d+$/.test(aVal) && /^\d+$/.test(bVal)){
                    return((hdrColEl.dataset.sort == 'ascending')?(aVal-bVal):(bVal-aVal));

                // handle string sort
                }else{
                    return((hdrColEl.dataset.sort == 'ascending')?aVal.localeCompare(bVal):bVal.localeCompare(aVal));
                }
            }).forEach((el) => {
                that._elements.tableListContainer.appendChild(el);
            })
        }
    }
}




/*
    syncRows(progressCallback)
    update every single row by calling renderCells on it
    (which in turn calls applyRowCSS)

    this executes on animationFrames, we batch rows into
    gropus of this.sync_rows_batch_limit

    as such is is async. We will call progressCallback(partial, complete, selfReference)
    if specified.
*/
syncRows(progressCallback){
    let that = this;
    return(new Promise((toot, boot) => {
        let chunks = [];
        let queue = Array.from(this._elements.tableListContainer.querySelectorAll(`div.${that.dataRowClassName}`));
        let complete = queue.length;
        while (queue.length > 0){ chunks.push(queue.splice(0, this.sync_rows_batch_limit)); }
        let doneCount = 0;
        function recursor(idx){
            if (idx == chunks.length){
                toot(true);
            }else{
                chunks[idx].forEach((el) => {
                    that.renderCells(el);
                    doneCount ++;
                });
                requestAnimationFrame(() => {
                    if (progressCallback instanceof Function){
                        try {
                            progressCallback(doneCount, complete, that);
                        }catch(e){
                            if (that.debug){ console.log(`${that._className} v${that._version} | syncRows() | ignored | progressCallback threw unexpectedly: ${e}`); }
                        }
                    }
                    recursor((idx + 1));
                })
            }
        }
        recursor(0);

    }));
}




/*
    renderCells(rowElement)
    create cells from rowElement.rowdata keys that have corresponding
    column definitions, in the proper order. Kill ones that shouldn't be there
    spawn ones that are missing. You get it.
*/
renderCells(rowElement){
    let that = this;
    if ((rowElement instanceof Element) && (rowElement.dataset.rowdata)){
        let data = null;
        try {
            data = JSON.parse(rowElement.dataset.rowdata);
        }catch(e){
            throw(`${this._className} v${this._version} | renderCells(${rowElement.dataset.rownum}) | failed to parse rowdata: ${e}`);
        }

        // remove columns we shouldn't have
        Array.from(rowElement.querySelectorAll(`span.${that.dataRowColClassName}`)).filter((el) =>{return(
            that.columns.filter((b)=>{return((b.name == el.dataset.name) && (b.visible === true))}).length == 0
        )}).forEach((el) =>{ el.remove(); });

        // spawn columns we're missing or update them if they're not -- in order which should make sure they're sorted properly (horizontally)
        that.columns.filter((a)=>{return(a.visible === true)}).sort((a,b) => {return(a.order - b.order)}).forEach((col) =>{
            let el = rowElement.querySelector(`span.${that.dataRowColClassName}[data-name="${col.name}"]`);
            if (el instanceof Element){

                // aight, we need to deal with element value cells here too
                if ((rowElement._elements instanceof Object) && (rowElement._elements.hasOwnProperty(col.name))){
                    el.innerHTML = ''
                    el.appendChild(rowElement._elements[col.name]);
                }else{
                    el.textContent = data.hasOwnProperty(col.name)?data[col.name]:'';
                }

                // insures we're in the right order
                rowElement.appendChild(el);

            }else{
                let span = document.createElement('span');
                span.className = that.dataRowColClassName;
                span.dataset.name = col.name;
                span.dataset.locked = false;
                if (col.hasOwnProperty('fieldId')){ span.dataset.fieldid = col.fieldId; }
                if (col.hasOwnProperty('mono') && (/^TRUE$/i.test(`${col.mono}`))){ span.dataset.mono = "true"; }

                // tryin' to make element values for cells a thing ...
                //span.textContent = data.hasOwnProperty(col.name)?data[col.name]:'';
                if ((rowElement._elements instanceof Object) && (rowElement._elements.hasOwnProperty(col.name))){
                    span.appendChild(rowElement._elements[col.name]);
                }else{
                    span.textContent = data.hasOwnProperty(col.name)?data[col.name]:'';
                }

                span.style.overflow = "hidden";
                span.addEventListener('dblclick', (evt) => {
                    // new hotness
                    if (! (rowElement.dataset.locked == 'true')){

                        // cell_edit
                        if (that.allow_cell_edit == true){
                            rowElement.dataset.locked = true;
                            that.handleCellEdit(rowElement, span).then(() => { rowElement.dataset.locked = false; }).catch((error) => {
                                rowElement.dataset.locked = false;
                                throw(`${that._className} v${that._version} | cell edit click handler | handleCellEdit() threw unexpectedly: ${error}`);
                            });

                        // rowDblClickCallback
                        }else if (that.rowDblClickCallback instanceof Function){
                            rowElement.dataset.locked = true;
                            that.rowDblClickCallback(rowElement, span, that).then(() => { rowElement.dataset.locked = false; }).catch((error) => {
                                rowElement.dataset.locked = false;
                                throw(`${that._className} v${that._version} | rowDblClickCallback() threw unexpectedly: ${error}`);
                            });
                        }
                    }
                });
                rowElement.appendChild(span);
            }
        });
        that.applyRowCSS(rowElement);
    }else{
        throw(`${this._className} v${this._version} | renderCells() | invalid input`);
    }
}




/*
    custom_buttons
    [{name: <str>, callback: function(tableRef, btnRef)}, ...]

    TO-DO: 5/17/24 @ 2256
    I just realized this contains callback references stored in the DOM
    which is just generally not cool. We need to set up an event listener thing
    like with the other web components
*/
get custom_buttons(){ return(this._customButtons); }
set custom_buttons(v){
    let that = this;
    if (v instanceof Array){

        if (that.initialized){
            // remove any existing custom buttons
            that._elements.footerButtonContainer.querySelectorAll('button.customButton').forEach((el) => { el.remove(); });

            // add the new ones
            v.filter((a)=>{return(
                (a instanceof Object) &&
                a.hasOwnProperty('name') &&
                that.isNotNull(a.name) &&
                (a.callback instanceof Function)
            )}).map((a) => {
                let btn = document.createElement('button');
                btn.classList.add('customButton', 'txtBtn');
                btn.textContent = a.name;
                btn.addEventListener('click', (evt) => { a.callback(that, btn); btn.blur();});
                btn.disabled = (a.hasOwnProperty('disabled') && (a.disabled === true));
                btn.dataset.enable_on_select = (a.hasOwnProperty('enable_on_select') && (a.enable_on_select == true));
                btn.dataset.enable_on_populate = (a.hasOwnProperty('enable_on_populate') && (a.enable_on_populate == true));
                return(btn);
            }).forEach((el) => {
                that._customButtons[el.textContent] = el;
                that._elements.footerButtonContainer.appendChild(el);
            });
        }
        that._customButtons = v;
    }
}




/*
    default_sort
    { colName: <str>, order: <enum: ascending, descending, none> }
*/
get default_sort(){ return(this._default_sort); }
set default_sort(v){
    if (
        (v instanceof Object) &&
        v.hasOwnProperty('colName') &&
        this.isNotNull(v.colName) &&
        v.hasOwnProperty('order') &&
        (['ascending', 'descending', 'none'].indexOf(v.order) >= 0)
    ){
        this._default_sort = v;
        if (this.initialized){ this.executeDefaultSort(); }
    }
}
executeDefaultSort(){
    if (
        (this.default_sort instanceof Object) &&
        this.default_sort.hasOwnProperty('colName') &&
        this.isNotNull(this.default_sort.colName) &&
        this.default_sort.hasOwnProperty('order') &&
        (['ascending', 'descending', 'none'].indexOf(this.default_sort.order) >= 0) &&
        (this._elements.header_row.querySelector(`span[data-name="${this.default_sort.colName}"]`) instanceof Element)
    ){
        this.handleColumnSort(this._elements.header_row.querySelector(`span[data-name="${this.default_sort.colName}"]`), this.default_sort.order);
    }
}



/*
    openPrefEditor(evt)
    we are gonna open an embeded modal dialog that obscures the table
    CSS is up to you to make it look nice with transparencies and such
    into that embedded dialog we are going to place the output of
    this.getPrefEditor(), which in turn will either spit back whatever
    your configured getPrefEditorCallback() or the output of defaultPrefEditor()
*/
openPrefEditor(evt){
    let that = this;
    that._elements.btnPrefs.dataset.open = (!(that._elements.btnPrefs.dataset.open == 'true'));
    if (that._elements.btnPrefs.dataset.open == 'true'){
        that.openPanel(that.getPrefEditor());
        that._elements.btnExport.disabled = true;
    }else{
        that.closePanel();
        that._elements.btnExport.disabled = false;
    }
}




/*
    getPrefEditor()
    return DOM tree for the table preferences editor
    if no getPrefEditorCallback specified,return this.defaultPrefEditor
*/
getPrefEditor(){
    return((this.getPrefEditorCallback instanceof Function)?this.getPrefEditorCallback(this):this.defaultPrefEditor)
}




/*
    defaultPrefEditor (DOM tree, read-only)
*/
get defaultPrefEditor(){
    let that = this;
    let div = document.createElement('div');
    div.className = this.defaultPrefUIEditorClass;

    // am feelin quite lazy
    div.innerHTML = `
        <fieldset style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; text-align: left;">
            <legend>select columns</legend>
            ${
                that.columns.sort((a,b) => {return(a.order - b.order)}).map((a) =>{
                    let guid = that.getGUID(that._guidCache);
                    return(`
                        <div class="defaultColSelectorOption" data-id="${guid}">
                            <input type="checkbox" data-colname="${a.name}" id="${guid}" ${(a.visible === true)?'checked':''} />
                            <label for="${guid}">${a.name}</label>
                        </div>
                    `);
                }).join("")
            }
        </fieldset>
        <div class="btnContainer" style="width: 100%; text-align: right;"><button class="btnClose">close</button></div>
    `;
    div.querySelectorAll('input').forEach((el) => {
        el.addEventListener("change", (evt) => {
            that.toggleColumnVisibility(el.dataset.colname, el.checked);
        });
    });
    div.querySelector('button.btnClose').addEventListener("click", (evt) => {
        that._elements.btnPrefs.click();
    });
    return(div);
}




/*
    removeColumn(colName, propagateBool)
    delete the specified column, syncRows is propagateBool is true
*/
removeColumn(colName, propagateBool){
    let that = this;
    if (
        that.isNotNull(colName) &&
        (that.columns.filter((a)=>{return((a instanceof Object) && (a.hasOwnProperty('name')) && (a.name == colName))}).length == 1)
    ){
        // remove column from UI
        let el = that._elements.header_row.querySelector(`span.${that.headerColClassName}[data-name="${colName}"]`);
        if (el instanceof Element){ el.remove(); }

        // remove it from the internal column list
        this._columns = this._columns.filter((a) => {return(!((a instanceof Object) && (a.hasOwnProperty('name')) && (a.name == colName)))});

        // sync the rows if we have the flag
        that.applyRowCSS(that._elements.header_row);
        if (propagateBool === true){ that.syncRows(); }

    }else{
        throw(`${that._className} v${that._version} | removeColumn() | invalid input`);
    }
}




/*
    toggleColumnVisibility(colName, visibilityBool)
    same thing as removeColumn, except don't actually remove it from columns
*/
toggleColumnVisibility(colName, visibilityBool){
    let that = this;
    if (
        that.isNotNull(colName) &&
        (that.columns.filter((a)=>{return((a instanceof Object) && (a.hasOwnProperty('name')) && (a.name == colName))}).length == 1)
    ){
        let colObject = that.columns.filter((a)=>{return((a instanceof Object) && (a.hasOwnProperty('name')) && (a.name == colName))})[0];
        if (visibilityBool === false){

            // remove column from UI, cheekily
            let el = that._elements.header_row.querySelector(`span.${that.headerColClassName}[data-name="${colName}"]`);
            if (el instanceof Element){
                colObject._el = el;
                el.remove();
            }

        }else{

            // with an equally cheeky disposition, add it back
            let ord = that.columns.sort((a,b)=>{return(a.order - b.order)}).map(a=>{return(a.name)});
            that._elements.header_row.appendChild((colObject._el instanceof Element)?colObject._el:that.getHeaderCell(colObject));
            Array.from(that._elements.header_row.querySelectorAll(`span.${that.headerColClassName}`)).sort((a,b) => {return(
                ord.indexOf(a.dataset.name) - ord.indexOf(b.dataset.name)
            )}).forEach((el) => {that._elements.header_row.appendChild(el); });
        }

        // remove it from the internal column list
        that.columns.filter((a)=>{return((a instanceof Object) && (a.hasOwnProperty('name')) && (a.name == colName))})[0].visible = (visibilityBool === true);

        // sync the rows if we have the flag
        that.applyRowCSS(that._elements.header_row);
        that.syncRows();

    }else{
        throw(`${that._className} v${that._version} | toggleColumnVisibility(${colName}, ${visibilityBool == true}) | invalid input`);
    }
}




/*
    handleSelectAll()
    not much but could be a lot of 'em, so batches of sync_rows_batch_limit
    on animationFrames, yo!
*/
handleSelectAll(evt){
    let that = this;
    return(new Promise((toot, boot) => {
        that._elements.btnSelectAll.disabled = true;
        let chunks = [];
        let queue = Array.from(that._elements.tableListContainer.querySelectorAll(`div.${that.dataRowClassName}[data-selected="false"]`));
        while (queue.length > 0){ chunks.push(queue.splice(0, that.sync_rows_batch_limit)); }

        function recursor(idx){
            if (idx == chunks.length){
                toot(true);
            }else{
                Promise.all(chunks[idx].map((el) => {return(that.handleRowSelect(el, true, false))})).then(() => {
                    requestAnimationFrame(() => { recursor(idx + 1)})
                })
            }
        }
        recursor(0);
    }));
}




/*
    handleRowSelect(listRowElement, selectBool, recurseBypassBool)
    if selectBool is specified, we will explicitly set the given select state
    if the existing select state is already present will take no action.
    if not specified, will simply toggle whatever value is present on the listRowElement
*/
handleRowSelect(listRowEl, selectBool, recurseBypassBool){
    let that = this;
    let newSelectState = that.isNotNull(selectBool)?(selectBool === true):(listRowEl instanceof Element)?(! (listRowEl.dataset.selected == "true")):false;
    return(new Promise((toot, boot) =>{
        if (that.debug){ console.log(`${that._className} v${that._version} | handleRowSelect(${listRowEl.dataset.rownum}, ${newSelectState}) | called`); }
        if (listRowEl.dataset.locked == "true"){
            if (that.debug){ console.log(`${that._className} v${that._version} | handleRowSelect(${listRowEl.dataset.rownum}, ${newSelectState}) | row locked, abort | exit`); }
            toot(false);
        }else if (newSelectState == (listRowEl.dataset.selected == "true")){
            if (that.debug){ console.log(`${that._className} v${that._version} | handleRowSelect(${listRowEl.dataset.rownum}, ${newSelectState}) | no select state change | exit`); }
            toot(false);
        }else{
            if (['single', 'multiple'].indexOf(that.select_mode) >= 0){
                new Promise((_t,_b) => {
                    if ((that.select_mode == 'single') && (! (recurseBypassBool == true))){
                        // enforce single select (await all other selected deselect)
                        Promise.all(Array.from(that._elements.tableListContainer.querySelectorAll(`div.${that.dataRowClassName}[data-selected="true"]:not([data-rownum="${listRowEl.dataset.rownum}"])`)).map((el) => {
                            return(that.handleRowSelect(el, false, true))
                        })).then(() => {
                            _t(true);
                        }).catch((error) => {
                            if (that.debug){ console.log(`${that._className} v${that._version} | handleRowSelect(${listRowEl.dataset.rownum}, ${newSelectState}) | deselect previously selected row for single mode select threw unexpectedly: ${error}`); }
                            _b(error);
                        });
                    }else{
                        _t(false);
                    }
                }).then(() => {
                    // handle calling the callback for this one, etc
                    if (that.rowSelectCallback instanceof Function){
                        that.rowSelectCallback((! (listRowEl.dataset.selected == "true")), listRowEl, that).then(() => {
                            listRowEl.dataset.selected = newSelectState;
                            that.updateFooterMessage();
                            toot(true);
                        }).catch((error) => {
                            if (that.debug){ console.log(`${that._className} v${that._version} | handleRowSelect(${listRowEl.dataset.rownum}, ${newSelectState}) | rowSelectCallback() threw unexpectedly: ${error}`); }
                            boot(error);
                        });
                    }else{
                        listRowEl.dataset.selected = newSelectState;
                        that.updateFooterMessage();
                        toot(true);
                    }
                }).catch((error) => {
                    // deselect for select_mode: single aborted
                    if (that.debug){ console.log(`${that._className} v${that._version} | handleRowSelect(${listRowEl.dataset.rownum}, ${newSelectState}) | failed to deselect at least one previously selected row for select_mode:singl |  rowSelectCallback() threw unexpectedly: ${error}`); }
                    boot(error);
                })
            }else{
                that.updateFooterMessage();
                toot(false);
            }
        }
    }));
}


/*
    updateFooterMessage()
*/
updateFooterMessage(){
    this._elements.footer_message.innerHTML = '';
    this._elements.footer_message.appendChild(this.getFooterMessage());
    this._elements.footerButtonContainer.querySelectorAll('button.txtBtn[data-enable_on_select="true"]').forEach((el) => { el.disabled = (this.numSelectedRows < 1); }, this);
    this._elements.footerButtonContainer.querySelectorAll('button.txtBtn[data-enable_on_populate="true"]').forEach((el) => { el.disabled = (this.numRows < 1); }, this);
}




/*
    getFooterMessage()
*/
getFooterMessage(){
    let that = this;

    /*
        does this belong here? no
        does every other part of the code that could affect a row select end up calling this: yes
        they say you can fix anything with duct tape and determination, y'know?
    */
    if(that.show_btn_select_none){that._elements.btnSelectNone.disabled = (this.numSelectedRows < 1);}
    if(that.show_btn_select_all){that._elements.btnSelectAll.disabled = (this.numRows == this.numSelectedRows);}
    if(that.show_btn_export){that._elements.btnExport.disabled = (this.numRows == 0);}
    if (that.show_row_nudge_buttons){
        if (this.numSelectedRows > 0){
            let selected = that.getSelected();
            let min = (Array.from(this._elements.tableListContainer.children).indexOf(selected[0].DOMElement) + 1);
            let max = (Array.from(this._elements.tableListContainer.children).indexOf(selected[(selected.length -1)].DOMElement) + 1);

            // disable up nudge if the minimum selected row is at top
            that._elements.btnNudgeUp.disabled = (min == 1);

            // disable nudge down if the max selected row is at bottom
            that._elements.btnNudgeDown.disabled = (max == that.numRows);

        }else{
            that._elements.btnNudgeUp.disabled = true;
            that._elements.btnNudgeDown.disabled = true;
        }
    }

    // oh yes, and also the actual code that belongs here ...
    if (that.getFooterMessageCallback instanceof Function){
        return(that.getFooterMessageCallback(that));
    }else{
        return(that.defaultFooterMessage);
    }
}




/*
    defaultFooterMessage (DOMTree)
*/
get defaultFooterMessage(){
    let div = document.createElement('div');
    div.style.display = 'flex';
    div.style.flexDirection = "row-reverse";
    div.insertAdjacentHTML('afterbegin', `
        <div class="section" data-name="selected">, <span class="value">${this.numSelectedRows}</span> selected</div>
        <div class="section" data-name="count"><span class="value">${this.numRows}</span> rows</div>
    `);
    return(div);
}




/*
    getSelected(rowFormat)
    return an array of all selected rows. We return the output of getRow() so
    [{data: {<fieldName>:<fieldValue>}, DOMElement: <RowElement>}, ...]

    rowFormat is optional enum: [colName, fieldID, fieldName]
    where colName is default if not specified

        * colName: .data[columnName] = columnValue
        * fieldID: .data[fieldID] = columnValue (if column specifies fieldID)
        * fieldName: .data[fieldName] = columnValue (if column speifies fieldName)
*/
getSelected(rowFormat){
    let that = this;
    return (Array.from(this._elements.tableListContainer.querySelectorAll(`.${this.dataRowClassName}[data-selected="true"]`)).map((el) => {

        if (that.isNull(rowFormat) || (rowFormat == 'colName')){
            return({
                data: JSON.parse(el.dataset.rowdata),
                DOMElement: el
            });
        }else if (rowFormat == 'fieldID'){
            let out = {};
            let dta = JSON.parse(el.dataset.rowdata);
            Object.keys(dta).forEach((colName) => {
                let colmatch = that.columns.filter((col) => {return(col.name == colName); });
                out[((colmatch.length > 0) && (colmatch[0].hasOwnProperty('fieldID')))?colmatch[0].fieldID:colName] = dta[colName];
            });
            return({
                data: out,
                DOMElement: el
            });
        }else if (rowFormat == 'fieldName'){
            let out = {};
            let dta = JSON.parse(el.dataset.rowdata);
            Object.keys(dta).forEach((colName) => {
                let colmatch = that.columns.filter((col) => {return(col.name == colName); });
                out[((colmatch.length > 0) && (colmatch[0].hasOwnProperty('fieldName')))?colmatch[0].fieldName:colName] = dta[colName];
            });
            return({
                data: out,
                DOMElement: el
            });
        }
    }));
}




/*
    numRows attribute
    return the number of data rows in the table
*/
get numRows(){
    return(this._elements.tableListContainer.querySelectorAll(`div.${this.dataRowClassName}:not([data-hidden="true"])`).length);
}




/*
    numSelectedRows attribute
    return the number of data rows in the table
*/
get numSelectedRows(){
    return(this._elements.tableListContainer.querySelectorAll(`div.${this.dataRowClassName}[data-selected="true"]`).length);
}




/*
    handleSelectNone()
    bizarro-world version of handleSelectAll() :p
*/
handleSelectNone(evt){
    let that = this;
    return(new Promise((toot, boot) => {
        that._elements.btnSelectNone.disabled = true;
        let chunks = [];
        let queue = Array.from(that._elements.tableListContainer.querySelectorAll(`div.${that.dataRowClassName}[data-selected="true"]`));
        while (queue.length > 0){ chunks.push(queue.splice(0, that.sync_rows_batch_limit)); }

        function recursor(idx){
            if (idx == chunks.length){
                toot(true);
            }else{
                Promise.all(chunks[idx].map((el) => {return(that.handleRowSelect(el, false, false))})).then(() => {
                    requestAnimationFrame(() => { recursor(idx + 1)})
                })
            }
        }
        recursor(0);
    }));
}




/*
    nudgeSelection(dir, distance)
    move the group of seleected rows 'up' or 'down' (dir) the
    <distance> number of steps. If you try to nudge it out of bounds
    nothing happens. throwin' is for shade, gurl.
*/
nudgeSelection(dir, distance){
    let that = this;
    if (
        (['up', 'down'].indexOf(dir) >= 0) &&
        (! isNaN(parseInt(distance))) &&
        (parseInt(distance) >= 1) &&
        (parseInt(distance) <= this.numRows)
    ){

        let rows = that.getSelected();

        // bounds check
        let a = Array.from(this._elements.tableListContainer.children);
        let min = (a.indexOf(rows[0].DOMElement) + 1);
        let max = (a.indexOf(rows[(rows.length -1)].DOMElement) + 1);
        if ((dir == 'up') && ((min - distance) > 0)){

            // jeffersons time
            rows.forEach((row) => {
                that.moveRow(row.DOMElement, ((a.indexOf(row.DOMElement)+1) - distance));
            });

        }else if ((dir == 'down') && ((max + distance) <= that.numRows)){

            // kick it root down
            rows.forEach((row) => {
                that.moveRow(row.DOMElement, ((a.indexOf(row.DOMElement)+1) + distance));
            });
        }

        // yeah I know its messy but it gets the jerb dun
        that.updateFooterMessage();
    }
}




/*
    removeRow(idx)
    delete the row at the specified index. This is 1-indexed (so first row is 1)
*/
removeRow(idx){
    let el = this._elements.tableListContainer.querySelector(`.${this.dataRowClassName}:nth-child(${idx})`);
    if (el instanceof Element){
        el.remove();
        this.updateFooterMessage();
        return(el);
    }else{
        throw(`${this._className} v${this._version} | removeRow(${idx}) | invalid input`);
    }
}




/*
    moveRow(rowElement, toIndex)
    move the given row to the given index
    the previous occupant of toIndex will get an Element.before(),
    meaning everything else gets shifted down -- if toIndex is < rowElement.currentPosition
    and an Element.after() if toIndex is > rowElement.currentPosition

    this *does not* affect default sort order so you might not
    wanna use this in conjuction with allowColumnSort:true
    as the user could easily blow away whatever moves you've made here.
    <bigvoice>you have been warned!</bigvoice>
*/
moveRow(rowElement, toIndex){
    let el = this._elements.tableListContainer.querySelector(`.${this.dataRowClassName}:nth-child(${toIndex})`);
    let rowElementIndex = (Array.from(this._elements.tableListContainer.children).indexOf(rowElement) + 1);
    if (el instanceof Element){
        if (rowElementIndex > toIndex){ el.before(rowElement); }else{ el.after(rowElement); }
    }
}




/*
    rows attribute
    get and set rows as an array of objects
    note setter replaces all existing rows
    and yeah we're gonna do it in batches on animationFrames so rendering
    gigantor tables doesn't smurf the UI thread
*/
get rows(){

    return(
        (this._rows instanceof Array)?this._rows:Array.from(this._elements.tableListContainer.querySelectorAll(`div.${this.dataRowClassName}`)).map((el) => {
            return(JSON.parse(el.dataset.rowdata))
        })
    );
}
set rows(v){
    let that = this;
    that.setRows(v).catch((error) => { throw(error); })
}
setRows(v){
    let that = this;
    return(new Promise((toot, boot) => {
        if (
            (v instanceof Array) &&
            (v.length == v.filter((a)=>{return(a instanceof Object)}).length)
        ){
            if (that.initialized){
                that.tableListContainer = '';
                let chunks = [];
                let complete = v.length;
                let doneCount = 0;
                while (v.length > 0){ chunks.push(v.splice(0, this.sync_rows_batch_limit)); }
                function recursor(idx){
                    if (idx == chunks.length){
                        delete(that._rows);
                        that.executeDefaultSort();
                        toot(true);
                    }else{
                        chunks[idx].forEach((row) => {
                            that.addRow(row, true, false);
                            doneCount ++;
                        });
                        requestAnimationFrame(() => {
                            if (that.renderRowsProgressCallback instanceof Function){
                                try {
                                    that.renderRowsProgressCallback(doneCount, complete, that);
                                }catch(e){
                                    if (that.debug){ console.log(`${that._className} v${that._version} | setRows() | ignored | renderRowsProgressCallback threw unexpectedly: ${e}`); }
                                }
                            }
                            recursor((idx + 1));
                        });
                    }
                }
                recursor(0);
            }else{
                this._rows = v;
            }
        }else{
            boot(`${that._className} v${that._version} | setRows() | invalid input format`);
        }
    }));
}



/*
    addRow(rowData, renderCellsBool, defaultSortBool)
*/
addRow(row, renderCellsBool, defaultSortBool){
    let that = this;
    let newRow = this.getRowElement(row, (this.numRows + 1), (this.isNull(renderCellsBool) || (renderCellsBool === true)));
    this._elements.tableListContainer.appendChild(newRow);
    if (that.rowSetupCallback instanceof Function){ that.rowSetupCallback(newRow, that); }
    if (!(defaultSortBool === false)){ this.executeDefaultSort(); }
    this.updateFooterMessage();
    return(newRow);
}




/*
    getRowElement(rowData, rownum, renderCellsBool)
    get the DOM element for a table row with the given rowData
    set dataset.rownum to the given rownum (if null: 0) -- this is the default sort order
    if renderCellsBool is true, call renderCells on it (maybe you don't want to if you're not sure the cols exist yet)
*/
getRowElement(row, rownum, renderCellsBool){
    let that = this;
    if (row instanceof Object){
        let div = document.createElement('div');
        div.className = that.dataRowClassName;
        div.dataset.selected = "false";
        div.dataset.rownum = isNaN(parseInt(rownum))?0:parseInt(rownum);

        // aight. I wanna pass Elements in as cell values.
        //div.dataset.rowdata = JSON.stringify(row);
        div._elements = {};
        const rd = {};
        Object.keys(row).forEach((colName) => {
            if (row[colName] instanceof Element){
                div._elements[colName] = row[colName];
                rd[colName] = row[colName].textContent;
            }else{
                rd[colName] = row[colName];
            }
        });
        div.dataset.rowdata = JSON.stringify(rd);

        that.applyRowCSS(div);
        div.addEventListener('click', (evt) => { that.handleRowSelect(div); });
        if (renderCellsBool === true){ that.renderCells(div); }
        return(div);
    }else{
        throw(`${that._className} v${that._version} | getRowElement() | invalid input`);
    }
}




/*
    rowElements getter
    returns an array of all the rowElements
*/
get rowElements(){
    return(Array.from(this._elements.tableListContainer.querySelectorAll(`.${this.dataRowClassName}`)));
}




/*
    openPanel(DOMTree)
*/
openPanel(DOMTree){
    let that = this;
    if (DOMTree instanceof Element){
        that._elements.uiContainer.appendChild(that.prefEditorFrameThingy.DOMElement);
        that.prefEditorFrameThingy._elements.uiContainer.innerHTML = '';
        that.prefEditorFrameThingy._elements.uiContainer.appendChild(DOMTree);
        requestAnimationFrame(() => {
            //let d = that.prefEditorFrameThingy._elements.uiContainer.getBoundingClientRect();
            //that.DOMElement.style.minWidth = `${d.width}px`;
            that.DOMElement.style.minWidth = `${DOMTree.clientWidth}px`;
            if (that.openPanelCallback instanceof Function){
                that.openPanelCallback(that, that.prefEditorFrameThingy._elements.uiContainer);
            }
        });
    }else{
        throw(`${that._className} v${that._version} | openPanel() | invalid input`);
    }
}




/*
    closePanel()
*/
closePanel(){
    this.prefEditorFrameThingy.DOMElement.remove();
    this.DOMElement.style.minWidth = null;
    if (this.closePanelCallback instanceof Function){ this.closePanelCallback(this); }
}




/*
    userQuery({
        prompt: <str>, a title
        detail: <str>, detail text paragraph
        options: {<str>:<val>, ...} // es6 default hash key ordering ftw
    })
    display a modal dialog blocking the table with the specified options.
    resolve the promise with the textContent of the button that got selected
*/
userQuery(args){
    let that = this;
    return(new Promise((toot, boot) => {
        let div = document.createElement('div');
        div.className = that.userPromptClass;
        div.insertAdjacentHTML('afterbegin', `
            <h2 class="prompt"></h2>
            <p class="detail"></p>
            <div class="buttonContainer"></div>
        `);
        if (args.hasOwnProperty('prompt') && that.isNotNull(args.prompt)){
            div.querySelector('h2.prompt').textContent = args.prompt;
        }else{
            div.querySelector('h2.prompt').remove();
        }

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
        if (args.options instanceof Object){
            Object.keys(args.options).map((s) => {
                let btn = document.createElement('button');
                btn.textContent = s;
                btn.addEventListener('click', (evt) => {
                    that.closePanel();
                    that._elements.footerButtonContainer.querySelectorAll('button').forEach((el) => { el.disabled = false; });
                    toot(args.options[s]);
                });
                return(btn);
            }).forEach((el) => { div.querySelector("div.buttonContainer").appendChild(el); })
        }
        that._elements.footerButtonContainer.querySelectorAll('button').forEach((el) => { el.disabled = true; });
        that.openPanel(div);
    }));
}




/*
    openExportUI()
    returns a promise that resolves when the UI is closed
    in case you needed that etc.
*/
openExportUI(){
    let that = this;
    return(new Promise((toot, boot) => {
        let that = this;
        return(new Promise((toot, boot) => {
            that._elements.btnExport.disabled = true;

            // make the export UI
            let div = document.createElement('div');
            div.className = that.exportUIClass;
            div.insertAdjacentHTML('afterbegin', `
                <h2 class="prompt">CSV Export</h2>
                <div class="detail">
                    <div class="gfxContainer"></div>
                    <div class="deets">
                        <span class="explainer"></span>
                        <div class="defaultColSelectorOption">
                            <input type="checkbox" id="selectedRowsOnlyCheckbox" ${(that.numSelectedRows == 0)?'disabled':''}/>
                            <label for="selectedRowsOnlyCheckbox" class="${(that.numSelectedRows == 0)?'disabled':''}">export selected rows only</label>
                        </div>
                    </div>
                </div>
                <div class="buttonContainer">
                    <a class="downloader"><button class="btnDownloadFile" disabled>download CSV export</button></a>
                    <button class="btnClose">close</button>
                </div>
            `);
            let checkBox = div.querySelector(`#selectedRowsOnlyCheckbox`);
            let explainer = div.querySelector(`span.explainer`);
            let gfxContainer = div.querySelector(`div.gfxContainer`);
            let btnDownloadFile = div.querySelector('button.btnDownloadFile');
            let btnClose = div.querySelector('button.btnClose');
            let guh = div.querySelector('div.defaultColSelectorOption');
            let link = div.querySelector('a.downloader');

            // make the progres display pie chart
            let pie = new wcPieChart({
                show_chart: true,
                zIndex: 1
            });
            pie.addChart({name: 'loading', value: 0, chart_color: 'rgba(6, 133, 135, .66)'});
            gfxContainer.appendChild(pie);
            pie.size = '4em'; // it's a long story

            // btnClose hook
            btnClose.addEventListener('click', (evt) => {
                that.closePanel();
                that._elements.btnExport.disabled = false;
                toot(true);
            });

            // checkbox hook
            checkBox.addEventListener('change', (evt) => { exportIt(); });

            // helper function does the business
            function exportIt(){
                // deactivate everything, build the export, setup the button and then unlock everything
                btnClose.disabled = true;
                btnDownloadFile.disabled = true;
                checkBox.disabled = true;

                that.getCSVExport(checkBox.checked, pie, explainer, link).then(() => {
                    btnDownloadFile.disabled = false;
                    btnClose.disabled = false;
                    checkBox.disabled = (that.numSelectedRows == 0);
                }).catch((error) => {
                    guh.remove();
                    explainer.textContent = `export failed: ${error}`;
                    btnDownloadFile.disabled = true;
                    btnClose.disabled = false;
                });
            }

            // open the panel and show the export UI
            that.openPanel(div);

            // get initial export, set it up
            requestAnimationFrame(() => { exportIt(); });

        }));
    }));
}




/*
    getCSVExport(exportSelectedOnlyBool, pieChart, explainerEl, linkEl)
    export the table (or the selected rows if exportSelectedOnlyBool is hot)
    do this in batches of sync_rows_batch_limit length aligned to animationFrames
    because there might be a bajillion rows to deal with

    explainerEl is a span, put progress messages here

    linkEl is the link onto which we should put the big CSV export we build here
*/
getCSVExport(exportSelectedOnlyBool, pieChart, explainerEl, linkEl){
    let that = this;
    return(new Promise((toot, boot) => {

        // get sync_rows_batch_limit sized chunks of rows
        let chunks = [];
        let queue = Array.from(this._elements.tableListContainer.querySelectorAll(`div.${that.dataRowClassName}${(exportSelectedOnlyBool === true)?'[data-selected="true"]':''}`));
        let complete = queue.length;
        while (queue.length > 0){ chunks.push(queue.splice(0, this.sync_rows_batch_limit)); }
        let csvQueue = [];

        // get the header :-)
        csvQueue.push(that.encodeCSVRow(Array.from(that._elements.header_row.querySelectorAll(`span.${that.headerColClassName}`)).map((el) =>{ return(el.textContent); })));

        // basically we're doing what get data() would do but spitting out an array of csv encoded strings
        pieChart.updateChart('loading', 0);
        explainerEl.textContent = 'exporting ...';
        function recursor(idx){
            if (idx == chunks.length){
                // zip it 'n ship it yo!
                linkEl.href = 'data:text/csv;charset=UTF-8,' + encodeURIComponent(csvQueue.join("\n"));
                linkEl.download = that.isNotNull(that.exportFileName)?that.exportFileName:`csv_export_${epochTimestamp(true)}.csv`;
                pieChart.updateChart('loading', 0);
                pieChart.badgeTxt = '✔️';
                explainerEl.textContent = `export ready`;
                toot(true);
            }else{
                // get literally whatever columns are on screen, then get a CSV row from it and push it on the stack
                chunks[idx].filter((rowEl) => {return(! (rowEl.dataset.hidden == "true"))}).forEach((rowEl) =>{
                    csvQueue.push(that.encodeCSVRow(Array.from(rowEl.querySelectorAll(`span.${that.dataRowColClassName}`)).map((el) =>{
                        // ohhhhlordt ...
                        //return(el.textContent);
                        return((that.isNull(el.textContent) && (el.firstChild instanceof Element) && that.isNotNull(el.firstChild.textContent))?el.firstChild.textContent:el.textContent);

                    })))
                });
                explainerEl.textContent = `exporting (${csvQueue.length} of ${complete})`;
                pieChart.updateChart('loading', ((csvQueue.length/complete)*100));
                requestAnimationFrame(() => { recursor(idx + 1); });
            }
        }
        recursor(0);
    }));
}




/*
    encodeCSVRow(array)
    convert the given array to a CSV-encoded string properly escaped and joined with ","
    and return the string. You might wanna use this in an array.map or something eh?

    NOTE this is yanked out of noiceApplicationCore but for *reasons* we need a separate
    instance here. Actually applicationCore probably isn't the best place for it.
    in fact, maybe some kinda noiceCSVUtil in noiceCore might be better but whatever
    gotta get this mess done
*/
encodeCSVRow(inp){
    let that = this;
    if (inp instanceof Array){

        // better performance?!
        return(that.decodeHTMLEntities(inp.map((col) => {
            col = `${col}`.replace(/\n/g, '').replace(/\r/g, '').replace(/\t/g, '    ').replace(/\"/g, '""').replace(/\“/g, '""').replace(/\”/g, '""');
            if ((/\"/.test(col)) || (/,/.test(col))){
                col = `"${col}"`;
            }else if (/^\d+$/.test(col)){
                col = `="${col}"`;
            }else if (that.isNull(col)){
                col = '';
            }
            return(col);
        }).join(",")));

    }else{
        if (that.debug){ this.log(`${that._className} v${that._version} | encodeCSVRow() | input is not instance of Array | returning null`); }
        return('');
    }
}




/*
    decodeHTMLEntities(string)
    my google-fu tells me this is the most legit way to decode HTML entities in a string
    also stolen from noiceApplicationCore and I don't think it really belongs there but
    gotta get r dun
*/
decodeHTMLEntities(str){
    return(new DOMParser().parseFromString(str, "text/html").documentElement.textContent);
}






/*
    getRow(idx)
    return this dataStructure for the given row:
    {data: {<fieldName>:<fieldValue>}, DOMElement: <RowElement>}
*/
getRow(idx){
    let el = this._elements.tableListContainer.querySelector(`.${this.dataRowClassName}:nth-child(${idx})`);
    if (el instanceof Element){
        return({
            data: JSON.parse(el.dataset.rowdata),
            DOMElement: el
        });
    }else{;
        throw(`${this._className} v${this._version} | getRow(${idx}) | invalid input`);
    }
}





/*
    modifyRow(idx, data)
*/
modifyRow(idx, data){
    let that = this;
    return(new Promise((toot, boot) =>{
        let row = null;
        try {
            row = that.getRow(idx);
        }catch(e){
            if (that.debug){ console.log(`${that._className} v${that._version} | modifyRow(${idx}, ${JSON.stringify(data)}) | getRow() threw unexpectedly: ${error}`); }
            boot(error);
        }
        if (that.isNotNull(row)){
            new Promise((_t,_b) =>{
                if (that.modifyRowCallback instanceof Function){
                    that.modifyRowCallback(row.DOMElement, data).then((cData) => { _t(cData); }).catch((error) => { _b(error); });
                }else{
                    _t(data);
                }
            }).then((cData) => {
                row.DOMElement.dataset.rowdata = JSON.stringify(Object.assign({}, JSON.parse(row.DOMElement.dataset.rowdata), cData));
                that.renderCells(row.DOMElement);
                toot(row);
            }).catch((error) => {
                if (that.debug){ console.log(`${that._className} v${that._version} | mofifyRow(${idx}, ${JSON.stringify(data)}) | modifyRowCallback() threw unexpectedly: ${error}`); }
                boot(error);
            });
        }
    }));
}





/*
    updateRow(rowElement, data, enableCallbackBool)
    this is like modifyRow, except we take the rowElement as an arg directly
    we update the data then call renderCells. If enableCallbackBool
    is set true await the modifyRowCallnack.
    on success resolves to the updated row DOM element
*/
updateRow(rowElement, data, enableCallbackBool){
    let that = this;

    return(new Promise((toot, boot) =>{
        // await the calback if we're supposed to
        new Promise((_t,_b) => {
            if ((enableCallbackBool === true) && (that.modifyRowCallback instanceof Function)){
                that.modifyRowCallback(rowElement, data).then((cData) => { _t(cData); }).catch((error) => { _b(error); });
            }else{
                _t(data);
            }
        }).then((cData) =>{
            // update the row and be out
            rowElement.dataset.rowdata = JSON.stringify(Object.assign({}, JSON.parse(rowElement.dataset.rowdata), cData));
            that.renderCells(rowElement);
            toot(rowElement);
        }).catch((error) => {
            if (that.debug){ console.log(`${that._className} v${that._version} | updateRow(${JSON.stringify(data)}) | modifyRowCallback() threw unexpectedly: ${error}`); }
            boot(error);
        })
    }));
}




/*
    data attribute
    get and set the entire table content including the header as a massive
    2D array-of-arrays. Basically take a parsed spreadsheet as input ya dig?
    NOTE: this sets/gets ONLY visible data since this format has no means of
    representing non-visible row values without a corresponding header columns
*/
get data(){
    // literally just returning a grid of what's visible in the DOM. noice!
    let that = this;
    let out = [ Array.from(that._elements.header_row.querySelectorAll(`span.${that.headerColClassName}`)).map((el)=>{return(el.textContent)}) ];
    return(out.concat(Array.from(that._elements.tableListContainer.querySelectorAll(`div.${that.dataRowClassName}`)).map((el) => {return(
        Array.from(el.querySelectorAll(`span.${that.dataRowColClassName}`)).map((span) =>{ return(span.textContent); })
    )})));
}
set data(v){
    let that = this;
    if (
        (v instanceof Array) &&
        (v.length == v.filter((a)=>{return(a instanceof Array)}).length)
    ){
        let columns = [];
        let rows = [];
        v.forEach((vRow, idx) => {
            // get cols from the header
            if (idx == 0){
                columns = vRow.map((colName, i) => {return({
                    name: colName,
                    order: i
                })});

            // the rest are data rows
            }else{
                let tmp = {};
                vRow.forEach((vCol, vIdx) => { if (vIdx < columns.length){ tmp[columns[vIdx].name] = vCol; } });
                rows.push(tmp);
            }
        });

        // reset table
        that.reset();
        that.columns = columns;
        that.rows = rows;

    }else{
        // bad data format
        throw(`${this._className} v${this._version} | data attribute setter | invalid input data format`)
    }
}




/*
    maxListHeight attribute
    if not set, the height of the rendered table is unbounded
    if that's not what you want you can set the max-height CSS
    attribute of this.tableListContainer in any supported CSS units you like
    this will provoke the scrollbar and sticky header via the hard-coded CSS
*/
get maxListHeight(){
    return(this._elements.tableListContainer.style.maxHeight);
}
set maxListHeight(v){
    this._elements.tableListContainer.style.height = null;
    this._elements.tableListContainer.style.maxHeight = v;
}
get listHeight(){
    return(this._elements.tableListContainer.style.height);
}
set listHeight(v){
    this._elements.tableListContainer.style.maxHeight = null;
    this._elements.tableListContainer.style.height = v;
}




/*
    deselectAll(forceBool)
    simply deselect all of the selected rows
    if forceBool is set true, just reset the rows and don't even bother trying the callback
    otherwise await the callbacks and let 'em abort if they need to
*/
deselectAll(forceBool){
    let that = this;
    return(Promise.all(Array.from(that._elements.tableListContainer.querySelectorAll(`.${that.dataRowClassName}[data-selected="true"]`)).map((el) => {
        return(new Promise((toot, boot) => {
            if (forceBool === true){
                el.dataset.selected = false;
                toot(true);
            }else{
                that.handleRowSelect(el, false, true).then(()=>{toot(true)}).catch((error) => {
                    if (that.debug){ console.log(`${that._className} v${that._version} | deselectAll(${forceBool === true}) | rowSelectCallback() aborted deselect (try forceBool): ${error}`)}
                    boot(error);
                })
            }
        }));
    })));
}




/*
    selectAll(forceBool)
    simply select all of the selected rows
    if forceBool is set true, just reset the rows and don't even bother trying the callback
    otherwise await the callbacks and let 'em abort if they need to
    totes obvs: this does not a thing if selectMode != 'multiple'
*/
selectAll(forceBool){
    let that = this;
    return(Promise.all(Array.from(that._elements.tableListContainer.querySelectorAll(`.${that.dataRowClassName}[data-selected="false"]`)).map((el) => {
        return(new Promise((toot, boot) => {
            if (! that.selectMode == "multiple"){
                toot(true);
            }else if (forceBool === true){
                el.dataset.selected = true;
                toot(true);
            }else{
                that.handleRowSelect(el, true, true).then(()=>{toot(true)}).catch((error) => {
                    if (that.debug){ console.log(`${that._className} v${that._version} | selectAll(${forceBool === true}) | rowSelectCallback() aborted deselect (try forceBool): ${error}`)}
                    boot(error);
                })
            }
        }));
    })));
}




/*
    clear()
    remove all data rows from the table
*/
clear(){
    this._elements.tableListContainer.innerHTML = '';
    this._elements.btnSearch.dataset.inv = "false";
    let that = this;
    requestAnimationFrame(() => { that.updateFooterMessage(); });
}




/*
    reset()
    remove all data rows and all columns from the table
*/
reset(){
    this.clear();
    this.columns = [];
    this._elements.header_row.innerHTML = '';
}




/*
    modifyCellValue(rowElement, cellElement, value)
    set the given value on the specified cellElement within the specified rowElement
    await the modifyRowCallback if we have one, then call renderCells and be out
*/
modifyCellValue(rowElement, cellElement, value){
    let that = this;
    return(new Promise((toot, boot) => {

        new Promise((_t, _b) => {
            let guh = {};
            guh[cellElement.dataset.name] = value;
            if (that.modifyRowCallback instanceof Function){
               that.modifyRowCallback(rowElement, guh).then((d) => { _t(d); }).catch((error) => { _b(error); });
            }else{
               _t(guh);
           }
        }).then((cData) => {
            let dta = Object.assign({}, JSON.parse(rowElement.dataset.rowdata), cData);
            rowElement.dataset.rowdata = JSON.stringify(dta);
            try {
                that.renderCells(rowElement);
                toot(true);
            }catch(e){
                if (that.debug){ console.log(`${that._className} v${that._version} | modifyCellValue() | renderCells() threw unexpectedly: ${error}`); }
                boot(error);
            }
        }).catch((error) => {
            if (that.debug){ console.log(`${that._className} v${that._version} | modifyCellValue() | modifyRowCallback() threw unexpectedly: ${error}`); }
            boot(error);
        });
    }));
}




/*
    cellEditor attribute returns
    editCellCallback (if specified) or defaultCellEditCallback
*/
get cellEditor(){ return( (this.editCellCallback instanceof Function)?this.editCellCallback:this.defaultCellEditCallback); }




/*
    defaultCellEditCallback(rowElement, cellElement, selfRef)
    if no cellEditCallback is specified at object instantiation
    but allowEdit is set true, we will use this default cell editor
    it's kinda barebones and dumb. You might wanna use this as a
    tempate for building one a little fancier
*/
defaultCellEditCallback(rowElement, cellElement, selfRef){
    let that = this;
    return(new Promise((toot, boot) => {

        let c = cellElement.getBoundingClientRect();

        let inp = document.createElement('input');
        inp.setAttribute('type', 'text');
        inp.value = cellElement.textContent;
        inp.style.width = `${(c.width - 4)}px`;
        inp.className = that.defaultCellEditorInputClass;

        inp.addEventListener('focusout', (evt) => {

            // so-dumb-it-actually-works xss filter
            let bs = document.createElement('div');
            bs.textContent = inp.value;
            inp.remove();
            toot(bs.innerHTML);

        });
        inp.addEventListener('keydown', (evt) => {
            if (evt.keyCode == 13){ inp.blur(); }
        });

        cellElement.innerHTML = '';
        cellElement.appendChild(inp);
        inp.focus();
    }));
}




/*
    handleCellEdit(rowElement, cellElement)
    if allow_cell_edit: true, and editCellCallback is specified, call it and await output
    if resolved promise, send returned value to modifyRow() and let it call the modifyRowCallback() if specified
*/
handleCellEdit(rowElement, cellElement){
    let that = this;
    return(new Promise((toot, boot) => {
        if (
            (that.allow_cell_edit == true) &&
            (that.cellEditor instanceof Function) &&
            (that.columns.filter((a)=>{return(
                (a.name == cellElement.dataset.name) && (! (a.hasOwnProperty('disableCellEdit') && (a.disableCellEdit === true)))
            )}).length == 1) &&
            (cellElement instanceof Element)
        ){
            if ((!(
                (cellElement.dataset) &&
                (cellElement.dataset.locked) &&
                (cellElement.dataset.locked == "true")
            ))){

                // do all the things
                let undoValue = cellElement.textContent;
                that.cellEditor(rowElement, cellElement, that).then((value) => {

                    // if we're in modify mode and modifyAll: prompt is set ...
                    new Promise((_t,_b) => {

                        let colRef = that.columns.filter((a) => {return(a.name == cellElement.dataset.name)})[0];
                        let dma = ((colRef instanceof Object) && colRef.hasOwnProperty('disableModifyAll') && (colRef.disableModifyAll == true));

                        if ((that.select_mode == 'multiple') && (that.numSelectedRows > 1) && (! dma)){
                            if (that.modifyAll == "prompt"){
                                let grr = {};
                                grr[`Modify ${that.numSelectedRows} Rows`] = 'all';

                                that.userQuery({
                                    prompt: `Modify All Rows?`,
                                    detail: `You have changed the value of '${cellElement.dataset.name}', copy this change to all ${that.numSelectedRows} selected rows?`,
                                    options: Object.assign(grr, {
                                        'Only This Row': 'selfOnly',
                                        'Undo': null
                                    })
                                }).then((userResponse) => {
                                    if (that.isNull(userResponse)){
                                        _b('undo');
                                    }else{
                                        _t(userResponse == 'all');
                                    }
                                });
                            }else if (that.modifyAll == "auto"){
                                _t('all');
                            }else{
                                _t('selfOnly');
                            }
                        }else{
                            _t('selfOnly');
                        }
                    }).then((copyAllBool) => {


                        /*
                            if copyAllBool is hot, copy all the other rows
                            if copyAllBool is chill, just modify the one row
                        */
                        if (copyAllBool == true){

                            let rowQueue = that.getSelected();
                            function recursor(idx){
                                if (idx == rowQueue.length){
                                    toot(true);
                                }else{
                                    let ce = rowQueue[idx].DOMElement.querySelector(`.${that.dataRowColClassName}[data-name='${cellElement.dataset.name}']`);
                                    if (ce instanceof Element){
                                        that.modifyCellValue(rowQueue[idx].DOMElement, ce, value).then(() => {
                                            requestAnimationFrame(() => {recursor(idx + 1); });
                                        }).catch((error) => {
                                            if (that.debug){ console.log(`${that._className} v${that._version} | handleCellEdit() | modifyCellValue() threw unexpectedly on rownum: ${rowQueue[idx].DOMElement.dataset.rownum}: ${error}`); }
                                            boot(error);
                                        });
                                    }
                                }
                            }
                            recursor(0);

                        }else{
                            that.modifyCellValue(rowElement, cellElement, value).then(() => {
                                toot(true);
                            }).catch((error) => {
                                if (that.debug){ console.log(`${that._className} v${that._version} | handleCellEdit() | modifyCellValue() threw unexpectedly: ${error}`); }
                                boot(error);
                            });
                        }


                    }).catch((error) => {
                        // user query threw. this means undo
                        cellElement.textContent = undoValue;
                        toot(false);
                    });
                }).catch((error) => {
                    if (that.debug){ console.log(`${that._className} v${that._version} | handleCellEdit() | editCellCallback() threw unexpectedly: ${error}`); }
                    boot(error);
                });

            }else if (
                (cellElement.dataset) &&
                (cellElement.dataset.locked) &&
                (cellElement.dataset.locked == "true")
            ){
                if (
                    cellElement.dataset.lockmessage &&
                    that.isNotNull(cellElement.dataset.lockmessage)
                ){
                    // pop the note about why it can't be edited
                    that.userQuery({
                        prompt: `Cell cannot be edited`,
                        detail: cellElement.dataset.lockmessage,
                        options: { ok: true }
                    }).then(() => {
                        toot(false);
                    })
                }else{
                    if (that.debug){ console.log(`${that._className} v${that._version} | handleCellEdit() | cell is locked`); }
                    toot(false);
                }
            }
        }else{
            if (that.debug){ console.log(`${that._className} v${that._version} | handleCellEdit() | cellEdit disabled`); }
            toot(false);
        }
    }));
}




/*
    --------------------------------------------------------------------------------
    to-do section
    this is a holding pen of stub functions -- these are placeholders for functions
    with complicated dependencies that we're saving for
    --------------------------------------------------------------------------------
*/




/*
    validation errors stuff
    here's what we're gonna do.

    rowElement.dataset.errors = <jsonData>
    encoded json data is this:
    {
        <column.name>: { <errorNumber>: <errorString>, ...}
    }

    so every col could have potentially multiple validation errors
    we're going to add/modify/delete these on the dataset.errors object here
    *then* call renderCells and let that handle whatever we're doing here
    think we need like a renderCellValidationError() or something with a default
    callback like we have for the other things so it's easily externally overridable

    this also begs the question of rows being born with validation errors
    and that could very well possibly be a legit thing.

    FML. I am SO TIRED of re-implementing this garbage.
    this is what like -- generation 5 or 6 of it? UUUUUUUUHHHHHHHHHHGGGGGGGG

    ok so while we're at it I guess:
    rowElement.dataset.haserrors: <bool>
    cellElement.dataset.haserrors: <bool>

    so we can do visual things at the css layer
*/


/*
    addValidationError(rowElement, cellElement, {errorNumber:<int>, error: <str>, warning:<bool (default:false)>})
*/
addValidationError(rowElement, cellElement, validationError){
    let that = this;
    if (
        (rowElement instanceof Element) &&
        (cellElement instanceof Element) &&
        (validationError instanceof Object) &&
        validationError.hasOwnProperty('errorNumber') &&
        (!(isNaN(parseInt(validationError.errorNumber))))  &&
        validationError.hasOwnProperty('error') &&
        that.isNotNull(validationError.error)
    ){
        // do the thang
        rowElement.dataset.haserrors = true;
        cellElement.dataset.haserrors = true;

        let errrs = {};
        if (rowElement.dataset.errors && that.isNotNull(rowElement.dataset.errors)){
            try {
                errrs = JSON.parse(rowElement.dataset.errors);
            }catch(e){
                if (that.debug){ console.log(`${that._className} v${that._version} | addValidationError() | ignored | failed parse of existing row.dataset.errors?: ${e}`); }
            }
        }

        if (! (errrs[cellElement.dataset.name] instanceof Object)){ errrs[cellElement.dataset.name] = {}; }
        errrs[cellElement.dataset.name][validationError.errorNumber] = validationError;
        rowElement.dataset.errors = JSON.stringify(errrs);

        that.renderCells(rowElement);
    }else{
        throw(`${that._className} v${that._version} | addValidationError() | invalid input`);
    }
}




/*
    removeValidationError(rowElement, cellElement, errorNumber)
*/
removeValidationError(rowElement, cellElement, errorNumber){
    let that = this;
    if (
        (rowElement instanceof Element) &&
        (cellElement instanceof Element) &&
        (!(isNaN(parseInt(errorNumber))))
    ){

        let errrs = {};
        if (rowElement.dataset.errors && that.isNotNull(rowElement.dataset.errors)){
            try {
                errrs = JSON.parse(rowElement.dataset.errors);
            }catch(e){
                if (that.debug){ console.log(`${that._className} v${that._version} | addValidationError() | ignored | failed parse of existing row.dataset.errors?: ${e}`); }
            }
        }
        if ((errrs[cellElement.dataset.name] instanceof Object) && (errrs[cellElement.dataset.name].hasOwnProperty(parseInt(errorNumber)))){
            delete(errrs[cellElement.dataset.name][errorNumber]);
            if (Object.keys(errrs[cellElement.dataset.name]).length == 0){ delete(errrs[cellElement.dataset.name]); }
            rowElement.dataset.errors = JSON.stringify(errrs);
        }
        cellElement.dataset.haserrors = (
            (errrs[cellElement.dataset.name] instanceof Object) &&
            (Object.keys(errrs[cellElement.dataset.name]).length > 0)
        );
        rowElement.dataset.haserrors = (rowElement.querySelectorAll(`span.${that.dataRowColClassName}[data-haserrors="true"]`).length > 0);

    }else{
        throw(`${that._className} v${that._version} | addValidationError() | invalid input`);
    }
}




/*
    clearValidationErrors(rowElement, cellElement)
*/
clearValidationErrors(rowElement, cellElement){
    let that = this;
    if (
        (rowElement instanceof Element) &&
        (cellElement instanceof Element)
    ){
        let errrs = null;
        if (rowElement.dataset.errors && that.isNotNull(rowElement.dataset.errors)){
            try {
                errrs = JSON.parse(rowElement.dataset.errors);
            }catch(e){
                if (that.debug){ console.log(`${that._className} v${that._version} | addValidationError() | ignored | failed parse of existing row.dataset.errors?: ${e}`); }
            }
        }
        if (errrs[cellElement.dataset.name] instanceof Object){
            delete(errrs[cellElement.dataset.name]);
            rowElement.dataset.errors = JSON.stringify(errrs);
            cellElement.dataset.haserrors = false;
            rowElement.dataset.haserrors = (rowElement.querySelectorAll(`span.${that.dataRowColClassName}[data-haserrors="true"]`).length > 0);
        }
    }else{
        throw(`${that._className} v${that._version} | clearValidationErrors() | invalid input`);
    }
}




/*
    clearAllValidationErrors(rowElement)
*/
clearAllValidationErrors(rowElement){
    let that = this;
    if ((rowElement instanceof Element)){
        rowElement.dataset.errors = JSON.stringify({});
    }else{
        throw(`${that._className} v${that._version} | clearAllValidationErrors() | invalid input`);
    }
}




/*
    getCell(rowElement, colName)
*/
getCell(rowElement, colName){
    let col;
    if ((rowElement instanceof Element) && this.isNotNull(colName)){
        col = rowElement.querySelector(`span.${this.dataRowColClassName}[data-name="${colName}"]`);
    }
    if (col instanceof Element){
        return(col);
    }else{
        throw(`${this._className} v${this._version} | getCell() | invalid input`);
    }
}




/*
    lockCell(cellElement, lockBool, lockMessage)
*/
lockCell(cellElement, lockBool, lockMessage){
    if (cellElement instanceof Element){
        cellElement.dataset.locked = (lockBool === true);

        if ((cellElement.dataset.locked == "true") && this.isNotNull(lockMessage)){
            cellElement.dataset.lockmessage = lockMessage;
        }

        if (! (cellElement.dataset.locked == "true")){
            cellElement.dataset.lockmessage = '';
        }
    }else{
        throw(`${this._className} v${this._version} | lockCell() | invalid input`);
    }
}




/*
    iconography
*/
get cancelIcon(){return(encodeURIComponent(`<svg
   id="noiceCancelIcon"
   version="1.1"
   viewBox="0 0 13.640093 13.640094"
   height="13.640094mm"
   width="13.640093mm"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:svg="http://www.w3.org/2000/svg"
   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
   xmlns:cc="http://creativecommons.org/ns#"
   xmlns:dc="http://purl.org/dc/elements/1.1/">
  <defs
     id="defs2">
    <clipPath
       clipPathUnits="userSpaceOnUse"
       id="clipPath4548">
      <path
         id="lpe_path-effect4552"
         style="fill:#fcbf18;fill-opacity:1;stroke:none;stroke-width:0.444235;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1;paint-order:markers stroke fill"
         class="powerclip"
         d="m 173.261,112.49401 h 22.08005 v 22.08004 H 173.261 Z m 10.53514,6.40981 c -0.45317,0 -0.81803,0.36487 -0.81803,0.81804 v 2.48925 h -2.48926 c -0.45317,0 -0.81803,0.36487 -0.81803,0.81804 v 1.00976 c 0,0.45317 0.36486,0.81803 0.81803,0.81803 h 2.48926 v 2.48926 c 0,0.45317 0.36486,0.81803 0.81803,0.81803 h 1.01028 c 0.45317,0 0.81752,-0.36486 0.81752,-0.81803 v -2.48926 h 2.48977 c 0.45317,0 0.81752,-0.36486 0.81752,-0.81803 v -1.00976 c 0,-0.45317 -0.36435,-0.81804 -0.81752,-0.81804 h -2.48977 v -2.48925 c 0,-0.45317 -0.36435,-0.81804 -0.81752,-0.81804 z" />
    </clipPath>
  </defs>
  <metadata
     id="metadata5">
    <rdf:RDF>
      <cc:Work
         rdf:about="">
        <dc:format>image/svg+xml</dc:format>
        <dc:type
           rdf:resource="http://purl.org/dc/dcmitype/StillImage" />
      </cc:Work>
    </rdf:RDF>
  </metadata>
  <g
     transform="translate(-169.12783,-114.88835)"
     id="layer1">
    <path
       id="path862"
       transform="rotate(45,182.32828,112.5381)"
       clip-path="url(#clipPath4548)"
       d="m 190.20875,123.53403 a 5.9077291,5.9077291 0 0 1 -5.90772,5.90773 5.9077291,5.9077291 0 0 1 -5.90773,-5.90773 5.9077291,5.9077291 0 0 1 5.90773,-5.90773 5.9077291,5.9077291 0 0 1 5.90772,5.90773 z"
       style="fill:#f0f0f0;fill-opacity:0.5;stroke:none;stroke-width:0.264583;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1;paint-order:normal" />
  </g>
</svg>`))}




/*
    fitToParentHeight()
*/
fitToParentHeight(){
    let that = this;
    requestAnimationFrame(() => {
        const bfr = 15;
        const pa = that.parentElement.getBoundingClientRect();
        const me = that.getBoundingClientRect();
        const lh = that._elements.tableListContainer.getBoundingClientRect();
        that.listcontainer_height = `${pa.height - ((me.height - lh.height) + bfr)}px`;

    });
}




/*
    setFitParent(newValue, oldValue, selfReference)
    basically we want to get the dimensions of the parent container
    then set listcontainer_height to a value that is something like:
        parent.height - label.height - header.height - footer.height

    it occurs this may be tricky. If it can be made to work, the
    next step is to factor out the height setting thing
    into something like wcBalloonDialog.setPosition()
    then setup a ResizeObserver on ourselves to call it

    in here we'd just be setting up or tearing down the
    ResizeObserver listener really.

    but first things first. Can this even work?
*/
setFitParent(newValue, oldValue, selfReference){
    let that = this;
    if ((newValue === true) && (! (that.resizeObserver instanceof ResizeObserver))){
        that.resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            if (entry.contentBoxSize) { that.fitToParentHeight(); }
          }
        });
        that.resizeObserver.observe(that.parentElement);
    }else if ((!(newValue === true)) && (that.resizeObserver instanceof ResizeObserver)){
        that.resizeObserver.disconnect(that.parentElement);
        that.resizeObserver = null;
    }
}




/*
    openSearchUI()
    if you want a more complicated UI, override this function
    if you just want to replace the search algorithm, override handleSearch()
*/
openSearchUI(){
    let that = this;

    if (that._elements.btnSearch.textContent == "clear search"){
        that.handleSearch(null, that);
        that._elements.btnSearch.disabled = false;
        that.closePanel();
    }else{
        that._elements.btnSearch.disabled = true;
        let div = document.createElement('div');

        div.className = "searchBox";
        let searchField = new wcFormElement({
            label: 'Search',
            label_position: 'left',
            type: 'text',
            capture_value_on: 'focusoutOrReturn',
            captureValueCallback: (val, slf) => {
                that.handleSearch(val, slf);
                that._elements.btnSearch.disabled = false;
                that.closePanel();
            }
        });
        div.appendChild(searchField);

        let btnContainer = document.createElement('div');
        btnContainer.className = "btnContainer";
        div.appendChild(btnContainer);

        let btnClose = document.createElement('button');
        btnClose.textContent = "cancel";
        btnClose.addEventListener('click', (evt) => {
            that._elements.btnSearch.disabled = false;
            that.closePanel();
        });
        btnContainer.appendChild(btnClose);

        const searchDialog = new wcBasic({
            content: div,
            styleSheet: `
                wc-form-element {
                    font-size: var(--wc-table-search-element-font-size, 1.25rem);
                }
                .btnContainer {
                    display: flex;
                    flex-direction: row-reverse;
                    margin: .5em;
                }
                .btnContainer button:active {
                    background-color: var(--wc-table-footer-button-active-background-color, rgb(240, 240, 240));
                    color: var(--wc-table-footer-button-active-color, rgb(22, 23, 25));
                }
                .btnContainer button:disabled {
                   border-color: rgba(240, 240, 240, .3);
                   color: rgba(240, 240, 240, .3);
                }
                .btnContainer button {
                    background-color: var(--wc-table-search-cancel-button-background-color, rgb(81, 91, 94));
                    color: var(--wc-table-footer-button-color, rgb(240, 240, 240));
                    border: .128em solid var(--wc-table-footer-button-color, rgb(240, 240, 240));
                    border-radius: var(--wc-table-footer-button-border-radius, 1em);
                    font-size: var(--wc-table-footer-button-size, .8em);;
                    height: min-content;
                    margin-right: .5em;
                }
            `
        });
        that.openPanel(searchDialog);
        searchField.formElement.focus();
    }
}




/*
    handleSearch(searchStr, selfReference)
    basic search algorithm, does a blind non-case-sensitive rgx match on
    every column, and hides everything that doesn't match
*/
handleSearch(searchStr, selfReference){
    let that = this;
    if (that.isNull(searchStr)){
        // if search string is null, show everything hidden by search
        that.rowElements.filter((el) =>{return(
            (el.dataset.hidden == 'true') &&
            (el.dataset.hiddenby == 'search')
        )}).forEach((el) => {
            el.dataset.hidden = "false";
            el.dataset.hiddenby = '';
        });
        that._elements.btnSearch.textContent = "search";
        that._elements.btnSearch.dataset.inv = false;
    }else{
        // gitrdun
        let rx = new RegExp(searchStr, 'i');
        that.rowElements.filter((el) =>{return(
            Array.from(el.querySelectorAll(`.listCol`)).filter((colEl) => {return(
                rx.test( (that.isNull(colEl.textContent) && (colEl.firstChild instanceof Element) && that.isNotNull(colEl.firstChild.textContent))?colEl.firstChild.textContent:colEl.textContent )
            )}).length == 0
        )}).forEach((el) => {
            new Promise((_t) => {_t((el.dataset.selected == "true")?that.handleRowSelect(el, false, true):true)}).then(() => {
                el.dataset.hidden = "true";
                el.dataset.hiddenby = "search"
            });
        });
        that._elements.btnSearch.textContent = "clear search";
        that._elements.btnSearch.dataset.inv = true;
    }
}

get searchActive(){return(
    this.initialized && (this._elements.btnSearch.dataset.inv) && (this._elements.btnSearch.dataset.inv == "true")
)}



}
const _classRegistration = wcTable.registerElement('wc-table');
export { _classRegistration as wcTable };
