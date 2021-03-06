const fs = require('fs');
const { exec } = require('child_process');
const { Stack } = require('dataStructures');
const { Range } = require('range');
const { CPPClassMethod } = require('cppClassMethod');
const { CPPClass } = require('cppClass');
const { firstNonWSCharIndex, firstWSCharIndex } = require('utility');
const WordIterator = require('wordIterator');

// TODO support pre processing
// TODO support method attributes
// TODO support structures
// TODO support templates (although, their implementation is in the header file)
// TODO group static methods and non static methods
// TODO support no name parameters
// TODO support custom compiler path for checking
// TODO support namespaces
// TODO make includes in top of file (in case of multiple classes)
// TODO add header file inclusion (detect if not included)
// TODO detect methods in cpp file and not in header
// TODO implemented function does not detect functions implemented using initializer lists

let singleLineCommentsRegEx = /.*\/\/.*/g
let multilineCommentsRegEx = /.*\/\*(.|\r\n|\n)*?\*\//g
let scopeVisibilityRegEx = /.*(private|public|protected)\:/g
let methodCleanerRegEx = /^(\s|\t|\n|\r|static|virtual)*/gm

const BRACKETS = { CURVED: 1, RECT: 2, CURLY: 3, TRI: 4 };

/**
 * The function that gets called by vscode. Writes a corresponding
 * cpp file for each header file included in activeFiles.
 * @param {String} mainFile the active file- not used.
 * @param {String[]} activeFiles the selected files.
 */
function defaultAction(mainFile, activeFiles) {
    let headerFiles = getHeaderFiles(activeFiles);
    headerFiles.forEach(headerFile => {
        writeImplementation(headerFile._fsPath);
    });
}
exports.test = function(path, isNewFile) {
    let string = '';
    if(!isNewFile) {
        getUnimplementedMethods(path).
            forEach(method => string += '\n' + method.toImplementationString());
    } else {
        parseHeaderFile(path).forEach( _class => {
            string += _class.toImplementationString();
        });
    }
    return string;
};
/**
 * Generates a cpp file for a given header file.
 */
function writeImplementation(headerFileName) {
    // get the cpp file's path
    let cppFilePath = headerFileToCppFile(headerFileName);

    fs.stat(cppFilePath, (err, stats) => {
        // open a file for appending
        let stream = fs.createWriteStream(cppFilePath, { flags:'a' });

        if (err == null) {
            // if file exists
            getUnimplementedMethods(headerFileName).
                forEach(method => stream.write('\n' + method.toImplementationString()));
        } else if (err.code === 'ENOENT') {
            // file does not exist
            parseHeaderFile(headerFileName).forEach( _class => {
                stream.write(_class.toImplementationString());
            });
        } else
            console.log('Some other error: ', err.code);
        stream.end();
    });

}

// returns a list of classes with methods
function parseHeaderFile(filePath) {
    // -fsyntax-only only checks compiler errors
    // -w disables all compiler warnings
    exec('g++ -fsyntax-only -w ' + filePath, (err, stdout, stderr) => {
        if (stderr !== '') {
            console.log('There are compiler errors.');
            return;
        }
    });
    let source = fs.readFileSync(filePath).toString();
    source = source.replace(singleLineCommentsRegEx, '');
    source = source.replace(multilineCommentsRegEx, '');

    // ranges calculated after comments were removed
    let ranges = getClassesRange(source);
    return ranges.map(range => parseClass(source, range));
}
function getFileExtension(filePath) {
    return filePath.match(/\.\w*$/)[0];
}
function getHeaderFiles(filePaths) {
    return filePaths.filter(file => getFileExtension(file._fsPath) === '.h');
}
function headerFileToCppFile(fullPath) {
    fullPath = fullPath.replace('headers\\', 'src\\');
    return fullPath.replace(/\.\w*$/, '.cpp');
}

/**
 * Returns a CPPClass object representation of the class.
 * @param {String} source the source file's code.
 * @param {Range} range The range of characters where the class is located.
 * Can be obtained with getClassesRange(source).
 */
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
        if (!isMethodDeleted(statement) && !isMethodPureVirtual(statement) && !isTypedef(statement)) {
            // TODO think of a cleaner way to to this    
            if (CPPClassMethod.isMethodDeclaration(statement) || CPPClassMethod.isOperator(statement))
                methods.push(CPPClassMethod.parseMethod(className, statement));
            else if (CPPClassMethod.isSpecialMember(statement))
                methods.push(CPPClassMethod.parseSpecialMember(className, statement));
        }
    });
    return new CPPClass(className, methods);
}

function getClassName(source, range) {
    let classNameStartIndex = firstNonWSCharIndex(source, range.start + 'class'.length);
    let classNameEndIndex = firstWSCharIndex(source, classNameStartIndex);
    return source.substring(classNameStartIndex, classNameEndIndex);
}
function getClassesRange(source) {
    let output = [];
    let regEx = /class/g;
    let res;
    while ((res = regEx.exec(source)) !== null) {
        const nearestOpeningBracket = source.indexOf('{', res.index);
        const nearestSemicolon = source.indexOf(';', res.index);
        // if this is a class forward declaration
        if (nearestSemicolon < nearestOpeningBracket && nearestSemicolon != -1)
            continue;

        const classClosingBracket = getClosingBracketIndex(source, nearestOpeningBracket);
        output.push(new Range(res.index, classClosingBracket));
        lastRow = res.index + 1;
    }
    return output;
}
function getClosingBracketIndex(string, openingBracketIndex) {
    let s = new Stack();
    let bracketIndex = openingBracketIndex + 1;
    let bracketType = getBracketType(string[openingBracketIndex]);

    let openingBracket = getBracket(bracketType, true);
    let closingBracket = getBracket(bracketType, false);

    for (let i = openingBracketIndex + 1; i < string.length; i++) {
        if (string[i] == openingBracket)
            s.push(string[bracketIndex]);
        else if (string[i] == closingBracket) {
            // assume string is in valid form since there are no compiler errors
            s.pop();
            if (s.isEmpty())
                return i;
        }
    }
    return -1;
}
/**
 * Returns an enum value of the corresponding type.
 * @param {String} bracket character literal of a bracket character.
 */
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
/**
 * Returns the corresponding bracket character.
 * @param {BRACKETS} type The bracket type. Taken from enum.
 * @param {boolean} isOpening If opening bracket or not.
 */
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

// --------- Util ---------

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

    loggedString += string.substring(0, ranges[0].start);
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

// -----------------------------------------
// returns the implemented methods
function getImplementedMethods(source) {
    source = source.replace(multilineCommentsRegEx, '');
    source = source.replace(singleLineCommentsRegEx, '');
    // remove preprocessor derivatives
    source = source.replace(/#.*\n{0,1}/g, '');
    source = source.replace(/(\t|\n|\r|static)*/g, '');
    let signatures = source.split(/\s*\{(.|\n|\r\n|\r)*?\}(\s|\n|\r\n|\r)*/);
    signatures = signatures.filter(item => item !== undefined && (isSpecialMemberImplementation(item) || isMethodImplementation(item)));
    signatures = signatures.map(signature => signature + ' {\n\t\n}');
    return signatures;
}
function isSpecialMemberImplementation(statement) {
    return statement.search(/[a-zA-Z_][a-zA-Z_0-9\$]*::[a-zA-Z_$][a-zA-Z_$0-9]*\(.*\)/) !== -1;
}
function isMethodImplementation(statement) {
    return statement.search(/[a-zA-Z_][a-zA-Z_0-9\*\&\$]*\s*[a-zA-Z_][a-zA-Z_0-9]*::[a-zA-Z_$][a-zA-Z_$0-9]*\(.*\)/) !== -1;
}
function isTypedef(statement) {
    let wi = new WordIterator.WordIterator(statement);
    let firstWord = wi.nextWord().word;
    // check if firstword is typedef
    return firstWord.indexOf('typedef') == 0;
}
function getUnimplementedMethods(headerFile) {
    let cppFile = headerFileToCppFile(headerFile);
    let implemented = getImplementedMethods(fs.readFileSync(cppFile).toString());
    let classes = parseHeaderFile(headerFile);
    let output = [];
    classes.forEach(_class => {
        output = output.concat(
            _class.methods.filter(method => implemented.indexOf(method.toImplementationString()) === -1)
        );
    });
    return output;
}
// meaning marked deleted
function isMethodDeleted(method) {
    return method.search(/\s*=\s*delete\s*$/) !== -1;
}
function isMethodPureVirtual(method) {
    return method.search(/=[\s\t]*0[\s\t]*;/) !== -1;
}

exports.default = defaultAction;