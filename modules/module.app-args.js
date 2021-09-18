const yargs = require('yargs');

yargs(process.argv.slice(2));
yargs.wrap(Math.min(120));
yargs.usage('Usage: $0 [options]');
yargs.help(false);
yargs.version(false);

yargs.parserConfiguration({
    'duplicate-arguments-array': false,
    'camel-case-expansion': false,
});

class Args {
    constructor(cfg, langsData, is_beta){
        // parse default
        const parseDefault = (key, _default) => {
            if (Object.prototype.hasOwnProperty.call(cfg, key)) {
                return cfg[key];
            }
            else {
                return _default;
            }
        };
        // auth
        const authArgs = {
            auth: {
                group: 'Authentication:',
                describe: 'Enter authentication mode',
                type: 'boolean',
            },
            user: {
                implies: ['auth', 'pass'],
                group: 'Authentication:',
                describe: 'Username used for un-interactive authentication (Used with --auth)',
                type: 'string',
            },
            pass: {
                implies: ['auth', 'user'],
                group: 'Authentication:',
                describe: 'Password used for un-interactive authentication (Used with --auth)',
                type: 'string',
            },
        };
        // fonts
        const fontsArgs = {
            dlfonts: {
                group: 'Fonts:',
                describe: 'Download all required fonts for mkv muxing',
                type: 'boolean',
            },
        };
        // search
        const searchArgs = {
            search: {
                alias: 'f',
                group: 'Search:',
                describe: 'Search season ids',
                type: 'string',
            },
            search2: {
                alias: 'g',
                group: 'Search:',
                describe: 'Search season ids (multi-language, experimental)',
                type: 'string',
            },
            page: {
                alias: 'p',
                group: 'Search:',
                describe: 'Page number for search results',
                type: 'number',
            },
        };
        // beta
        if(is_beta){
            delete searchArgs.search2;
            Object.assign(
                searchArgs,
                {
                    'search-type': {
                        group: 'Search:',
                        describe: 'Search type',
                        choices: [ '', 'top_results', 'series', 'movie_listing', 'episode' ],
                        default: '',
                        type: 'string',
                    },
                },
            );
        }
        // search locale
        Object.assign(
            searchArgs,
            {
                'search-locale': {
                    group: 'Search:',
                    describe: 'Search  locale',
                    choices: langsData.searchLocales,
                    default: '',
                    type: 'string',
                },
            },
        );
        // series
        const seriesArgs = {};
        Object.assign(
            seriesArgs,
            {
                'new': {
                    group: 'Downloading:',
                    describe: 'Get last updated series list',
                    type: 'boolean',
                },
            },
        );
        // beta
        if(is_beta){
            Object.assign(
                seriesArgs,
                {
                    'movie-listing': {
                        alias: 'flm',
                        group: 'Downloading:',
                        describe: 'Get video list by Movie Listing ID',
                        type: 'string',
                    },
                    'series': {
                        alias: 'srz',
                        group: 'Downloading:',
                        describe: 'Get season list by Series ID',
                        type: 'string',
                    },
                },
            );
        }
        else{
            Object.assign(
                seriesArgs,
                {
                    'page-locale': {
                        group: 'Downloading:',
                        describe: 'Season request locale',
                        choices: langsData.searchLocales,
                        default: '',
                        type: 'string',
                    },
                },
            );
        }
        Object.assign(
            seriesArgs,
            {
                season: {
                    alias: 's',
                    group: 'Downloading:',
                    describe: 'Sets the Season ID',
                    type: 'number'
                },
                episode: {
                    alias: 'e',
                    group: 'Downloading:',
                    describe: 'Sets the Episode Number/IDs (comma-separated, hyphen-sequence)',
                    type: 'string',
                },
                quality: {
                    alias: 'q',
                    group: 'Downloading:',
                    describe: 'Sets video quality',
                    choices: ['240p', '360p', '480p', '720p', '1080p', 'max'],
                    default: parseDefault('videoQuality', '720p'),
                    type: 'string',
                },
                server: {
                    alias: 'x',
                    group: 'Downloading:',
                    describe: 'Select server',
                    choices: [1, 2, 3, 4],
                    default: parseDefault('nServer', 1),
                    type: 'number',
                },
                kstream: {
                    alias: 'k',
                    group: 'Downloading:',
                    describe: 'Select specific stream',
                    choices: [1, 2, 3, 4, 5, 6, 7],
                    default: parseDefault('kStream', 1),
                    type: 'number',
                },
                tsparts: {
                    group: 'Downloading:',
                    describe: 'Download ts parts in batch',
                    choices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30],
                    default: parseDefault('tsparts', 10),
                    type: 'number',
                },
                hslang: {
                    group: 'Downloading:',
                    describe: 'Download video with specific hardsubs',
                    choices: langsData.subtitleLanguagesFilter.slice(1),
                    default: parseDefault('hsLang', 'none'),
                    type: 'string',
                },
                dlsubs: {
                    group: 'Downloading:',
                    describe: 'Download subtitles by language tag (space-separated)',
                    choices: langsData.subtitleLanguagesFilter,
                    default: parseDefault('dlSubs', 'all'),
                    type: 'array',
                },
                skipdl: {
                    alias: 'novids',
                    group: 'Downloading:',
                    describe: 'Skip downloading video',
                    type: 'boolean',
                },
                skipsubs: {
                    group: 'Downloading:',
                    describe: 'Skip downloading subtitles',
                    type: 'boolean',
                },
                'show-stream-url': {
                    alias: 'ssu',
                    group: 'Downloading:',
                    describe: 'Show full stream url',
                    type: 'boolean',
                },
            },
        );
        if(is_beta){
            seriesArgs.season.type = 'string';
        }
        // muxing
        const muxingArgs = {
            'video-tag': {
                alias: [ 'ftag', 'vtag' ],
                group: 'Muxing:',
                describe: 'Release group',
                default: '',
                type: 'string'
            },
            dub: {
                group: 'Muxing:',
                describe: 'Manually set audio language by language code',
                choices: langsData.dubLanguageCodes,
                default: parseDefault('dubLanguage', langsData.dubLanguageCodes.slice(-1)[0]),
                type: 'string',
            },
            defsublang: {
                group: 'Muxing:',
                describe: 'Set default subtitle by language tag',
                choices: langsData.subtitleLanguagesFilter.slice(1),
                default: parseDefault('defSubLang', langsData.subtitleLanguagesFilter.slice(1)[0]),
                type: 'string',
            },
            'use-bcp-tags': {
                alias: 'bcp',
                group: 'Muxing:',
                describe: 'Use IETF BCP 47/RFC 5646 language tags instead of ISO 639-2 codes for mkv subtitles muxing',
                // https://github.com/unicode-org/cldr-json/blob/master/cldr-json/cldr-core/availableLocales.json
                default: parseDefault('useBCPtags', false),
                type: 'boolean'
            },
            mp4mux: {
                alias: 'mp4',
                group: 'Muxing:',
                describe: 'Mux video into mp4',
                default: parseDefault('mp4mux', false),
                type: 'boolean',
            },
            muxsubs: {
                alias: 'mks',
                group: 'Muxing:',
                describe: 'Add subtitles to mkv/mp4 (if available)',
                default: parseDefault('muxSubs', false),
                type: 'boolean'
            },
            skipmux: {
                group: 'Muxing:',
                describe: 'Skip muxing video and subtitles',
                type: 'boolean'
            },
        };
        // filenaming
        const filanamingArgs = {
            filename: {
                group: 'Filename Template:',
                describe: 'Template',
                default: parseDefault('filenameTemplate', '[{rel_group}] {title} - {ep_num} [{suffix}]'),
                type: 'string'
            },
            'group-tag': {
                alias: [ 'a', 'rel-group' ],
                group: 'Filename Template:',
                describe: 'Release group',
                default: parseDefault('releaseGroup', 'CR'),
                type: 'string'
            },
            title: {
                alias: 't',
                group: 'Filename Template:',
                describe: 'Series title override',
                type: 'string'
            },
            'episode-number': {
                alias: [ 'ep', 'ep-num' ],
                group: 'Filename Template:',
                describe: 'Episode number override (ignored in batch mode)',
                type: 'string'
            },
            'episode-number-length': {
                alias: 'el',
                group: 'Filename Template:',
                describe: 'Episode number length',
                choices: [1, 2, 3, 4],
                default: parseDefault('epNumLength', 2),
                type: 'number',
            },
            suffix: {
                group: 'Filename Template:',
                describe: 'Filename suffix override (first "SIZEp" will be replaced with actual video size)',
                default: parseDefault('fileSuffix', 'SIZEp'),
                type: 'string'
            },
        };
        // proxy
        const proxyArgs = {
            proxy: {
                group: 'Proxy:',
                describe: 'Set http(s)/socks proxy WHATWG url',
                default: parseDefault('proxy', ''),
                // hidden: true,
            },
            'proxy-auth': {
                group: 'Proxy:',
                describe: 'Colon-separated username and password for proxy',
                default: parseDefault('proxy_auth', ''),
                // hidden: true,
            },
            'use-proxy-streaming': {
                alias: 'ups',
                group: 'Proxy:',
                describe: 'Use proxy for stream and subtitles downloading',
                default: parseDefault('proxy_ups', false),
                type: 'boolean',
                // hidden: true,
            },
            curl: {
                group: 'Proxy:',
                describe: 'Use curl for requests to crunchyroll server',
                default: parseDefault('use_curl', false),
                type: 'boolean',
                // hidden: true,
            },
        };
        // util opts
        const utilArgs = {
            folder: {
                group: 'Utilities:',
                describe: 'After muxing move file to created "series title" folder',
                default: parseDefault('useFolder', false),
                type: 'boolean',
            },
            nosess: {
                group: 'Utilities:',
                describe: 'Reset Session cookie for testing proposes',
                type: 'boolean',
            },
            debug: {
                group: 'Utilities:',
                describe: 'Debug mode',
                type: 'boolean',
            },
            jsonmuxdebug: {
                group: 'Utilities:',
                describe: 'Debug mode (mkvmerge json)',
                type: 'boolean',
            },
            nocleanup: {
                group: 'Utilities:',
                describe: 'Move temporary files to trash folder instead of deleting',
                default: parseDefault('noCleanUp', false),
                type: 'boolean',
            },
            notrashfolder: {
                implies: [ 'nocleanup' ],
                group: 'Utilities:',
                describe: 'Don\'t move temporary files to trash folder (Used with --nocleanup)',
                default: parseDefault('noTrashFolder', false),
                type: 'boolean',
            },
        };
        // beta skip
        if(is_beta){
            delete utilArgs.nosess;
        }
        // set options
        const yargsOpts = {
            ...authArgs,
            ...fontsArgs,
            ...searchArgs,
            ...seriesArgs,
            ...muxingArgs,
            ...filanamingArgs,
            ...proxyArgs,
            ...utilArgs,
            ...{ help: {
                alias: 'h',
                group: 'Help:',
                describe: 'Show this help :)',
                type: 'boolean',
            }},
        };
        yargs.options(yargsOpts);
        // --
    }
    appArgv(){
        const argv = yargs.argv;
        if(!argv['group-tag'] || argv['group-tag'] == ''){
            argv['group-tag'] = 'CR';
        }
        return argv;
    }
    showHelp(){
        yargs.showHelp();
    }
}

module.exports = Args;
