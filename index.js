const fs = require('fs');
const { exec } = require('child_process');
const { Stack } = require('dataStructures');
const { Range } = require('range');
const { CPPClassMethod } = require('cppClassMethod');
const { CPPClass } = require('cppClass');
const { firstNonWSCharIndex, firstWSCharIndex } = require('utility');

// TODO support pre processing
// TODO support method attributes
// TODO support structures
// TODO support templates (although, their implementation is in the header file)
// TODO group static methods and non static methods
// TODO support const methods (not changing)
// TODO support operators
// TODO support no name parameters
// TODO handle cases where cpp file already exists (update\notify)
// TODO support custom compiler path for checking

let singleLineCommentsRegEx = /.*\/\/.*/g
let multilineCommentsRegEx  = /.*\/\*(.|\r\n|\n)*?\*\//g
let scopeVisibilityRegEx = /.*(private|public|protected)\:/g
let methodCleanerRegEx = /^(\s|\t|\n|\r|static)*/gm

function defaultAction(mainFile, activeFiles) {
    let headerFiles = getHeaderFiles(activeFiles);
    headerFiles.forEach(headerFile => {
        writeImplementation(headerFile._fsPath);
    });
}
/**
 * parse file and divide to classes
 * each class will have an array of properties and methods
 * for each method, generate implementation
 */
function writeImplementation(headerFileName) {
    fs.readFile(headerFileName, (err, data) => {
        if (err) {
            console.log('Can\'t open file.');
            return;
        }
        // -fsyntax-only only checks compiler errors
        // -w disables all compiler warnings
        exec('g++ -fsyntax-only -w ' + headerFileName, (err, stdout, stderr) => {
            if (stderr !== '') {
                console.log('There are compiler errors.');
                return;
            }
            console.log(data.toString());
        });
        source = data.toString().replace(singleLineCommentsRegEx, '');
        source = source.replace(multilineCommentsRegEx , '');

        // ranges calculated after comments were removed
        let ranges = getClassesRange(source);
        ranges.forEach(range => {
            let parsed = parseClass(source, range);
            fs.writeFile(headerFileToCppFile(headerFileName), parsed.toImplementationString(), err => {
                if (err)
                    console.log('An error occured.');
                else
                    console.log('Task successful.');
            });
        });
    });
}
function getFileExtension(filePath) {
    return filePath.match(/\.\w*$/)[0];
}
function getHeaderFiles(filePaths) {
    return filePaths.filter(file => getFileExtension(file._fsPath) === '.h');
}
function headerFileToCppFile(fullPath) {
    return fullPath.replace(/\.\w*/, '.cpp');
}

function parseClass(source, range) {
    let className = getClassName(source, range);
    // remove inheritence text
    className = className.replace(/:.*/, '');
    let methods = [];
    let classSource = source.substring(range.start, range.end + 1);
    classSource = classSource.replace(scopeVisibilityRegEx, '');

    classSource = CPPClass.removeClassName(classSource);
    classSource = classSource.replace(methodCleanerRegEx, '');
    statements = classSource.split(';');
    statements.forEach(statement => {
        // TODO for some reason the methodCleanerRegex doesn't remove the \r characters
        statement = statement.replace(/\r/g, '');
        // in case 'static' was after the type in the declaration
        statement = statement.replace('static ','');
        if (CPPClassMethod.isMethodDeclaration(statement))
            methods.push(CPPClassMethod.parseMethod(className, statement));
        else if (CPPClassMethod.isSpecialMember(statement))
            methods.push(CPPClassMethod.parseSpecialMember(className, statement));
    });
    return new CPPClass(className, methods);
}

function getClassName(source, range) {
    let classNameStartIndex = firstNonWSCharIndex(source, range.start + 'class'.length);
    let classNameEndIndex   = firstWSCharIndex(source, classNameStartIndex);
    return source.substring(classNameStartIndex, classNameEndIndex);
}
function getClassesRange(source) {
    let output = [];
    let regEx = /class/g;
    let res;
    while((res = regEx.exec(source)) !== null) {
        const nearestOpeningBracket = source.indexOf('{', res.index);
        const nearestSemicolon      = source.indexOf(';', res.index);
        // if this is a class forward declaration
        if (nearestSemicolon < nearestOpeningBracket && nearestSemicolon != -1)
            continue;

        const classClosingBracket = getClosingBracketIndex(source, nearestOpeningBracket);
        output.push(new Range(res.index, classClosingBracket));
        lastRow = res.index + 1;
    }
    return output;    
}
const BRACKETS = { CURVED : 1, RECT : 2, CURLY : 3, TRI : 4 };
function getClosingBracketIndex(string, openingBracketIndex) {
    let s = new Stack();
    let bracketIndex = openingBracketIndex + 1;
    let bracketType = getBracketType(string[openingBracketIndex]);
    
    let openingBracket = getBracket(bracketType, true );
    let closingBracket = getBracket(bracketType, false);

    for (let i = openingBracketIndex + 1; i < string.length; i++) {
        if (string[i] == openingBracket)
            s.push(string[bracketIndex]);
        else if(string[i] == closingBracket) {
            // assume string is in valid form since there are no compiler errors
            s.pop();
            if (s.isEmpty())
                return i;
        }
    }
    return -1;
}
function getBracketType(bracket) {
    switch (bracket) {
        case '(' || ')':
            return BRACKETS.CURVED;
        case '[' || ']':
            return BRACKETS.RECT;
        case '{' || '}':
            return BRACKETS.CURLY;
        case '<' || '>':
            return BRACKETS.TRI;
    }
}
function getBracket(type, isOpening) {
    if (isOpening) {
        switch (type) {
            case BRACKETS.CURVED:
                return '(';
            case BRACKETS.RECT:
                return '[';
            case BRACKETS.CURLY:
                return '{';
            case BRACKETS.TRI:
                return '<';
        }
    }
    switch (type) {
        case BRACKETS.CURVED:
            return ')';
        case BRACKETS.RECT:
            return ']';
        case BRACKETS.CURLY:
            return '}';
        case BRACKETS.TRI:
            return '>';
    }
}
/**
 * Prints a string and parts of it in cyan.
 * @param {String} string The string to print to the console.
 * @param {Range[]} ranges The parts of the string to color in cyan.
 * @example printRanges(
 * 'hello1 world\nlamo',
 * [new Range(1,3), new Range(5,14)]
 * );
 */
function printRanges(string, ranges) {
    let words = [];
    let loggedString = '';

    loggedString += string.substring(0,ranges[0].start);
    for (let i = 0; i < ranges.length - 1; i++) {
        words.push(string.substring(ranges[i].start, ranges[i].end + 1));
        loggedString += '\x1b[36m%s\x1b[0m';
        loggedString += string.substring(ranges[i].end + 1, ranges[i + 1].start);
    }
    words.push(string.substring(ranges[ranges.length - 1].start, ranges[ranges.length - 1].end + 1));
    loggedString += '\x1b[36m%s\x1b[0m';
    loggedString += string.substring(ranges[ranges.length - 1].end + 1);

    console.log(loggedString, ...words);
}


exports.default = defaultAction;

defaultAction(null, [{_fsPath: 'query.h'}]);