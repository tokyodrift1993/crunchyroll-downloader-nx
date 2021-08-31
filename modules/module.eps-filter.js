class EpsFilter {
    constructor(epNumLen){
        this.epNumLen = epNumLen;
    }
    ifMaxEp(type, num){
        const maxEp = Math.pow(10, this.epNumLen[type]) - 1;
        return num > maxEp ? true : false;
    }
    powNum(type){
        return Math.pow(10, this.epNumLen[type]);
    }
    checkFilter(inputEps){
        // check
        inputEps = typeof inputEps != 'undefined'
            ? inputEps.toString().split(',') : [];
        // input range
        const maxRange = 1000;
        const inputEpsRange = [];
        // selectors
        const epRegex = new RegExp (/^(?:E?|S|M)(\d+)$/);
        const epLtReg = new RegExp (/(?:E|S|M)/);
        // filter wrong numbers
        inputEps = inputEps.map((e) => {
            // convert to uppercase
            e = e.toUpperCase();
            // if range
            if(e.match('-') && e.split('-').length == 2){
                const eRange = e.split('-');
                // check range
                if (!eRange[0].match(epRegex)) return '';
                // set ep latter and pad
                const epLetter = eRange[0].match(epLtReg) ? eRange[0].match(epLtReg)[0] : 'E';
                const padLen = this.epNumLen[epLetter];
                // parse range
                eRange[0] = eRange[0].replace(epLtReg, '');
                eRange[0] = parseInt(eRange[0]);
                eRange[0] = this.ifMaxEp(epLetter, eRange[0]) ? this.powNum(epLetter) - 1 : eRange[0];
                eRange[1] = eRange[1].match(/^\d+$/) ? parseInt(eRange[1]) : 0;
                eRange[1] = this.ifMaxEp(epLetter, eRange[1]) ? this.powNum(epLetter) - 1 : eRange[1];
                // check if correct range
                if (eRange[0] > eRange[1]){
                    const parsedEl = [
                        epLetter != 'E' ? epLetter : '',
                        eRange[0].toString().padStart(padLen, '0'),
                    ].join('');
                    return parsedEl;
                }
                if(eRange[1] - eRange[0] + 1 > maxRange){
                    eRange[1] = eRange[0] + maxRange - 1;
                }
                const rangeLength = eRange[1] - eRange[0] + 1;
                const epsRangeArr = Array(rangeLength).fill(0);
                for(const i in epsRangeArr){
                    const parsedRangeEl = [
                        epLetter != 'E' ? epLetter : '',
                        (parseInt(i) + eRange[0]).toString().padStart(padLen, '0'),
                    ].join('');
                    inputEpsRange.push(parsedRangeEl);
                }
                return '';
            }
            else if(e.match(epRegex)){
                const epLetter = e.match(epLtReg) ? e.match(epLtReg)[0] : 'E';
                const padLen = this.epNumLen[epLetter];
                e = parseInt(e.replace(epLtReg, ''));
                e = this.ifMaxEp(epLetter, e) ? this.powNum(epLetter) - 1 : e;
                return (epLetter != 'E' ? epLetter : '') + e.toString().padStart(padLen, '0');
            }
            return '';
        });
        // end
        inputEps = [...new Set(inputEps.concat(inputEpsRange))];
        inputEps = inputEps.indexOf('') > -1 ? inputEps.slice(1) : inputEps;
        return inputEps;
    }
}

module.exports = EpsFilter;
