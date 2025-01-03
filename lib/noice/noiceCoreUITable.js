/*
    noiceCoreUITable.js
    2/6/24 - Amy Hicox <amy@hicox.com>

    ## attributes

    * columns(array-of-objects>)
      gets or sets column definitions in this object format (array of objects)
        [ {
              name: <str [required]>,
              order: <int [optional, inferred from array index if not specified]>,
              type: <str [optional: default char -- note we're using noiceCoreUIFormView type alises]>,
              width: <int [optional, if you specify it, it's a CSS fr integer, if you don't it's "1fr"]>,
              sortFunction: (a,b)=>{...},
              editable: <bool>,
              valueChangeCallback: async (newVal, oldVal, self) => { ... }
              disableCellEdit: <bool default:false>
         }, ... ]

    * numRows
      read-only -- returns the number of data rows in the table

    * rows(<array-of-objects>)
      gets or sets rows in this object format (array of objects)
        [{ <col.name>:<col.value>, ...}, .. ]
      this data is stored solely in the DOM. Attributes not corresponding to an entry in 'columns'
      are echoed into the row's dataset. Getting this attribute, reconstructs the input objects
      from the DOM. Setting this attribute itterates calls to addRow();

    * data(<array-of-arrays>)
      accepts a standard 2D array-of-arrays (a spreadsheet analog if you will), this will interpret
      the first row as the header, interpolating each cell as a value for 'columns' attribute with
      default values (so all strings). getting this attribute exports the entire table including
      header into the array-of-arrays

    * maxListHeight(<CSS unit string>)
      sets the CSS max-height attribute on the tableListContainer (if you want scrolling, etc you'll need to set this)
      accepts any CSS-legal value for max-height

    * selectMode(<enum(none|single|multiple) defailt:"none">)
      sets the row select mode. self explanitory

    * allowColumnSort(<bool>)
      if set true column header cells are clickable [no-sort, ascending, descending]

    * rowSelectCallback(<async function(selectBool, listRowElement, selfReference)>)
      if specified await this callback before changing the select state of a row,
      rejecting the promise rejects the select state change

    * modifyRowCallback(<async function(rowElement, data)>)
      if specified, await output of this callback before updating the row with the specified data
      a rejected promise will abort the change. THe object returned from the resolved promise will
      replace <data> (so you can externally mutate the change if you need)

    * syncRowsBatchLimit (<int: default 250>)
      inside syncRows, only process this many rows within a single animationFrame to avoid smufring the UI thread

    * renderRowsProgressCallback(partial, complete, selfReference)
      if defined, sends progress updates from rows setter when rendering giagantor lists

    * allowCellEdit (bool: default false)
      if set true, allow cell edits unless the corresponding column has disableCellEdit: true

    * editCellCallback(<async function(rowElement, cellElement, selfReference)>)
      the user requests to edit a cell, whatever you return will get written to the column
      identified by col.name on the row represented by rowElement (the actual DOM element)
      could use a popup dialog, or try to do a fancy inline edit, but that's all external

    * rowSetupCallback(rowElement, selfReference)
      if specified, called on addRow() after rowElement is generated and added to DOM

    ## functions

    * addColumn({columnDef}, propagateBool)
      add a column to the DOM. This should get called from the columns attribute
      and yeah, it'll have to modify every existing row, if propagateBool is set true,
      call syncRows() which will add

    * removeColumn(col.name, propagateBool)
      remove the column with the specified name., if propagateBool is set true,
      call syncRows() which will remove

    * syncRows()
      descend all rows, and make sure each has the correct columns defined
      note: for truly huge tables we may need to do this on performance tuned batch sizes
      at animationFrame boundaries with a progressCallback. leme think on that this
      simply iterates all of the rowElements and calls renderCells on each of them

    * addRow({rowData})
      append a row containing the specified rowData to the table (the sequence of calls to this function
      will automatically set default sort order, so if that matters to you sort your array before sending
      to the 'rows' attribute).

    * getRowElement({rowData}, index, renderCellsBool)
      same as addRow() except it just returns the DOMElement with the specified rownum in the dataset
      called from addRow()
      DESIGN DECISION: this adds a null row div with all the data on the dataset then calls renderCells()
      on it -- its entirely possible we got the

    * renderCells(rowElement)
      render the cells according to the defined columns. If we find pre-existing cells that no longer have
      a mapped column, we remove them, if we find columns that are mapped but don't yet exist on the row
      we spawn them.

    * applyRowCSS(rowElement)
      just a centralized place for setting up the hard-coded CSS that makes it behave like a table
      called from addRow(0)

    * removeRow(rowIndex)
      deletes the row from the table at the specified index (index is 1-indexed, as header is row 0)

    * modifyRow(rowIndex, {data})
      perform data-modification on a row. If we have modifyRowCallback await it, yadda yadda

    * handleColumnSort(headerColumnElement)
      toggles the column header through it's sort states, re-sorting the table.

    * handleRowSelect(listRowElement, selectBool, recurseBypassBool)
      internally handles select/deselect on a row -- enforces the selectMode, awaits rowSelectCallback()
      if specified

    * clear()
      remove all data rows from the table

    * reset()
      [coded] remove all columns and rows from the table

    * getRow(index)
      return the data object and the corresponding DOMElement of the row at the specified index
      index is 1-indexed (header is row 0 and this function won't get it)

    * getSelected()
      return an array of all selected rows (output of getRow for all selected)
      obviously if selectMode: single, there's just the one and if it's none, nothing

    * deselectAll(forceBool)
      deselect all selected rows, if forceBool set true, bypass the rowSelectCallback()
      otherwise await them and abort if any of them reject

    * selectAll(forceBool)
      select all rows, same as deselectAll, if you set forceBool true, we'll ignore the selectCallback

    * handleCellEdit(rowElement, cellElement)
      if allowCellEdit: true, and editCellCallback is specified, call it and await output
      if resolved promise, send returned value to modifyRow() and let it call the modifyRowCallback() if specified

    ## CSS
    only layout-necessary CSS is hard coded. If you want it to look pretty
    you'll need some external CSS. This kinda looks nice if you ask me but hey
    whatever ya want:

        .noiceCoreUITable .tableContainer {
           box-shadow: 2px 2px 2px rgba(20, 22, 23, .3) inset;
           background: radial-gradient(ellipse at center, rgb(150, 167, 173), rgba(150, 167, 173, .6));
           color: rgb(24, 35, 38);
           padding: .25em;
           border-radius: .5em;
        }
        .noiceCoreUITable .hdrRow,.noiceCoreUITable .listRow {
           margin-bottom: .128em;
        }
        .noiceCoreUITable .hdrRow .hdrCol {
           border: 1px solid rgb(36, 36, 36);

           padding: .25em .128em .128em .25em;
           background-color: rgba(36, 36, 36,.1);
           border-radius: .25em;
        }
        .noiceCoreUITable .hdrRow .hdrCol[data-sort="descending"]:before {
           content: '\25BC';
           opacity: .5;
           font-size: .8em;
        }
        .noiceCoreUITable .hdrRow .hdrCol[data-sort="ascending"]:before {
           content: '\25B2';
           opacity: .5;
           font-size: .8em;
        }
        .noiceCoreUITable .hdrRow .hdrCol, .noiceCoreUITable .listRow .listCol {
           margin-right: .128em;
           padding: 0 .128em 0 .25em;
        }
        .noiceCoreUITable .listRow span.listCol {
           font-size: .8em;
        }
        .noiceCoreUITable .listRow span.listCol[data-locked="true"] {
           opacity: .4;
           text-decoration: line-through;
           background-color: rgba(24, 35, 38, .2);
        }
        .noiceCoreUITable .listRow[data-selected="true"] {
           background-color: rgba(240, 240, 240,.8);
           filter: invert(.85);
        }
        .noiceCoreUITable .footerMessage {
           font-size: .8em;
           font-family: Comfortaa;
           padding-right: .25em;
        }
        .noiceCoreUITable .label{
           font-family: Comfortaa;
           padding-left: .25em;
           font-weight: bold;
        }
        .noiceCoreUITable .footer .buttonContainer .btnPrefs[data-open="true"]{
           opacity: .5;
        }
        .noiceCoreUITable .footer .buttonContainer .btnPrefs {
           background: transparent;
           border-color: transparent;
           color: rgb(240, 240, 240);
           font-size: 1em;
        }
        .noiceCoreUITable .footer .buttonContainer button.txtBtn {
            background-color: transparent;
            color: rgb(240, 240, 240);
            border: .128em solid rgb(240, 240, 240);
            border-radius: 1em;
            font-size: .55em;
            height: min-content;
            margin-right: .5em;
        }
        .noiceCoreUITable .footer .buttonContainer button.txtBtn:active {
            background-color: rgb(240, 240, 240);
            color: rgb(22, 23, 25);
        }
        .noiceCoreUITable .footer .buttonContainer button.txtBtn:disabled {
           opacity: .2;
        }
        .noiceCoreUITable .tablePrefEditor, .noiceCoreUITable .userPrompt, .noiceCoreUITable .exportUI {
           background-color: rgba(24, 35, 38, .66);
           border-radius: .5em;
        }
        .noiceCoreUITable .defaultPrefUIEditor fieldset {
           color: rgb(240,240,240);
           background-color: rgba(24, 35, 38, .66);
           border-radius: 1em
        }
        .noiceCoreUITable .defaultPrefUIEditor fieldset legend {
           font-family: Comfortaa;
           font-weight: bolder;
           font-size: 1.5em;
        }
        .noiceCoreUITable .defaultPrefUIEditor button.btnClose {
           margin-right: 1.5em;
           margin-top: .25em;
           font-family: Comfortaa;
           background: url('./gfx/cancel-icon-light.svg');
           background-repeat: no-repeat;
           background-size: contain;
           padding-left: 1.5em;
           color: rgb(240, 240, 240);
           border: none;
        }
        .noiceCoreUITable .userPrompt {
           padding: 1em;
           border: .128em solid rgba(240, 240, 240, .8);
        }
        .noiceCoreUITable .userPrompt h2.prompt, .noiceCoreUITable .exportUI h2.prompt {
           margin: 0;
           font-family: Comfortaa;
        }
        .noiceCoreUITable .userPrompt div.buttonContainer, .noiceCoreUITable .exportUI div.buttonContainer {
           text-align: center;
        }
        .noiceCoreUITable .userPrompt div.buttonContainer button, .noiceCoreUITable .exportUI div.buttonContainer button {
           font-family: Comfortaa;
           font-size: .8em;
           padding: .25em .5em .25em .5em;
           margin: .8em;
           border-radius: .5em;
           background-color: rgba(240, 240, 240 .8);
           border: .128em solid rgb(20, 22, 23);
           color: rgb(20, 22, 23);
        }
        .noiceCoreUITable .exportUI {
           border: .128em solid rgb(240, 240, 240);
           padding: 1em;
           display: grid;
        }
        .noiceCoreUITable .exportUI .detail .chartBknd {
           fill: rgb(24, 35, 38);
           stroke: rgba(240, 240, 240, .8);
           stroke-width: 2px;
        }
        .noiceCoreUITable .exportUI .detail {
           display: grid;
           grid-template-columns: 4em auto;
           align-items: center;
           margin: 1em;
        }
        .noiceCoreUITable .exportUI .detail .deets {
           margin-left: .5em;
           display: grid;
        }
        .noiceCoreUITable .exportUI .detail .deets .explainer {
           font-style: italic;
           font-size: .8em;
           margin-bottom: .25em
        }
        .noiceCoreUITable .exportUI .detail .deets label {
           font-family: Comfortaa;
        }
        .noiceCoreUITable .exportUI .detail .deets label.disabled {
          opacity: .25;
        }
*/

import { noiceCoreUIElement, noiceCoreUIOverlay } from './noiceCoreUI.js';
import { noiceObjectCore } from './noiceCore.js';
import { noicePieChart } from './noicePieChart.js';

class noiceCoreUITable extends noiceCoreUIElement {




/*
    constructor
*/
constructor(args, defaults, callback){
    super(args, noiceObjectCore.mergeClassDefaults({
        _version:                     1,
        _className:                   'noiceCoreUITable',
        _columns:                     [],
        _rows:                        [],
        _data:                        [],
        _selectMode:                  'none',
        _maxListHeight:               null,
        _listHeight:                  null,
        _showFooter:                  true,
        _showBtnPrefs:                false,
        _showBtnSelectAll:            false,
        _showBtnSelectNone:           false,
        _showBtnExport:               false,
        _showFooterMessage:           false,
        _showRowNudgeButtons:         false,
        _defaultFooterMessage:        null,
        _customButtons:               [],
        _modifyAll:                   'auto', // values: 'auto' or 'prompt'

        rowSelectCallback:            null,
        renderRowsProgressCallback:   null,
        headerColClassName:           'hdrCol',
        headerRowClassName:           'hdrRow',
        dataRowClassName:             'listRow',
        dataRowColClassName:          'listCol',
        defaultCellEditorInputClass:  'cellEditor',
        defaultPrefUIClass:           'tablePrefEditor',
        defaultPrefUIEditorClass:     'defaultPrefUIEditor',
        userPromptClass:              'userPrompt',
        exportUIClass:                'exportUI',
        allowColumnSort:              false,
        _allowCellEdit:               false,
        syncRowsBatchLimit:           250,
        exportFileName:               null,
        debug:                        false
    },defaults),callback);

    this.setup();

} // end constructor




/*
    html getter
*/
get html(){
    return(`
        <div class="label" data-templatename="label" data-templateattribute="true"></div>
        <div data-templatename="uiContainer" data-templateattribute="true" style="position: relative; width: 100%;">
            <div class="tableContainer" data-templatename="tableContainer">
                <div class="tableHeader" data-templatename="tableHeader" data-templateattribute="true">
                    <div data-templatename="headerRow" data-templateattribute="true"></div>
                </div>
                <div class="tableListContainer" data-templatename="tableListContainer" data-templateattribute="true"></div>
            </div>
        </div>
        <div class="footer" data-templatename="footer" data-templateattribute="true" style="
            grid-template-columns: auto auto;
            align-items: center;
        ">
            <div class="buttonContainer" data-templatename="footerButtonContainer" style="text-align: left;">
                <button class="btnPrefs txtBtn" data-templatename="btnPrefs" data-templateattribute="true">columns</button>
                <button class="btnSelectAll txtBtn" data-templatename="btnSelectAll" data-templateattribute="true" disabled>select all</button>
                <button class="btnSelectNone txtBtn" data-templatename="btnSelectNone" data-templateattribute="true" disabled>select none</button>
                <button class="btnExport txtBtn" data-templatename="btnExport" data-templateattribute="true" disabled>export</button>
                <button class="btnNudgeUp txtBtn" data-templatename="btnNudgeUp" data-templateattribute="true" disabled>&#9650;</button>
                <button class="btnNudgeDown txtBtn" data-templatename="btnNudgeDown" data-templateattribute="true" disabled>&#9660;</button>
            </div>
            <div class="footerMessage" data-templatename="footerMessage" data-templateattribute="true" style="overflow: auto;"></div>
        </div>
    `)
}




/*
    customButtons
    [{name: <str>, callback: function(tableRef, btnRef)}, ...]
*/
get customButtons(){ return(this._customButtons); }
set customButtons(v){
    let that = this;
    if (v instanceof Array){

        // remove any existing custom buttons
        that._DOMElements.footerButtonContainer.querySelectorAll('button.customButton').forEach((el) => { el.remove(); });

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
            return(btn);
        }).forEach((el) => {
            that._DOMElements.footerButtonContainer.appendChild(el);
        });

        that._customButtons = v;
    }
}




/*
    setup()
*/
setup(){

    // setting these hardcoded in the html template doesn't work but setting it here does. well ok then!
    this._DOMElements.tableListContainer.style.display = "grid";
    this._DOMElements.tableListContainer.style.scrollbarWidth = "thin";
    this._DOMElements.tableListContainer.style.scrollbarGutter = "stable";
    this._DOMElements.tableListContainer.style.overflowY = "auto";
    this._DOMElements.tableListContainer.style.minWidth = "fit-content";
    this._DOMElements.tableListContainer.style.alignContent = "baseline";
    this._DOMElements.headerRow.style.scrollbarWidth = "thin";
    this._DOMElements.headerRow.style.scrollbarGutter = "stable";
    this._DOMElements.tableContainer.style.scrollbarWidth = "thin";

    // yeah ok ... templates are for security bad mkay?
    this._DOMElements.tableHeader.className = this.headerRowClassName;

    // init the dom-linked things that need initting
    [
        'showFooter', 'showBtnPrefs', 'showBtnSelectAll',
        'showBtnSelectNone','showBtnExport', 'showFooterMessage',
        'showRowNudgeButtons'
    ].forEach((a)=>{ this[a] = this[a]; }, this);

    // listeners for the buttons
    let that = this;
    that._DOMElements.btnPrefs.addEventListener('click', (evt) => { that.openPrefEditor(evt); that._DOMElements.btnPrefs.blur(); });
    that._DOMElements.btnSelectAll.addEventListener('click', (evt) => { that.handleSelectAll(evt); that._DOMElements.btnSelectAll.blur(); });
    that._DOMElements.btnSelectNone.addEventListener('click', (evt) => { that.handleSelectNone(evt); that._DOMElements.btnSelectNone.blur(); });
    that._DOMElements.btnExport.addEventListener('click', (evt) => { that.openExportUI(evt); that._DOMElements.btnExport.blur(); });
    that._DOMElements.btnNudgeUp.addEventListener('click', (evt) => { that.nudgeSelection('up', 1); that._DOMElements.btnNudgeUp.blur(); });
    that._DOMElements.btnNudgeDown.addEventListener('click', (evt) => { that.nudgeSelection('down', 1); that._DOMElements.btnNudgeDown.blur(); });

    // pre-spawn the table preferences editor frame thingy
    that.prefEditorFrameThingy = new noiceCoreUIOverlay({
        getHTMLCallback: () => { return(`<div class="uiContainer" data-templatename="uiContainer" data-templateattribute="true" style="width:100%; height:100%;display:grid;align-content:center;justify-content:center;"><div>`); },
        fullscreen: true,
        zIndex: 2,
        classList: [ that.defaultPrefUIClass ]
    });
    that.prefEditorFrameThingy.DOMElement.style.overflow = "auto";

}




/*
    addColumn(col, propagateBool)
    add the column, syncRows if propagateBool is true
*/
addColumn(col, propagateBool){
    let that = this;
    if (
        (col instanceof Object) &&
        col.hasOwnProperty('name') &&
        that.isNotNull(col.name) &&
        (that.columns.filter((a)=>{return((a instanceof Object) && (a.hasOwnProperty('name')) && (a.name == col.name))}).length == 0)
    ){
        // set default column order
        if (!(col.hasOwnProperty('order') && (! isNaN(parseInt(col.order))))){ col.order = that._columns.length + 1; }

        let span = that.getHeaderCell(col);
        col.visible = col.hasOwnProperty('visible')?(col.visible === true):true;
        that._columns.push(col);
        if (col.visible === true){
            that._DOMElements.headerRow.appendChild(span);
            that.applyRowCSS(that._DOMElements.headerRow);
            if (propagateBool === true){ that.syncRows(); }
        }else{
            col._el = span;
        }

    }else{
        throw(`${that._className} v${that._version} | addColumn() | invalid input`);
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
        let el = that._DOMElements.headerRow.querySelector(`span.${that.headerColClassName}[data-name="${colName}"]`);
        if (el instanceof Element){ el.remove(); }

        // remove it from the internal column list
        this._columns = this._columns.filter((a) => {return(!((a instanceof Object) && (a.hasOwnProperty('name')) && (a.name == colName)))});

        // sync the rows if we have the flag
        that.applyRowCSS(that._DOMElements.headerRow);
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
            let el = that._DOMElements.headerRow.querySelector(`span.${that.headerColClassName}[data-name="${colName}"]`);
            if (el instanceof Element){
                colObject._el = el;
                el.remove();
            }

        }else{

            // with an equally cheeky disposition, add it back
            let ord = that.columns.sort((a,b)=>{return(a.order - b.order)}).map(a=>{return(a.name)});
            that._DOMElements.headerRow.appendChild((colObject._el instanceof Element)?colObject._el:that.getHeaderCell(colObject));
            Array.from(that._DOMElements.headerRow.querySelectorAll(`span.${that.headerColClassName}`)).sort((a,b) => {return(
                ord.indexOf(a.dataset.name) - ord.indexOf(b.dataset.name)
            )}).forEach((el) => {that._DOMElements.headerRow.appendChild(el); });
        }

        // remove it from the internal column list
        //this._columns = this._columns.filter((a) => {return(!((a instanceof Object) && (a.hasOwnProperty('name')) && (a.name == colName)))});
        that.columns.filter((a)=>{return((a instanceof Object) && (a.hasOwnProperty('name')) && (a.name == colName))})[0].visible = (visibilityBool === true);

        // sync the rows if we have the flag
        that.applyRowCSS(that._DOMElements.headerRow);
        that.syncRows();

    }else{
        throw(`${that._className} v${that._version} | toggleColumnVisibility(${colName}, ${visibilityBool == true}) | invalid input`);
    }
}




/*
    columns attribute
*/
get columns(){ return(this._columns); }
set columns(v){
    let that = this;
    if (
        (v instanceof Array) &&
        (v.length == v.filter((a)=>{return(a instanceof Object) && a.hasOwnProperty('name') && that.isNotNull(a.name)}).length)
    ){

        // this is *the* set of columns meaning we blow away whatever was there
        that._columns = [];
        that.headerRow = '';

        // aight! holonnaurbutts ... note addCol will push this._columns for us
        v.forEach((col) => {
            try {
                that.addColumn(col, false);
            }catch(e){
                throw(`${that._className} v${that._version} | columns attribute setter | addColumn() threw unexpectedly for ${col.name} | ${e}`);
            }
        });

        // setup the css
        that.applyRowCSS(that._DOMElements.headerRow);

        // the cols are added, sync the rows
        that.syncRows();

    }else{
        throw(`${that._className} v${that._version} | columns attribute setter | invalid input format`);
    }
}




/*
    numRows attribute
    return the number of data rows in the table
*/
get numRows(){
    return(this._DOMElements.tableListContainer.querySelectorAll(`div.${this.dataRowClassName}`).length);
}




/*
    numSelectedRows attribute
    return the number of data rows in the table
*/
get numSelectedRows(){
    return(this._DOMElements.tableListContainer.querySelectorAll(`div.${this.dataRowClassName}[data-selected="true"]`).length);
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
        div.dataset.rowdata = JSON.stringify(row);
        that.applyRowCSS(div);
        div.addEventListener('click', (evt) => { that.handleRowSelect(div); });
        if (renderCellsBool === true){ that.renderCells(div); }
        return(div);
    }else{
        throw(`${that._className} v${that._version} | getRowElement() | invalid input`);
    }
}




/*
    addRow(rowData, renderCellsBool)
*/
addRow(row, renderCellsBool){
    let that = this;
    let newRow = this.getRowElement(row, (this.numRows + 1), (this.isNull(renderCellsBool) || (renderCellsBool === true)));
    this._DOMElements.tableListContainer.appendChild(newRow);
    if (that.rowSetupCallback instanceof Function){ that.rowSetupCallback(newRow, that); }
    this.showFooterMessage = this.showFooterMessage;
}




/*
    removeRow(idx)
    delete the row at the specified index. This is 1-indexed (so first row is 1)
*/
removeRow(idx){
    let el = this._DOMElements.tableListContainer.querySelector(`.${this.dataRowClassName}:nth-child(${idx})`);
    if (el instanceof Element){
        el.remove();
        this.showFooterMessage = this.showFooterMessage;
        return(el);
    }else{
        throw(`${this._className} v${this._version} | removeRow(${idx}) | invalid input`);
    }
}




/*
    getRow(idx)
    return this dataStructure for the given row:
    {data: {<fieldName>:<fieldValue>}, DOMElement: <RowElement>}
*/
getRow(idx){
    let el = this._DOMElements.tableListContainer.querySelector(`.${this.dataRowClassName}:nth-child(${idx})`);
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
            if (that.debug){ console.log(`${that._className} v${that._version} | mofifyRow(${idx}, ${JSON.stringify(data)}) | getRow() threw unexpectedly: ${error}`); }
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
                el.textContent = data.hasOwnProperty(col.name)?data[col.name]:'';
                // insures we're in the right order
                rowElement.appendChild(el);

            }else{
                let span = document.createElement('span');
                span.className = that.dataRowColClassName;
                span.dataset.name = col.name;
                span.dataset.locked = false;
                if (col.hasOwnProperty('fieldId')){ span.dataset.fieldid = col.fieldId; }
                span.textContent = data.hasOwnProperty(col.name)?data[col.name]:'';
                span.style.overflow = "hidden";
                span.addEventListener('dblclick', (evt) => {
                    if (
                        (! (rowElement.dataset.locked == 'true')) &&
                        (that.allowCellEdit == true)
                    ){
                        rowElement.dataset.locked = true;
                        that.handleCellEdit(rowElement, span).then(() => { rowElement.dataset.locked = false; }).catch((error) => {
                            rowElement.dataset.locked = false;
                            throw(`${that._className} v${that._version} | cell edit click handler | handleCellEdit() threw unexpectedly: ${error}`);
                        });
                    }
                })
                rowElement.appendChild(span);
            }
        });
        that.applyRowCSS(rowElement);
        // this is an infinite loop sucka!
        //if (that.rowSetupCallback instanceof Function){ that.rowSetupCallback(rowElement, that); }

    }else{
        throw(`${this._className} v${this._version} | renderCells() | invalid input`);
    }
}




/*
    applyRowCSS(rowElement)
    calculate grid-template-columns and apply it to the specified row
    this is the "use CSS to make it look like an old school table" part
*/
applyRowCSS(el){
    let that = this;
    if (el instanceof Element){
        el.style.display = 'grid';
        el.style.cursor = 'default';
        el.style.userSelect = 'none';
        el.style.width = '100%';
        el.style.height = 'max-content';
        el.style.gridTemplateColumns = that.columns.filter((a)=>{return(a.visible === true)}).sort((a,b) => {return(a.order - b.order)}).map((col) => {
            let width = ((col instanceof Object) && col.hasOwnProperty('width') && that.isNotNull(col.width))?col.width:1;
            return(
                `${width}${/^\d+$/.test(width)?'fr':''}`
            )
        }).join(" ");
    }
}




/*
    syncRows(progressCallback)
    update every single row by calling renderCells on it
    (which in turn calls applyRowCSS)

    this executes on animationFrames, we batch rows into
    gropus of this.syncRowsBatchLimit

    as such is is async. We will call progressCallback(partial, complete, selfReference)
    if specified.
*/
syncRows(progressCallback){
    let that = this;
    return(new Promise((toot, boot) => {
        let chunks = [];
        let queue = Array.from(this._DOMElements.tableListContainer.querySelectorAll(`div.${that.dataRowClassName}`));
        let complete = queue.length;
        while (queue.length > 0){ chunks.push(queue.splice(0, this.syncRowsBatchLimit)); }
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
    rows attribute
    get and set rows as an array of objects
    note setter replaces all existing rows
    and yeah we're gonna do it in batches on animationFrames so rendering
    gigantor tables doesn't smurf the UI thread
*/
get rows(){
    return(Array.from(this._DOMElements.tableListContainer.querySelectorAll(`div.${this.dataRowClassName}`)).map((el) => {
        return(JSON.parse(el.dataset.rowdata))
    }));
}
set rows(v){
    let that = this;
    if (
        (v instanceof Array) &&
        (v.length == v.filter((a)=>{return(a instanceof Object)}).length)
    ){
        that.tableListContainer = '';
        let chunks = [];
        let complete = v.length;
        let doneCount = 0;
        while (v.length > 0){ chunks.push(v.splice(0, this.syncRowsBatchLimit)); }
        function recursor(idx){
            if (idx == chunks.length){
                return(true);
            }else{
                chunks[idx].forEach((row) => {
                    that.addRow(row, true);
                    doneCount ++;
                });
                requestAnimationFrame(() => {
                    if (that.renderRowsProgressCallback instanceof Function){
                        try {
                            that.renderRowsProgressCallback(doneCount, complete, that);
                        }catch(e){
                            if (that.debug){ console.log(`${that._className} v${that._version} | rows attribute setter | ignored | renderRowsProgressCallback threw unexpectedly: ${e}`); }
                        }
                    }
                    recursor((idx + 1));
                });
            }
        }
        recursor(0);
    }else{
        throw(`${that._className} v${that._version} | rows attribute setter | invalid input format`);
    }
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
    let out = [ Array.from(that._DOMElements.headerRow.querySelectorAll(`span.${that.headerColClassName}`)).map((el)=>{return(el.textContent)}) ];
    return(out.concat(Array.from(that._DOMElements.tableListContainer.querySelectorAll(`div.${that.dataRowClassName}`)).map((el) => {return(
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
    return(this._DOMElements.tableListContainer.style.maxHeight);
}
set maxListHeight(v){
    this._DOMElements.tableListContainer.style.height = null;
    this._DOMElements.tableListContainer.style.maxHeight = v;
}
get listHeight(){
    return(this._DOMElements.tableListContainer.style.height);
}
set listHeight(v){
    this._DOMElements.tableListContainer.style.maxHeight = null;
    this._DOMElements.tableListContainer.style.height = v;
}


/*
    selectMode attribute
    enum: 'none', 'single', 'multiple'
*/
get selectMode(){ return(this._selectMode); }
set selectMode(v){
    if (this.isNotNull(v) && (['none', 'single', 'multiple'].indexOf(v) >= 0)){
        this._selectMode = v;
    }else{
        throw(`${that._className} v${that._version} | selectMode attribute setter (${v}) | invalid input`);
    }
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
            if (['single', 'multiple'].indexOf(that.selectMode) >= 0){
                new Promise((_t,_b) => {
                    if ((that.selectMode == 'single') && (! (recurseBypassBool == true))){
                        // enforce single select (await all other selected deselect)
                        Promise.all(Array.from(that._DOMElements.tableListContainer.querySelectorAll(`div.${that.dataRowClassName}[data-selected="true"]:not([data-rownum="${listRowEl.dataset.rownum}"])`)).map((el) => {
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
                            that.showFooterMessage = that.showFooterMessage;
                            toot(true);
                        }).catch((error) => {
                            if (that.debug){ console.log(`${that._className} v${that._version} | handleRowSelect(${listRowEl.dataset.rownum}, ${newSelectState}) | rowSelectCallback() threw unexpectedly: ${error}`); }
                            boot(error);
                        });
                    }else{
                        listRowEl.dataset.selected = newSelectState;
                        that.showFooterMessage = that.showFooterMessage;
                        toot(true);
                    }
                }).catch((error) => {
                    // deselect for selectMode: single aborted
                    if (that.debug){ console.log(`${that._className} v${that._version} | handleRowSelect(${listRowEl.dataset.rownum}, ${newSelectState}) | failed to deselect at least one previously selected row for selectMode:singl |  rowSelectCallback() threw unexpectedly: ${error}`); }
                    boot(error);
                })
            }else{
                that.showFooterMessage = that.showFooterMessage;
                toot(false);
            }
        }
    }));
}




/*
    getSelected()
    return an array of all selected rows. We return the output of getRow() so
    [{data: {<fieldName>:<fieldValue>}, DOMElement: <RowElement>}, ...]
*/
getSelected(){
    return (Array.from(this._DOMElements.tableListContainer.querySelectorAll(`.${this.dataRowClassName}[data-selected="true"]`)).map((el) => {
        return(
            {
                data: JSON.parse(el.dataset.rowdata),
                DOMElement: el
            }
        )
    }));
}




/*
    deselectAll(forceBool)
    simply deselect all of the selected rows
    if forceBool is set true, just reset the rows and don't even bother trying the callback
    otherwise await the callbacks and let 'em abort if they need to
*/
deselectAll(forceBool){
    let that = this;
    return(Promise.all(Array.from(that._DOMElements.tableListContainer.querySelectorAll(`.${that.dataRowClassName}[data-selected="true"]`)).map((el) => {
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
    return(Promise.all(Array.from(that._DOMElements.tableListContainer.querySelectorAll(`.${that.dataRowClassName}[data-selected="false"]`)).map((el) => {
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
    this.tableListContainer = '';
}




/*
    reset()
    remove all data rows and all columns from the table
*/
reset(){
    this.clear();
    this.columns = [];
    this.headerRow = '';
}



/*
    handleColumnSort(headerColumnElement)
*/
handleColumnSort(hdrColEl){
    let that = this;
    if (that.allowColumnSort === true){
        if (that.debug){ console.log(`${that._className} v${that._version} | handleColumnSort(${hdrColEl.dataset.name}) | called`); }

        // it's a three way toggle: none | ascending | descending
        let modes = ['none','ascending','descending'];
        hdrColEl.dataset.sort = modes[
            (((modes.indexOf(hdrColEl.dataset.sort) + 1) > modes.length -1) || (modes.indexOf(hdrColEl.dataset.sort) < 0))?0:(modes.indexOf(hdrColEl.dataset.sort) + 1)
        ];
        let colObj = that.columns.filter((a)=>{return(a.name == hdrColEl.dataset.name)})[0];

        // ok when unsetting the sort we don't really do anything until all of the cols are sorted none, then we restore the original sort order
        if (hdrColEl.dataset.sort == "none"){
            if (Array.from(that._DOMElements.tableHeader.querySelectorAll(`span.${that.headerColClassName}:not([data-sort="none"])`)).length == 0){
                Array.from(that._DOMElements.tableListContainer.querySelectorAll(`div.${that.dataRowClassName}`)).sort((a,b) => {
                    return(parseInt(a.dataset.rownum) - parseInt(b.dataset.rownum))
                }).forEach((el) => {
                    that._DOMElements.tableListContainer.appendChild(el);
                })
            }
        }else{
            Array.from(that._DOMElements.tableListContainer.querySelectorAll(`div.${that.dataRowClassName}`)).sort((a,b) => {
                let aEl = a.querySelector(`span.${that.dataRowColClassName}[data-name="${hdrColEl.dataset.name}"]`);
                let bEl = b.querySelector(`span.${that.dataRowColClassName}[data-name="${hdrColEl.dataset.name}"]`);
                let aVal = (aEl instanceof Element)?aEl.textContent:null;
                let bVal = (bEl instanceof Element)?bEl.textContent:null;

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
                that._DOMElements.tableListContainer.appendChild(el);
            })
        }
    }
}




/*
    allowCellEdit
*/
get allowCellEdit(){ return(this._allowCellEdit === true); }
set allowCellEdit(v){
    this._allowCellEdit = (v === true);
    if (!(this.editCellCallback instanceof Function)){
        this.editCellCallback = this.defaultCellEditCallback;
    }
}



/*
    handleCellEdit(rowElement, cellElement)
    if allowCellEdit: true, and editCellCallback is specified, call it and await output
    if resolved promise, send returned value to modifyRow() and let it call the modifyRowCallback() if specified
*/
handleCellEdit(rowElement, cellElement){
    let that = this;
    return(new Promise((toot, boot) => {
        if (
            (that.allowCellEdit == true) &&
            (that.editCellCallback instanceof Function) &&
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
                that.editCellCallback(rowElement, cellElement, that).then((value) => {

                    // if we're in modify mode and modifyAll: prompt is set ...
                    new Promise((_t,_b) => {

                        let colRef = that.columns.filter((a) => {return(a.name == cellElement.dataset.name)})[0];
                        let dma = ((colRef instanceof Object) && colRef.hasOwnProperty('disableModifyAll') && (colRef.disableModifyAll == true));

                        if ((that.selectMode == 'multiple') && (that.numSelectedRows > 1) && (! dma)){
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
    modifyAll (bool)
*/
get modifyAll(){ return(this._modifyAll); }
set modifyAll(v){
    if (['auto', 'prompt'].indexOf(v) >= 0){
        this._modifyAll = v;
    }else{
        throw(`${this._className} v${this._version} | modifyAll(${v}) attribute setter: invalid input`);
    }
}




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
    showFooter (bool)
*/
get showFooter(){ return(this._showFooter === true); }
set showFooter(v){
    this._showFooter = (v === true);
    this._DOMElements.footer.style.display = this._showFooter?'grid':'none';
}

/*
    _showBtnPrefs (bool)
*/
get showBtnPrefs(){ return(this._showBtnPrefs === true); }
set showBtnPrefs(v){
    this._showBtnPrefs = (v === true);
    this._DOMElements.btnPrefs.style.display = this._showBtnPrefs?null:'none';
}

/*
    _showBtnSelectAll (bool)
*/
get showBtnSelectAll(){ return(this._showBtnSelectAll === true); }
set showBtnSelectAll(v){
    this._showBtnSelectAll = (v === true);
    this._DOMElements.btnSelectAll.style.display = this._showBtnSelectAll?null:'none';
}

/*
    _showBtnSelectNone (bool)
*/
get showBtnSelectNone(){ return(this._showBtnSelectNone === true); }
set showBtnSelectNone(v){
    this._showBtnSelectNone = (v === true);
    this._DOMElements.btnSelectNone.style.display = this._showBtnSelectNone?null:'none';
}

/*
    _showBtnExport (bool)
*/
get showBtnExport(){ return(this._showBtnExport === true); }
set showBtnExport(v){
    this._showBtnExport = (v === true);
    this._DOMElements.btnExport.style.display = this._showBtnExport?null:'none';
}

/*
    _showFooterMessage (bool)
*/
get showFooterMessage(){ return(this._showFooterMessage === true); }
set showFooterMessage(v){
    this._showFooterMessage = (v === true);
    this._DOMElements.footerMessage.style.display = this._showFooterMessage?null:'none';
    this._DOMElements.footerMessage.innerHTML = '';
    this._DOMElements.footerMessage.appendChild(this.getFooterMessage());
}

/*
    _showRowNudgeButtons (bool)
*/
get showRowNudgeButtons(){ return(this._showRowNudgeButtons === true); }
set showRowNudgeButtons(v){
    this._showRowNudgeButtons = (v === true);
    this._DOMElements.btnNudgeUp.style.display = this._showRowNudgeButtons?null:'none';
    this._DOMElements.btnNudgeDown.style.display = this._showRowNudgeButtons?null:'none';
}

/*
    getFooterMessage()
*/
getFooterMessage(){
    let that = this;

    // does this belong here? no
    // does every other part of the code that could affect a row select end up calling this: yes
    // they say you can fix anything with duct tape and determination, y'know?
    if(that.showBtnSelectNone){that._DOMElements.btnSelectNone.disabled = (this.numSelectedRows < 1);}
    if(that.showBtnSelectAll){that._DOMElements.btnSelectAll.disabled = (this.numRows == this.numSelectedRows);}
    if(that.showBtnExport){that._DOMElements.btnExport.disabled = (this.numRows == 0);}
    if (that.showRowNudgeButtons){
        if (this.numSelectedRows > 0){
            let selected = that.getSelected();
            let min = (Array.from(this._DOMElements.tableListContainer.children).indexOf(selected[0].DOMElement) + 1);
            let max = (Array.from(this._DOMElements.tableListContainer.children).indexOf(selected[(selected.length -1)].DOMElement) + 1);

            // disable up nudge if the minimum selected row is at top
            that._DOMElements.btnNudgeUp.disabled = (min == 1);

            // disable nudge down if the max selected row is at bottom
            that._DOMElements.btnNudgeDown.disabled = (max == that.numRows);

        }else{
            that._DOMElements.btnNudgeUp.disabled = true;
            that._DOMElements.btnNudgeDown.disabled = true;
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
    openPanel(DOMTree)
*/
openPanel(DOMTree){
    let that = this;
    if (DOMTree instanceof Element){
        that.prefEditorFrameThingy.append(that._DOMElements.uiContainer);
        that.prefEditorFrameThingy.uiContainer = DOMTree;
        requestAnimationFrame(() => {
            let d = that.prefEditorFrameThingy._DOMElements.uiContainer.getBoundingClientRect();
            that.DOMElement.style.minWidth = `${d.width}px`;
        });
    }else{
        throw(`${that._className} v${that._version} | openPanel() | invalid input`);
    }
}




/*
    closePanel()
*/
closePanel(){
    this.prefEditorFrameThingy.remove();
    this.DOMElement.style.minWidth = null;
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
    that._DOMElements.btnPrefs.dataset.open = (!(that._DOMElements.btnPrefs.dataset.open == 'true'));
    if (that._DOMElements.btnPrefs.dataset.open == 'true'){
        that.openPanel(that.getPrefEditor());
        that._DOMElements.btnExport.disabled = true;
    }else{
        that.closePanel();
        that._DOMElements.btnExport.disabled = false;
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
                    let guid = that.getGUID();
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
        that._DOMElements.btnPrefs.click();
    });
    return(div);
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
                    that._DOMElements.footerButtonContainer.querySelectorAll('button').forEach((el) => { el.disabled = false; });
                    toot(args.options[s]);
                });
                return(btn);
            }).forEach((el) => { div.querySelector("div.buttonContainer").appendChild(el); })
        }
        that._DOMElements.footerButtonContainer.querySelectorAll('button').forEach((el) => { el.disabled = true; });
        that.openPanel(div);
    }));
}




/*
    handleSelectAll()
    not much but could be a lot of 'em, so batches of syncRowsBatchLimit
    on animationFrames, yo!
*/
handleSelectAll(evt){
    let that = this;
    return(new Promise((toot, boot) => {
        that._DOMElements.btnSelectAll.disabled = true;
        let chunks = [];
        let queue = Array.from(that._DOMElements.tableListContainer.querySelectorAll(`div.${that.dataRowClassName}[data-selected="false"]`));
        while (queue.length > 0){ chunks.push(queue.splice(0, that.syncRowsBatchLimit)); }

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
    handleSelectNone()
    bizarro-world version of handleSelectAll() :p
*/
handleSelectNone(evt){
    let that = this;
    return(new Promise((toot, boot) => {
        that._DOMElements.btnSelectNone.disabled = true;
        let chunks = [];
        let queue = Array.from(that._DOMElements.tableListContainer.querySelectorAll(`div.${that.dataRowClassName}[data-selected="true"]`));
        while (queue.length > 0){ chunks.push(queue.splice(0, that.syncRowsBatchLimit)); }

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
    openExportUI()
    returns a promise that resolves when the UI is closed
    in case you needed that etc.
*/
openExportUI(){
    let that = this;
    return(new Promise((toot, boot) => {
        that._DOMElements.btnExport.disabled = true;

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
        let pie = new noicePieChart({
            showPieChart: true,
            size: '4em',
            pieCharts: [ { name: 'loading', fill:'rgba(6, 133, 135, .66)'} ],
            zIndex: 1
        }).append(gfxContainer);
        pie.badgeTxtDOMElement.style.fontSize = '1.8em';

        // btnClose hook
        btnClose.addEventListener('click', (evt) => {
            that.closePanel();
            that._DOMElements.btnExport.disabled = false;
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
}




/*
    getCSVExport(exportSelectedOnlyBool, pieChart, explainerEl, linkEl)
    export the table (or the selected rows if exportSelectedOnlyBool is hot)
    do this in batches of syncRowsBatchLimit length aligned to animationFrames
    because there might be a bajillion rows to deal with

    explainerEl is a span, put progress messages here

    linkEl is the link onto which we should put the big CSV export we build here
*/
getCSVExport(exportSelectedOnlyBool, pieChart, explainerEl, linkEl){
    let that = this;
    return(new Promise((toot, boot) => {

        // get syncRowsBatchLimit sized chunks of rows
        let chunks = [];
        let queue = Array.from(this._DOMElements.tableListContainer.querySelectorAll(`div.${that.dataRowClassName}${(exportSelectedOnlyBool === true)?'[data-selected="true"]':''}`));
        let complete = queue.length;
        while (queue.length > 0){ chunks.push(queue.splice(0, this.syncRowsBatchLimit)); }
        let csvQueue = [];

        // get the header :-)
        csvQueue.push(that.encodeCSVRow(Array.from(that._DOMElements.headerRow.querySelectorAll(`span.${that.headerColClassName}`)).map((el) =>{ return(el.textContent); })));

        // basically we're doing what get data() would do but spitting out an array of csv encoded strings
        pieChart.updatePieChart('loading', 0);
        explainerEl.textContent = 'exporting ...';
        function recursor(idx){
            if (idx == chunks.length){
                // zip it 'n ship it yo!
                linkEl.href = 'data:text/csv;charset=UTF-8,' + encodeURIComponent(csvQueue.join("\n"));
                linkEl.download = that.isNotNull(that.exportFileName)?that.exportFileName:`csv_export_${that.epochTimestamp(true)}.csv`;
                pieChart.updatePieChart('loading', 0);
                pieChart.badgeTxt = '✔️';
                explainerEl.textContent = `export ready`;
                toot(true);
            }else{
                // get literally whatever columns are on screen, then get a CSV row from it and push it on the stack
                chunks[idx].forEach((rowEl) =>{
                    csvQueue.push(that.encodeCSVRow(Array.from(rowEl.querySelectorAll(`span.${that.dataRowColClassName}`)).map((el) =>{ return(el.textContent); })))
                });
                explainerEl.textContent = `exporting (${csvQueue.length} of ${complete})`;
                pieChart.updatePieChart('loading', ((csvQueue.length/complete)*100));
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
    let el = this._DOMElements.tableListContainer.querySelector(`.${this.dataRowClassName}:nth-child(${toIndex})`);
    let rowElementIndex = (Array.from(this._DOMElements.tableListContainer.children).indexOf(rowElement) + 1);
    if (el instanceof Element){
        if (rowElementIndex > toIndex){ el.before(rowElement); }else{ el.after(rowElement); }
    }
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
        let a = Array.from(this._DOMElements.tableListContainer.children);
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
        that.getFooterMessage();
    }
}


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




}
export { noiceCoreUITable };
