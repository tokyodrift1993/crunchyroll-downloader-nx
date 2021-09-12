#!/usr/bin/env node

// build-in
const path = require('path');
const fs = require('fs-extra');

// package program
const packageJson = require('./package.json');
console.log(`\n=== Crunchyroll Downloader NX ${packageJson.version} ===\n`);

// plugins
const shlp = require('sei-helper');
const m3u8 = require('m3u8-parsed');
const cheerio = require('cheerio');
const streamdl = require('hls-download');

// custom modules
const fontsData   = require('./modules/module.fontsData');
const langsData   = require('./modules/module.langsData');
const yamlCfg     = require('./modules/module.cfg-loader');
const yargs       = require('./modules/module.app-args');
const epsFilter   = require('./modules/module.eps-filter');
const appMux      = require('./modules/module.muxing');

// new-cfg paths
const workingDir  = process.pkg ? path.dirname(process.execPath) : __dirname;
const cfgFolder   = path.join(workingDir, '/config');
const binCfgFile  = path.join(cfgFolder, 'bin-path');
const dirCfgFile  = path.join(cfgFolder, 'dir-path');
const cliCfgFile  = path.join(cfgFolder, 'cli-defaults');
const sessCfgFile = path.join(cfgFolder, 'session');
const cfg         = yamlCfg.loadCfg(workingDir, binCfgFile, dirCfgFile, cliCfgFile);

// args
const appYargs = new yargs(cfg.cli, langsData);
const argv = appYargs.appArgv();
argv.appstore = {};

// load req
const { domain, api } = require('./modules/module.api-urls');
const reqModule = require('./modules/module.req');
const req = new reqModule.Req(domain, argv, sessCfgFile);

// main
(async () => {
    // select mode
    if(argv.auth){
        await doAuth();
    }
    else if(argv.dlfonts){
        await getFonts();
    }
    else if(argv.search && argv.search.length > 2){
        await doSearch();
    }
    else if(argv.search2 && argv.search2.length > 2){
        await doSearch2();
    }
    else if(argv.s && parseInt(argv.s, 10) > 0){
        await getSeasonById();
    }
    else if(argv.e){
        await getMediaById();
    }
    else{
        appYargs.showHelp();
    }
})();

// get cr fonts
async function getFonts(){
    console.log('[INFO] Downloading fonts...');
    for(const f of Object.keys(fontsData.fonts)){
        const fontFile = fontsData.fonts[f];
        const fontLoc  = path.join(cfg.dir.fonts, fontFile);
        if(fs.existsSync(fontLoc) && fs.statSync(fontLoc).size != 0){
            console.log(`[INFO] ${f} (${fontFile}) already downloaded!`);
        }
        else{
            const fontFolder = path.dirname(fontLoc);
            if(fs.existsSync(fontLoc) && fs.statSync(fontLoc).size == 0){
                fs.unlinkSync(fontLoc);
            }
            try{
                fs.ensureDirSync(fontFolder);
            }
            catch(e){}
            const fontUrl = fontsData.root + fontFile;
            const getFont = await req.getData(fontUrl, { useProxy: true, skipCookies: true, binary: true });
            if(getFont.ok){
                fs.writeFileSync(fontLoc, getFont.res.body);
                console.log(`[INFO] Downloaded: ${f} (${fontFile})`);
            }
            else{
                console.log(`[WARN] Failed to download: ${f} (${fontFile})`);
            }
        }
    }
    console.log('[INFO] All required fonts downloaded!');
}

// auth method
async function doAuth(){
    console.log('[INFO] Authentication');
    
    const iLogin = argv.user ? argv.user : await shlp.question('[Q] LOGIN/EMAIL');
    const iPsswd = argv.pass ? argv.pass : await shlp.question('[Q] PASSWORD   ');
    argv.user = iLogin;
    argv.pass = iPsswd;
    
    const authData = new URLSearchParams({
        'login_form[name]': iLogin,
        'login_form[password]': iPsswd,
        'login_form[redirect_url]': '/',
    });
    
    const authPage = await req.getData(api.auth, { skipCookies: true, useProxy: true });
    if(!authPage.ok){
        console.log('[ERROR] Failed to fetch authentication page!');
        return;
    }
    
    const loginFormToken = authPage.res.body.match(/name="login_form\[_token\]" value="(.*)"/);
    if(!loginFormToken){
        console.log('[ERROR] Can\'t fetch login token! Already logged?');
        if(new URL(authPage.res.url).origin == domain.www_beta){
            await optOutBeta();
        }
        return;
    }
    
    authData.append('login_form[_token]', loginFormToken[1]);
    req.setNewCookie(authPage.res.headers['set-cookie'], true);
    
    const authReq = await req.getData(api.auth, { method: 'POST', body: authData.toString(), followRedirect: false, useProxy: true });
    if(!authReq.ok){
        console.log('[ERROR] Authentication failed!');
        return;
    }
    
    const authErr = authReq.res.body.match(/<li class="error">(.*)<\/li>/);
    
    if(authErr){
        console.log('[ERROR] Auth Error:');
        console.log('[ERROR]', authErr[1]);
    }
    else{
        req.setNewCookie(authReq.res.headers['set-cookie'], true);
        console.log('[INFO] Authentication successful!');
    }
    
}

async function apiSession(){
    // api keys
    const crDevices = {
        win10: {
            device_type:  'com.crunchyroll.windows.desktop',
            access_token: 'LNDJgOit5yaRIWN',
        },
        android: {
            device_type: 'com.crunchyroll.crunchyroid',
            access_token: 'WveH9VkPLrXvuNm',
        },
    };
    // session req params
    const sessionReqParams = new URLSearchParams({
        device_type:  crDevices.win10.device_type,
        device_id  :  req.uuidv4(),
        access_token: crDevices.win10.access_token,
    });
    // req session
    const sessionReq = await req.getData(`${api.session}?${sessionReqParams.toString()}`, { useProxy:true });
    if(!sessionReq.ok){
        console.log('[ERROR] Can\'t update session id!');
        return '';
    }
    // parse session data
    const sessionData = JSON.parse(sessionReq.res.body);
    if(sessionData.error){
        console.log(`[ERROR] ${sessionData.message}`);
        return '';
    }
    req.argv.nosess = false;
    console.log(`[INFO] Your country: ${sessionData.data.country_code}\n`);
    return sessionData.data.session_id;
}

async function optOutBeta(){
    // info
    console.log('[ERROR] This downloader only works with classic crunchyroll site!');
    console.log('[ERROR] Trying switch to classic version...');
    // beta data
    const getBetaToken = await req.getData(api.beta_auth, {
        method: 'POST',
        headers: api.beta_authHeader,
        body: 'grant_type=etp_rt_cookie',
        useProxy: true,
    });
    if(!getBetaToken.ok){
        console.log('[ERROR] Authentication failed!');
        return;
    }
    // get token
    const betaToken = JSON.parse(getBetaToken.res.body);
    // switch to classic
    const betaOptOutByToken = await req.getData(api.beta_profile, {
        method: 'PATCH',
        headers: {
            Authorization: 'Bearer ' + betaToken.access_token,
            'Content-Type': 'application/json;charset=utf-8',
        },
        body: '{"cr_beta_opt_in":false}',
        skipCookies: true,
        useProxy: true,
    });
    if(!betaOptOutByToken.ok){
        console.log('[ERROR] Changing to classic failed!');
        return;
    }
    const betaProfileReq = await req.getData(api.beta_profile, {
        method: 'GET',
        headers: {
            Authorization: 'Bearer ' + betaToken.access_token,
        },
        skipCookies: true,
        useProxy: true,
    });
    if(!betaProfileReq.ok){
        console.log('[ERROR] Can`t get user profile!');
        return;
    }
    const betaProfile = JSON.parse(betaProfileReq.res.body);
    if(!betaProfile.cr_beta_opt_in){
        console.log('[INFO] Done! Try get video again or relogin!');
    }
    else{
        console.log('[INFO] Failed! Sorry :(');
    }
}

// search 1
async function doSearch(){
    // search params
    argv['search-locale'] = argv['search-locale'].replace(/-/, '');
    const params = new URLSearchParams({
        q: argv.search,
        clases: 'series',
        media_types: 'anime',
        fields: 'series.series_id,series.name,series.year',
        offset: argv.p ? ( parseInt(argv.p) - 1 ) * 100 : 0,
        limit: 100,
        locale: argv['search-locale'] ? argv['search-locale'] : 'enUS',
    });
    // session
    if(
        req.session.session_id
        && req.checkSessId(req.session.session_id)
        && req.session.session_id.value
        && !req.argv.nosess
    ){
        params.append('session_id', req.session.session_id.value);
    }
    else{
        const sessionData = await apiSession();
        if(sessionData == ''){
            return;
        }
        params.append('session_id', sessionData);
    }
    
    const getAniList = await req.getData(`${api.search3}?${params.toString()}`, { useProxy: true });
    if(!getAniList.ok){
        console.log('[ERROR] Can\'t get search data!');
        return;
    }
    
    const aniList = JSON.parse(getAniList.res.body);
    if(aniList.error){
        console.log(`[ERROR] ${aniList.message}`);
        return;
    }
    
    if(aniList.data.length > 0){
        console.log('[INFO] Search Results:');
        for(let a of aniList.data){
            await printSeasons(a, params.get('session_id'));
        }
        console.log(`\n[INFO] Total results: ${aniList.data.length}\n`);
    }
    else{
        console.log('[INFO] Nothing Found!');
    }
    
}

async function printSeasons(a, apiSession){
    console.log(`[SERIES] #${a.series_id} ${a.name}`,(a.year?`(${a.year})`:''));
    // collection params
    const collParams = new URLSearchParams({
        session_id: apiSession,
        series_id:  a.series_id,
        fields:     'collection.collection_id,collection.name',
        limit:      5000,
        offset:     0,
        locale:     argv['search-locale'] ? argv['search-locale'] : 'enUS',
    });
    const seasonListReq = await req.getData(`${api.collections}?${collParams.toString()}`,{useProxy:true});
    if(seasonListReq.ok){
        const seasonList = JSON.parse(seasonListReq.res.body);
        if(seasonList.error){
            console.log(`  [ERROR] Can't fetch seasons list: ${seasonList.message}`);
        }
        else{
            if(seasonList.data.length>0){
                for(const s of seasonList.data){
                    console.log(`  [S:${s.collection_id}] ${s.name}`);
                }
            }
            else{
                console.log('  [ERROR] Seasons list is empty');
            }
        }
    }
    else{
        console.log('  [ERROR] Can\'t fetch seasons list (request failed)');
    }
}

async function doSearch2(){
    // search params
    argv['search-locale'] = argv['search-locale'].replace(/-/, '');
    const params = new URLSearchParams({
        q: argv.search2,
        sp: argv.p ? parseInt(argv.p) - 1 : 0,
        limit: 100,
        st: 'm',
        locale: argv['search-locale'] ? argv['search-locale'] : 'enUS',
    });
    // request
    const reqAniSearch  = await req.getData(`${api.search2}?${params.toString()}`, { useProxy: true });
    if(!reqAniSearch.ok){ return; }
    const reqRefAniList = await req.getData(`${api.search1}`, { useProxy: true });
    if(!reqRefAniList.ok){ return; }
    
    const aniSearchSec  = JSON.parse(reqAniSearch.res.body.replace(/^\/\*-secure-\n(.*)\n\*\/$/,'$1'));
    const aniRefListSec = JSON.parse(reqRefAniList.res.body.replace(/^\/\*-secure-\n(.*)\n\*\/$/,'$1'));
    let totalResults = 0;
    
    const $ = cheerio.load(`<data>${aniSearchSec.data.main_html}</data>`);
    const resultHeader = $('p');
    const resultItems = $('li');
    
    if(resultHeader.length < 1){
        console.log('[INFO] NOTHING FOUND!');
        return;
    }
    
    for(const infoHeader of resultHeader){
        console.log('[INFO]', $(infoHeader).text().trim());
    }
    
    for(const item of resultItems){
        const itemHref = '/' + $(item).find('a').attr('href').split('/').map(e => {
            if(e.match(/^\w{2}(-\w{2})?$/)){
                return '';
            }
            return e;
        }).slice(1).join('/').replace(/^\//, '');
        const itemData = aniRefListSec.data.filter(value => value.link == itemHref).shift();
        const isNotLib = itemHref.match(/\/library\//) ? false : true;
        if(isNotLib && itemData && itemData.type == 'Series'){
            if(req.session.session_id && req.checkSessId(req.session.session_id) && !argv.nosess){
                await printSeasons({ series_id: itemData.id, name: itemData.name }, req.session.session_id.value);
            }
            else{
                console.log('  [ERROR] Can\'t fetch seasons list, session_id cookie required');
            }
            totalResults++;
        }
        if(isNotLib && !itemData){
            console.log('[SERIES] #??????', itemHref.replace(/^\//, '').replace(/-/g, ' '));
            console.log('  [ERROR] Can\'t fetch seasons list, not listed in search data');
            console.log(`  [ERROR] URL: ${domain.www}${itemHref}`);
            totalResults++;
        }
    }
    
    console.log('[INFO] Non-anime results is hidden');
    if(totalResults > 0){
        console.log(`[INFO] Total results: ${totalResults}\n`);
    }
    
}

async function getSeasonById(){
    // request episode list
    const epListRss = `${api.rss_cid}${argv.s}`;
    const epListReq = await req.getData(epListRss, { useProxy: true });
    if(!epListReq.ok){ return; }
    
    const epListBody = epListReq.res.body;
    const $ = cheerio.load(epListBody, {
        normalizeWhitespace: true,
        xmlMode: true
    });
    
    const imageTitle = $('image title').text();
    const rssTitle = $('title').eq(0).text();
    
    const seasonTitle = imageTitle != '' 
        ? imageTitle
        : rssTitle.replace(/ Episodes$/i, '');
    
    let isSimul = $('crunchyroll\\:simulcast').length > 0 ? true : false;
    
    const epsList  = $('item');
    const epsListCount = epsList.length;
    
    // fix simulcast
    if(!isSimul && epsListCount > 1){
        const eps = [
            epsList.eq(0),
            epsList.eq(epsListCount - 1),
        ];
        const epDate = [];
        for(const ep of eps){
            epDate.push(new Date(ep.find('crunchyroll\\:premiumPubDate').text()));
        }
        if(epDate[0] > epDate[1]){
            isSimul = true;
        }
    }
    
    // if dubbed title
    const matchDub = seasonTitle.match(langsData.dubRegExp);
    if(matchDub && langsData.dubLanguages[matchDub[1]] != argv.dub){
        argv.appstore.audDubT = langsData.dubLanguages[matchDub[1]];
        console.log(`[INFO] audio language code detected, setted to ${argv.appstore.audDubT} for this title\n`);
    }
    else{
        argv.appstore.audDubT = argv.dub;
    }
    
    console.log(`[S:${argv.s}] ${seasonTitle}`, (isSimul ? '[SIMULCAST]' : ''));
    console.log('[URL]', epListRss);
    
    const epNumList = { ep: [], sp: 0 };
    const epNumLen = epsFilter.epNumLen;
    const dateNow = Date.now() + 1;
    const endPubDateMax = 253368028800000;
    
    const doEpsFilter = new epsFilter.doFilter();
    const selEps = doEpsFilter.checkFilter(argv.e);
    const selectedMedia = [];
    
    for(let idx in Array(epsListCount).fill()){
        // init
        idx = isSimul ? epsListCount - idx - 1 : idx;
        const epCur = epsList.eq(idx);
        let isSelected = false;
        // set data
        const epMeta = {
            mediaId:       epCur.find('crunchyroll\\:mediaId').text(),
            seasonTitle:   seasonTitle,
            episodeNumber: epCur.find('crunchyroll\\:episodeNumber').text(),
            episodeTitle:  epCur.find('crunchyroll\\:episodeTitle').text(),
        };
        // calc dates
        const epPubDate = {
            prem: new Date(epCur.find('crunchyroll\\:premiumPubDate').text()),
            free: new Date(epCur.find('crunchyroll\\:freePubDate').text()),
            end: new Date(epCur.find('crunchyroll\\:endPubDate').text()),
        };
        epPubDate.premLeft = dateNow < epPubDate.prem ? epPubDate.prem - dateNow : 0;
        epPubDate.freeLeft = dateNow < epPubDate.free ? epPubDate.free - dateNow : 0;
        epPubDate.endLeft  = dateNow < epPubDate.end  ? epPubDate.end  - dateNow : 0;
        if(epPubDate.end.getTime() == endPubDateMax){
            epPubDate.endLeft = -1;
        }
        const epAvailable = epPubDate.premLeft == 0 && epPubDate.endLeft != 0 ? true : false;
        // check media selected
        const mediaIdPad = 'M' + epMeta.mediaId.toString().padStart(epNumLen['M'], '0');
        if(selEps.indexOf(mediaIdPad) > -1 && epAvailable){
            selectedMedia.push(epMeta);
            isSelected = true;
        }
        // find episode numbers
        let epNum = epMeta.episodeNumber;
        let isSpecial = false;
        if(!epNum.match(/^\d+$/) || epNumList.ep.indexOf(parseInt(epNum, 10)) > -1){
            isSpecial = true;
            epNumList.sp++;
        }
        else{
            epNumList.ep.push(parseInt(epNum, 10));
        }
        const selEpId = (
            isSpecial 
                ? 'S' + epNumList.sp.toString().padStart(epNumLen['S'], '0')
                : ''  + parseInt(epNum, 10).toString().padStart(epNumLen['E'], '0')
        );
        // select episode
        if(selEps.indexOf(selEpId) > -1 && !isSelected && epAvailable){
            selectedMedia.push(epMeta);
            isSelected = true;
        }
        // print info
        const listEpTitle = [
            epMeta.episodeNumber ? epMeta.episodeNumber : '',
            epMeta.episodeNumber && epMeta.episodeTitle ? ' - ' : '',
            epMeta.episodeTitle ? epMeta.episodeTitle : ''
        ].join('');
        const premStar = epPubDate.premLeft == 0 && epPubDate.freeLeft > 0 ? '☆ ' : '';
        const rssSubsStr = epCur.find('crunchyroll\\:subtitleLanguages').text();
        // show episode
        console.log(
            ' %s[%s|%s] %s%s',
            isSelected ? '✓' : ' ',
            selEpId,
            mediaIdPad,
            premStar,
            listEpTitle,
        );
        if(epPubDate.premLeft > 0){
            console.log(`   - PremPubDate: ${shlp.dateString(epPubDate.prem)} (in ${shlp.formatTime((epPubDate.premLeft)/1000)})`);
        }
        if(epPubDate.freeLeft > 0){
            console.log(`   - FreePubDate: ${shlp.dateString(epPubDate.free)} (in ${shlp.formatTime((epPubDate.freeLeft)/1000)})`);
        }
        if(epPubDate.endLeft != -1){
            const endedIn = epPubDate.endLeft > 0 ? ` (in ${shlp.formatTime((epPubDate.endLeft)/1000)})` : '';
            console.log('   - EndPubDate:  %s%s', shlp.dateString(epPubDate.end), endedIn);
        }
        if(rssSubsStr != ''){
            console.log('   - Subtitles:', langsData.parseRssSubtitlesString(rssSubsStr));
        }
    }
    
    if(selectedMedia.length < 1){
        console.log('\n[INFO] Videos not selected!\n');
        return;
    }
    
    argv.appstore.isBatch = selectedMedia.length > 1 ? true : false;
    
    console.log();
    for(const m of selectedMedia){
        argv.dub = argv.appstore.audDubT;
        await getMedia(m);
    }
    
}

async function getMediaById(){
    // default
    const doEpsFilter = new epsFilter.doFilter();
    const inpMedia = doEpsFilter.checkMediaFilter(argv.e);
    if(inpMedia.length > 0){
        console.log('[INFO] Selected media:', inpMedia.join(', '), '\n');
        for(let id of inpMedia){
            await getMedia({ mediaId: id });
        }
    }
    else{
        console.log('[INFO] Media not selected!');
    }
}


async function getMedia(mMeta){
    
    let mediaName = '...';
    if(mMeta.seasonTitle && mMeta.episodeNumber && mMeta.episodeTitle){
        mediaName = `${mMeta.seasonTitle} - ${mMeta.episodeNumber} - ${mMeta.episodeTitle}`;
    }
    
    console.log(`[INFO] Requesting: [${mMeta.mediaId}] ${mediaName}\n`);
    
    argv['page-locale'] = argv['page-locale'].replace(/-/, '');
    
    const pageQs = new URLSearchParams({
        skip_wall: 1,
    });
    
    if(argv['page-locale'] != ''){
        pageQs.set('locale', argv['page-locale']);
    }
    
    const epUrl = `${api.media_page}${mMeta.mediaId}?${pageQs.toString()}`;
    const mediaPage = await req.getData(epUrl, { useProxy: true });
    if(!mediaPage.ok){
        console.log('[ERROR] Failed to get video page!');
        return;
    }
    
    // page msgs
    let msgItems = mediaPage.res.body.match(/Page.messaging_box_controller.addItems\((.*)\);/);
    msgItems = msgItems ? JSON.parse(msgItems[1]) : [];
    msgItems.map(m => {
        m.type = m.type.toUpperCase();
        return m;
    });
    let msgHasErrors = msgItems.filter(m => m.type == 'ERROR').length > 0 ? true : false;
    if(msgItems.length > 0 && argv.pagemsgs || msgItems && msgHasErrors){
        let msgItemsArr = [];
        console.log('[INFO] PAGE MSGs:');
        for(let m of msgItems){
            m.type = typeof m.type == 'string' ? m.type : 'MSG';
            m.message_body = typeof m.message_body == 'string' ? m.message_body : 'Empty message';
            msgItemsArr.push(`  [${m.type}] ${m.message_body.replace(/<[^>]*>?/gm, '')}`);
        }
        msgItemsArr = [...new Set(msgItemsArr)];
        console.log(msgItemsArr.join('\n'), '\n');
    }
    // --
    
        
    const contextData = mediaPage.res.body.match(/({"@context":.*)(<\/script>)/);
    
    if(!contextData){
        console.log('[ERROR] Something goes wrong...');
        if(new URL(mediaPage.res.url).origin == domain.www_beta){
            await optOutBeta();
            process.exit(1);
        }
        return;
    }
    
    const contextJson = JSON.parse(contextData[1]);
    const eligibleRegion = contextJson.potentialAction
        .actionAccessibilityRequirement.eligibleRegion;
    
    const $ = cheerio.load(mediaPage.res.body, {
        normalizeWhitespace: true,
    });
    
    const flagEl = $('#footer_country_flag');
    
    const ccLoc = {
        code: flagEl.attr('src').split('/').slice(-1)[0].split('.')[0].toUpperCase(),
        name: flagEl.attr('alt'),
    };
    
    console.log('[INFO] Your region:', ccLoc.code, ccLoc.name);
    
    const userDetect = mediaPage.res.body.match(/\$\.extend\(traits, (.*)\);/);
    const curUser = userDetect ? JSON.parse(userDetect[1]) : { 'username': 'anonymous' };
    console.log('[INFO] Your account:', curUser.username, '\n');
    
    const availDetect = eligibleRegion.filter((r) => { return r.name == ccLoc.user; });
    const isAvailVideo = availDetect.length > 0 ? true : false;
    
    let mediaData = mediaPage.res.body.match(/vilos.config.media = \{(.*)\};/);
    if(!mediaData && !isAvailVideo){
        console.log('[ERROR] VIDEO NOT AVAILABLE FOR YOUR REGION!');
        return;
    }
    else if(!mediaData){
        console.log('[ERROR] CAN\'T DETECT VIDEO INFO / PREMIUM LOCKED FOR YOUR REGION?');
        return;
    }
    else{
        mediaData = mediaData[1];
        mediaData = JSON.parse(`{${mediaData}}`);
        if(argv.debug){
            console.log('[DEBUG]', contextJson);
            console.log('[DEBUG]', mediaData);
        }
    }
    
    if(mediaName == '...'){
        mMeta.seasonTitle   = mMeta.seasonTitle   ? mMeta.seasonTitle   : contextJson.partOfSeason.name;
        mMeta.episodeNumber = mMeta.episodeNumber ? mMeta.episodeNumber : mediaData.metadata.episode_number;
        mMeta.episodeTitle  = mMeta.episodeTitle  ? mMeta.episodeTitle  : mediaData.metadata.title;
        // show name
        mediaName = `${mMeta.seasonTitle} - ${mMeta.episodeNumber} - ${mMeta.episodeTitle}`;
        console.log('[INFO] Requested: [%s] %s\n', mMeta.mediaId, mediaName);
    }
    
    let epNum = mediaData.metadata.episode_number ? mediaData.metadata.episode_number : mMeta.episodeNumber;
    if(epNum != '' && epNum !== null){
        epNum = epNum.match(/^\d+$/) ? epNum.padStart(argv.el, '0') : epNum;
    }
    
    argv.appstore.fn = {};
    argv.appstore.fn.title = argv.t ? argv.t : mMeta.seasonTitle,
    argv.appstore.fn.epnum = !argv.appstore.isBatch && argv.ep ? argv.ep : epNum;
    argv.appstore.fn.epttl = mMeta.episodeTitle;
    argv.appstore.fn.out   = fnOutputGen();
    
    let streams = mediaData.streams ? mediaData.streams : [];
    let hsLangs = [];
    
    if(streams.length < 1){
        console.log('[WARN] No streams found!');
        return;
    }
    
    streams = streams.filter((s) => {
        if(!s.format.match(/hls/) || s.format.match(/drm/) || s.format.match(/trailer/)){
            return false;
        }
        s.hardsub_lang = s.hardsub_lang 
            ? langsData.fixAndFindCrLC(s.hardsub_lang).locale
            : s.hardsub_lang;
        if(s.hardsub_lang && hsLangs.indexOf(s.hardsub_lang) < 0){
            hsLangs.push(s.hardsub_lang);
        }
        return true;
    });
    
    if(streams.length < 1 && contextJson.potentialAction.actionAccessibilityRequirement.category == 'subscription'){
        console.log('[WARN] No full streams found! Premium locked!');
        return;
    }
    
    if(streams.length < 1){
        console.log('[WARN] No full streams found!');
        return;
    }
    
    hsLangs = langsData.sortTags(hsLangs);
    
    streams = streams.map((s) => {
        s.audio_lang = langsData.findLang(langsData.fixLanguageTag(s.audio_lang)).code;
        s.hardsub_lang = s.hardsub_lang ? s.hardsub_lang : '-';
        s.type = `${s.format}/${s.audio_lang}/${s.hardsub_lang}`;
        return s;
    });
    
    let dlFailed = false;
    
    if(argv.hslang != 'none'){
        if(hsLangs.indexOf(argv.hslang) > -1){
            console.log('[INFO] Selecting stream with %s hardsubs', argv.hslang);
            streams = streams.filter((s) => {
                if(s.hardsub_lang == '-'){
                    return false;
                }
                return s.hardsub_lang == argv.hslang ? true : false;
            });
        }
        else{
            console.log('[WARN] Selected stream with %s hardsubs not available', argv.hslang);
            if(hsLangs.length > 0){
                console.log('[WARN] Try other hardsubs stream:', hsLangs.join(', '));
            }
            dlFailed = true;
        }
    }
    else{
        streams = streams.filter((s) => {
            if(s.hardsub_lang != '-'){
                return false;
            }
            return true;
        });
        if(streams.length < 1){
            console.log('[WARN] Raw streams not available!');
            if(hsLangs.length > 0){
                console.log('[WARN] Try hardsubs stream:', hsLangs.join(', '));
            }
            dlFailed = true;
        }
        console.log('[INFO] Selecting raw stream');
    }
    
    let curStream;
    if(!dlFailed){
        argv.kstream = typeof argv.kstream == 'number' ? argv.kstream : 1;
        argv.kstream = argv.kstream > streams.length ? 1 : argv.kstream;
        
        streams.map((s, i) => {
            const isSelected = argv.kstream == i + 1 ? '✓' : ' ';
            console.log('[INFO] Full stream found! (%s%s: %s )', isSelected, i + 1, s.type); 
        });
        
        console.log('[INFO] Downloading video...');
        curStream = streams[argv.kstream-1];
        
        if(argv.dub != curStream.audio_lang){
            argv.dub = curStream.audio_lang;
            console.log(`[INFO] audio language code detected, setted to ${curStream.audio_lang} for this episode`);
        }
        
        const streamUrlTxt = argv['show-stream-url'] ? curStream.url : '[HIDDEN]';
        console.log('[INFO] Playlists URL: %s (%s)', streamUrlTxt, curStream.type);
    }
    
    if(!argv.skipdl && !dlFailed){
        const streamPlaylistsReq = await req.getData(curStream.url, {useProxy: argv['use-proxy-streaming']});
        if(!streamPlaylistsReq.ok){
            console.log('[ERROR] CAN\'T FETCH VIDEO PLAYLISTS!');
            dlFailed = true;
        }
        else{
            const streamPlaylists = m3u8(streamPlaylistsReq.res.body);
            let plServerList = [],
                plStreams    = {},
                plQualityStr = [],
                plMaxQuality = 240;
            for(const pl of streamPlaylists.playlists){
                // set quality
                let plResolution     = pl.attributes.RESOLUTION.height;
                let plResolutionText = `${plResolution}p`;
                // set max quality
                plMaxQuality = plMaxQuality < plResolution ? plResolution : plMaxQuality;
                // parse uri
                let plUri = new URL(pl.uri);
                let plServer = plUri.hostname;
                // set server list
                if(plUri.searchParams.get('cdn')){
                    plServer += ` (${plUri.searchParams.get('cdn')})`;
                }
                if(!plServerList.includes(plServer)){
                    plServerList.push(plServer);
                }
                // add to server
                if(!Object.keys(plStreams).includes(plServer)){
                    plStreams[plServer] = {};
                }
                if(
                    plStreams[plServer][plResolutionText]
                    && plStreams[plServer][plResolutionText] != pl.uri
                    && typeof plStreams[plServer][plResolutionText] != 'undefined'
                ){
                    console.log(`[WARN] Non duplicate url for ${plServer} detected, please report to developer!`);
                }
                else{
                    plStreams[plServer][plResolutionText] = pl.uri;
                }
                // set plQualityStr
                let plBandwidth  = Math.round(pl.attributes.BANDWIDTH/1024);
                if(plResolution < 1000){
                    plResolution = plResolution.toString().padStart(4, ' ');
                }
                let qualityStrAdd   = `${plResolution}p (${plBandwidth}KiB/s)`;
                let qualityStrRegx  = new RegExp(qualityStrAdd.replace(/(:|\(|\)|\/)/g, '\\$1'), 'm');
                let qualityStrMatch = !plQualityStr.join('\r\n').match(qualityStrRegx);
                if(qualityStrMatch){
                    plQualityStr.push(qualityStrAdd);
                }
            }
            
            argv.x = argv.x > plServerList.length ? 1 : argv.x;
            argv.q = argv.q == 'max' ? `${plMaxQuality}p` : argv.q;
            argv.appstore.fn.out = fnOutputGen();
            
            let plSelectedServer = plServerList[argv.x - 1];
            let plSelectedList   = plStreams[plSelectedServer];
            let selPlUrl = plSelectedList[argv.q] ? plSelectedList[argv.q] : '';
            
            plQualityStr.sort();
            console.log(`[INFO] Servers available:\n\t${plServerList.join('\n\t')}`);
            console.log(`[INFO] Available qualities:\n\t${plQualityStr.join('\n\t')}`);
            
            if(selPlUrl != ''){
                console.log(`[INFO] Selected quality: ${argv.q} @ ${plSelectedServer}`);
                if(argv['show-stream-url']){
                    console.log('[INFO] Stream URL:', selPlUrl);
                }
                console.log(`[INFO] Output filename: ${argv.appstore.fn.out}`);
                const chunkPage = await req.getData(selPlUrl, {useProxy: argv['use-proxy-streaming']});
                if(!chunkPage.ok){
                    console.log('[ERROR] CAN\'T FETCH VIDEO PLAYLIST!');
                    dlFailed = true;
                }
                else{
                    const chunkPlaylist = m3u8(chunkPage.res.body);
                    let proxyHLS;
                    if(argv.proxy && argv['use-proxy-streaming']){
                        try{
                            proxyHLS = {};
                            proxyHLS.url = reqModule.buildProxy(argv.proxy, argv['proxy-auth']);
                            proxyHLS.url = proxyHLS.url.toString();
                        }
                        catch(e){
                            console.log(`\n[WARN] Not valid proxy URL${e.input?' ('+e.input+')':''}!`);
                            console.log('[WARN] Skiping...');
                        }
                    }
                    let totalParts = chunkPlaylist.segments.length;
                    let mathParts  = Math.ceil(totalParts / argv.tsparts);
                    let mathMsg    = `(${mathParts}*${argv.tsparts})`;
                    console.log('[INFO] Total parts in stream:', totalParts, mathMsg);
                    let tsFile = path.join(cfg.dir.content, argv.appstore.fn.out);
                    let streamdlParams = {
                        fn: `${tsFile}.ts`,
                        m3u8json: chunkPlaylist,
                        // baseurl: chunkPlaylist.baseUrl,
                        pcount: argv.tsparts,
                        partsOffset: 0,
                        proxy: proxyHLS || false,
                    };
                    let dlStreamByPl = await new streamdl(streamdlParams).download();
                    if(!dlStreamByPl.ok){
                        fs.writeFileSync(`${tsFile}.ts.resume`, JSON.stringify(dlStreamByPl.parts));
                        console.log(`[ERROR] DL Stats: ${JSON.stringify(dlStreamByPl.parts)}\n`);
                        dlFailed = true;
                    }
                    else if(fs.existsSync(`${tsFile}.ts.resume`) && dlStreamByPl.ok){
                        fs.unlinkSync(`${tsFile}.ts.resume`);
                    }
                }
            }
            else{
                console.log('[ERROR] Quality not selected!\n');
                dlFailed = true;
            }
        }
    }
    else if(argv.skipdl){
        console.log('[INFO] Downloading skipped!');
    }
    
    // fix max quality for non streams
    if(argv.q == 'max'){
        argv.q = '1080p';
        argv.appstore.fn.out = fnOutputGen();
    }
    
    argv.appstore.sxList = [];
    
    if(argv.dlsubs.indexOf('all') > -1){
        argv.dlsubs = ['all'];
    }
    
    if(!argv.skipsubs && argv.dlsubs.indexOf('none') == -1){
        if(mediaData.subtitles && mediaData.subtitles.length > 0){
            mediaData.subtitles = mediaData.subtitles.map((s) => {
                const subLang = langsData.fixAndFindCrLC(s.language);
                s.locale = subLang;
                s.language = subLang.locale;
                s.title = subLang.language;
                return s;
            });
            const subsArr = langsData.sortSubtitles(mediaData.subtitles, 'language');
            for(let subsIndex in subsArr){
                const subsItem = subsArr[subsIndex];
                const langItem = subsItem.locale;
                const sxData = {};
                sxData.language = langItem;
                sxData.file = langsData.subsFile(argv.appstore.fn.out, subsIndex, langItem);
                sxData.path = path.join(cfg.dir.content, sxData.file);
                if(argv.dlsubs.includes('all') || argv.dlsubs.includes(langItem.locale)){
                    const subsAssReq = await req.getData(subsItem.url, {useProxy:  argv['use-proxy-streaming']});
                    if(subsAssReq.ok){
                        const sBody = '\ufeff' + subsAssReq.res.body;
                        sxData.title = sBody.split('\r\n')[1].replace(/^Title: /, '');
                        sxData.title = `${langItem.language} / ${sxData.title}`;
                        sxData.fonts = fontsData.assFonts(sBody);
                        fs.writeFileSync(path.join(cfg.dir.content, sxData.file), sBody);
                        console.log(`[INFO] Subtitle downloaded: ${sxData.file}`);
                        argv.appstore.sxList.push(sxData);
                    }
                    else{
                        console.log(`[WARN] Failed to download subtitle: ${sxData.file}`);
                    }
                }
            }
        }
        else{
            console.log('[WARN] Can\'t find urls for subtitles!');
        }
    }
    else{
        console.log('[INFO] Subtitles downloading skipped!');
    }
    
    // go to muxing
    if(!argv.skipmux && !dlFailed){
        await muxStreams();
    }
    else{
        console.log();
    }
    
}

async function muxStreams(){
    const merger = await appMux.checkMerger(cfg.bin, argv.mp4);
    const muxFile = path.join(cfg.dir.content, argv.appstore.fn.out);
    const sxList = argv.appstore.sxList;
    const audioDub = argv.dub;
    const addSubs = argv.mks && sxList.length > 0 ? true : false;
    // set vars
    let ftag = shlp.cleanupFilename((typeof argv.ftag != 'undefined' ? argv.ftag : argv.a).toString());
    let setMainSubLang = argv.defsublang != 'none' ? argv.defsublang : false;
    let isMuxed = false;
    // skip if no ts
    if(!appMux.checkTSFile(`${muxFile}.ts`)){
        console.log('[INFO] TS file not found, skip muxing video...\n');
        return;
    }
    // collect fonts info
    const fontList = appMux.makeFontsList(cfg.dir.fonts, fontsData, sxList);
    // mergers
    if(!argv.mp4 && !merger.MKVmerge){
        console.log('[WARN] MKVMerge not found...');
    }
    if(!merger.MKVmerge && !merger.FFmpeg || argv.mp4 && !merger.MKVmerge){
        console.log('[WARN] FFmpeg not found...');
    }
    // do mkvmerge
    if(!argv.mp4 && merger.MKVmerge){
        const mkvmux = await appMux.buildCommandMkvMerge(muxFile, sxList, fontList, {
            audioDub, addSubs, ftag, setMainSubLang, useBCP: argv.bcp,
        });
        fs.writeFileSync(`${muxFile}.json`,JSON.stringify(mkvmux, null, '  '));
        try{
            shlp.exec('mkvmerge', `"${merger.MKVmerge}"`, `@"${muxFile}.json"`);
            isMuxed = true;
        }
        catch(e){
            // okay..
        }
    }
    else if(merger.FFmpeg){
        const outputFormat = !argv.mp4 ? 'mkv' : 'mp4';
        const subsCodec = !argv.mp4 ? 'copy' : 'mov_text';
        const ffmux = await appMux.buildCommandFFmpeg(muxFile, sxList, fontList, {
            outputFormat, audioDub, addSubs, subsCodec, ftag, setMainSubLang,
        });
        try{ 
            shlp.exec('ffmpeg',`"${merger.FFmpeg}"`, ffmux);
            isMuxed = true;
        }
        catch(e){
            // okay...
        }
        
    }
    else{
        console.log('\n[INFO] Done!\n');
        return;
    }
    
    doCleanUp(isMuxed, muxFile, addSubs, sxList);
    
}

function doCleanUp(isMuxed, muxFile, addSubs, sxList){
    // set output filename
    const fnOut = argv.appstore.fn.out;
    // check paths if same
    if(path.join(cfg.dir.trash) == path.join(cfg.dir.content)){
        argv.notrashfolder = true;
    }
    if(argv.nocleanup && !fs.existsSync(cfg.dir.trash)){
        argv.notrashfolder = true;
    }
    // cleanup
    if(argv.notrashfolder && argv.nocleanup){
        // don't move or delete temp files
    }
    else if(argv.nocleanup){
        if(isMuxed){
            const toTrashTS = path.join(cfg.dir.trash, `${fnOut}`);
            fs.renameSync(`${muxFile}.ts`, toTrashTS + '.ts');
            if(fs.existsSync(`${muxFile}.json`) && !argv.jsonmuxdebug){
                fs.renameSync(`${muxFile}.json`, toTrashTS + '.json');
            }
            if(addSubs){
                for(let t of sxList){
                    let subsFile  = path.join(cfg.dir.content, t.file);
                    let subsTrash = path.join(cfg.dir.trash, t.file);
                    fs.renameSync(subsFile, subsTrash);
                }
            }
        }
    }
    else if(isMuxed){
        fs.unlinkSync(`${muxFile}.ts`);
        if(fs.existsSync(`${muxFile}.json`) && !argv.jsonmuxdebug){
            fs.unlinkSync(`${muxFile}.json`);
        }
        if(addSubs){
            for(let t of sxList){
                let subsFile = path.join(cfg.dir.content, t.file);
                fs.unlinkSync(subsFile);
            }
        }
    }
    // move to subfolder
    if(argv.folder && isMuxed){
        const dubName = argv.dub.toUpperCase().slice(0, -1);
        const dubSuffix = argv.dub != 'jpn' ? ` [${dubName}DUB]` : '';
        const titleFolder = shlp.cleanupFilename(argv.appstore.fn.title + dubSuffix);
        const subFolder = path.join(cfg.dir.content, '/', titleFolder, '/');
        const vExt = '.' + ( !argv.mp4 ? 'mkv' : 'mp4' );
        if(!fs.existsSync(subFolder)){
            fs.mkdirSync(subFolder);
        }
        fs.renameSync(muxFile + vExt, path.join(subFolder, fnOut + vExt));
    }
    // done
    console.log('\n[INFO] Done!\n');
}

function fnOutputGen(){
    if(typeof argv.appstore.fn != 'object'){
        argv.appstore.fn = {};
    }
    const fnPrepOutput = argv.filename.toString()
        .replace('{rel_group}', argv.a)
        .replace('{title}',     argv.appstore.fn.title)
        .replace('{ep_num}',    argv.appstore.fn.epnum)
        .replace('{ep_titl}',   argv.appstore.fn.epttl)
        .replace('{suffix}',    argv.suffix.replace('SIZEp', argv.q));
    return shlp.cleanupFilename(fnPrepOutput);
}
