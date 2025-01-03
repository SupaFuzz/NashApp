/*
    where credit is due:
    https://stackoverflow.com/questions/4011113/can-you-add-noise-to-a-css-gradient
    #box {
        width: 250px;
        aspect-ratio: 1;
        position: relative;
        background:
        repeating-radial-gradient(closest-corner at 1% 21%, rgba(255,0,255,.5), rgba(0,255,255,.5), #000 1.7%),
        repeating-radial-gradient(closest-corner at 51% 51%, #fff, #fff, rgba(0,255,0,1) 10%);
        background-size: 55px 10px;
    }

    #box::before {
        position: absolute;
        z-index: 1;
        inset: 0;
        background:
        repeating-radial-gradient(closest-corner at 21% 21%, #fff, rgba(0,0,255,.5), rgb(3,0,255) 20%),
        repeating-radial-gradient(closest-corner at 61% 21%, #fff, rgba(0,255,0,.5), rgb(3,0,255) 20%),
        repeating-radial-gradient(closest-corner at 91% 51%, #fff, rgba(255,255,1,.5), rgb(055,255,255) 20%);
        background-size: 15px 13px, 12px 22px, 12px 22px;
        background-blend-mode: exclusion, normal;
        mix-blend-mode: exclusion;
        content: ''
    }

    I basically wanna make an absolutely positioned div that expands to the size of it's parent
    then nails itself to the floor with a zIndex like -9999 or something.

    And I wanna figure out how to tune that
    maybe with some css filters on the parent.
    if there's something like a css spectral-gate I could use to control sparseness?
    something like the good old photoshop dissolve blend mode would be perfect actually

    6/17/24 @ 1936
    this is pretty beta but it works enough to put it in the repo
*/
import { noiceAutonomousCustomElement } from '../noiceAutonomousCustomElement.js';

class wcNoise extends noiceAutonomousCustomElement {




static classID = wcNoise;
static classAttributeDefaults = {
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
    this._className = 'wcNoise';
    this._version = 1;

    // attributeChangeHandlers
    this.attributeChangeHandlers = {
        /*
            ex
            label_position: (attributeName, oldValue, newValue, selfReference) => { selfReference.setLabelPosition(newValue, oldValue); },
        */
    };

    // merge object defaults
    this.mergeClassDefaults({
        _content: null
    });
}




/*
    getAttributeDefaults()
    override this in each subclass, as I can't find a more elegant way of
    referencing the static class vars in an overridable way
*/
getAttributeDefaults(){
    return(wcNoise.classAttributeDefaults);
}




/*
    getHTMLContent()
*/
getHTMLContent(){

    // the container div
    let div = document.createElement('div');
    div.className = this._className;
    div.id = "box";

    /*
        insert shenanigans here
        also set this._elements references if needed
        also setup default event listeners if needed
    */

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
}




/*
    defaultStyle getter
*/
get defaultStyle(){return(`
    :host {
        display: block;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: -99;
        filter: grayscale(100%) contrast(1000%) opacity(15%);
        /*
        filter: contrast(1000%) sepia(40%) grayscale(80%) blur(.8px) opacity(10%);
        */
    }
    #box {
        width: 100%;
        height: 100%;
        aspect-ratio: 1;
        position: relative;
        background:
        repeating-radial-gradient(closest-corner at 1% 21%, rgba(255,0,255,.5), rgba(0,255,255,.5), #000 1.7%),
        repeating-radial-gradient(closest-corner at 51% 51%, #fff, #fff, rgba(0,255,0,1) 10%);
        background-size: 55px 10px;
    }
    #box::before {
        position: absolute;
        z-index: 1;
        inset: 0;
        background:
        repeating-radial-gradient(closest-corner at 21% 21%, #fff, rgba(0,0,255,.5), rgb(3,0,255) 20%),
        repeating-radial-gradient(closest-corner at 61% 21%, #fff, rgba(0,255,0,.5), rgb(3,0,255) 20%),
        repeating-radial-gradient(closest-corner at 91% 51%, #fff, rgba(255,255,1,.5), rgb(055,255,255) 20%);
        background-size: 15px 13px, 12px 22px, 12px 22px;
        background-blend-mode: exclusion, normal;
        mix-blend-mode: exclusion;
        content: ''
    }
`)};


}
const _classRegistration = wcNoise.registerElement('wc-noise');
export { _classRegistration as wcNoise };
