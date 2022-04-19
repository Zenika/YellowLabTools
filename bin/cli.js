#!/usr/bin/env node

var debug       = require('debug')('ylt:cli');
var meow        = require('meow');
var path        = require('path');
var EasyXml     = require('easyxml');
var Q           = require('q');
var fs          = require('fs');
var {parse}     = require('yaml')

var ylt         = require('../lib/index');

var cli = meow({
    help: [
        'Usage',
        '  yellowlabtools <url> <options>',
        '',
        'Options:',
        '  --device             Simulates a device. Choose between phone (default), tablet, desktop and desktop-hd.',
        '  --screenshot         Will take a screenshot and use this value as the output path. It needs to end with ".png".',
        //'  --wait-for-selector  Once the page is loaded, Phantomas will wait until the given CSS selector matches some elements.',
        '  --proxy              Sets an HTTP proxy to pass through. Syntax is "host:port".',
        '  --cookie             Adds a cookie on the main domain.',
        '  --auth-user          Basic HTTP authentication username.',
        '  --auth-pass          Basic HTTP authentication password.',
        '  --block-domain       Disallow requests to given (comma-separated) domains.',
        '  --allow-domain       Only allow requests to given (comma-separated) domains.',
        '  --no-externals       Block all domains except the main one.',
        '  --reporter           The output format: "json" or "xml". Default is "json".',
        '  --local-storage      Ability to set a local storage, key-value pairs (e.g. "bar=foo;domain=url")',
        '  --session-storage    Ability to set a session storage, key-value pairs (e.g. "bar=foo;domain=url")',
        ''
    ].join('\n'),
    pkg: require('../package.json')
});



// Check parameters
if (cli.input.length < 1) {
    cli.showHelp();
}

var input = cli.input[0];
const urls = [];
if(input && typeof input === 'string' && (input.toLowerCase().indexOf('.yml', input.length - 4) !== -1 || input.toLowerCase().indexOf('.yaml', input.length - 5) !== -1)){
    const fileBuffer = fs.readFileSync(input)
    const actions = parse(fileBuffer.toString())
    urls.push(...actions.map(action => {
        return {
            url: action.url,
            name: action.name,
            // remove null or undefined
            ...Object.fromEntries(Object.entries(checkOptions(action)).filter(([_, v]) => v != null))
        }
    }))
}
else {
    urls.push({url: input})
}

function checkOptions(source){
    var options = {};
    
    // Screenshot option
    var screenshot = source.screenshot;
    if (screenshot && (typeof screenshot !== 'string' || screenshot.toLowerCase().indexOf('.png', screenshot.length - 4) === -1)) {
        console.error('Incorrect parameters: screenshot must be a path that ends with ".png"');
        process.exit(1);
    }
    if (screenshot) {
        if (path.resolve(screenshot) !== path.normalize(screenshot)) {
            // It is not an absolute path, so it is relative to the current command-line directory
            screenshot = path.join(process.cwd(), screenshot);
        }
        options.screenshot = source.screenshot;
    }

    // Device simulation
    options.device = source.device || 'mobile';

    // Wait for CSS selector
    options.waitForSelector = source.waitForSelector || null;

    // Proxy
    options.proxy = source.proxy || null;

    // Cookie
    options.cookie = source.cookie || null;

    // HTTP basic auth
    options.authUser = source.authUser || null;
    options.authPass = source.authPass || null;

    // Domain blocking
    options.blockDomain =  source.blockDomain || null;
    options.allowDomain =  source.allowDomain || null;
    options.noExternals =  source.noExternals || null;

    // Storage injection
    options.localStorage = source.localStorage;
    options.sessionStorage = source.sessionStorage;

    // Output format
    if (source.reporter && source.reporter !== 'json' && source.reporter !== 'xml') {
        console.error('Incorrect parameters: reporter has to be "json" or "xml"');
        process.exit(1);
    }
    return options
}

const globalOptions = checkOptions(cli.flags)

// Display data
function display(data) {
    switch(cli.flags.reporter) {
        case 'xml':
            var serializer = new EasyXml({
                manifest: true
            });

            // Remove some heavy parts of the results object
            delete data.toolsResults;
            delete data.javascriptExecutionTree;

            var xmlOutput = serializer.render(data);

            // Remove special chars from XML tags: # [ ]
            xmlOutput = xmlOutput.replace(/<([^>]*)#([^>]*)>/g, '<$1>');
            xmlOutput = xmlOutput.replace(/<([^>]*)\[([^>]*)>/g, '<$1>');
            xmlOutput = xmlOutput.replace(/<([^>]*)\]([^>]*)>/g, '<$1>');

            // Remove special chars from text content: \n \0
            xmlOutput = xmlOutput.replace(/(<[a-zA-Z]*>[^<]*)\n([^<]*<\/[a-zA-Z]*>)/g, '$1$2');
            xmlOutput = xmlOutput.replace(/\0/g, '');
            xmlOutput = xmlOutput.replace(/\uFFFF/g, '');
            xmlOutput = xmlOutput.replace(/\u0002/g, '');

            console.log(xmlOutput);
            break;
        default:
            console.log(JSON.stringify(data, null, 2));
    }
}


(function execute(urls, options) {
    'use strict';
    urls.reduce((acc, {url, ...urlOptions}) => {
            return acc.then((results) => {
                return ylt(url, {...options, ...urlOptions}).then(data => {
                    results.push(data)
                    return results
                })
            })
        }, Q([]))
        .then(data => {
                debug("All urls have been tested")
                display(data)
            })
            .fail(err => {
                debug("Error while testing urls")
                debug(err)
                console.log(err)
            })

    debug('Test launched...');

})(urls, globalOptions);