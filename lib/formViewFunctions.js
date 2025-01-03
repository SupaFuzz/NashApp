/*
    formViewFunctions.js
    Amy Hicox 5/21/24

    these are common self-contained functions needed for driving
    record data views (formView, rowHandle, clone, etc, etc)

    see also
        ./UI/components/formViewComponents.js
        ./config/fieldDisplayProperties.js
*/




/*
    alignFormElementLabels(DOMElement, bool)
    ripped out of ot wcARSFormView -- give me a DOMElement containing a set of
    wcFormElements where label_position="left", find the one with the longest
    label, then set that as the label_width of all the others.

    gonna presume you got css rules on the given parent DOMElement
    such that's gonna line em up nice :-)

    if the given bool is false, we'll reset label_width="auto"
    on all of them (basically undoing alignment)

    useful for UI's with formElements that aren't in a formView
*/
function alignFormElementLabels(DOMElement, bool){
    if (DOMElement instanceof Element){
        if (bool === false){
            // turn it off
            DOMElement.querySelectorAll('wc-form-element[label_position="left"]').forEach((el) => { el.label_width = 'auto'; });
        }else{
            // le longest label
            let maxLabel = Array.from(DOMElement.querySelectorAll('wc-form-element[label_position="left"]')).sort((a,b) => {return(b.label.length - a.label.length)})[0];
            if (maxLabel instanceof Element){
                let oneEM = parseFloat(getComputedStyle(maxLabel._elements.label).fontSize);
                let setLength = Math.ceil(maxLabel._elements.label.getBoundingClientRect().width/oneEM);

                // blast the longest one down to all of 'em
                DOMElement.querySelectorAll('wc-form-element[label_position="left"]').forEach((el) => { el.label_width = `${setLength + 1}em`});
            }
        }
    }
}





/*
    getCurrentFYStart()
    return epoch time corresponding to first second of the current fiscal year

    BEWARE: getMonth returns zero-indexed and that's why < 9!

    get fy start algorithm. it ain't complicated but it isn't intuiative either
    subtract 1 if current month less than Oct (getMonth == 9)
    subtract 2 if current month less than Oct (getMonth == 9) && (! that.currentFY)
    subtract 0 if current month >= 9
    subtract 1 if current month > 9 && (! that.currentFY)
*/
function getCurrentFYStart(){
    let t = new Date();
    return(toEpoch(`10/1/${(t.getMonth() < 9)?(t.getFullYear() -1):t.getFullYear()}`));
}





export {
  getCurrentFYStart, alignFormElementLabels
};
