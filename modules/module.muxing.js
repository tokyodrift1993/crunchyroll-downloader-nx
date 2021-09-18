// muxing only modules
const fs = require('fs-extra');
const path = require('path');
const langsData = require('./module.langsData');

// check if ts file exists
const checkTSFile = (file) => {
    if(!fs.existsSync(file) || fs.existsSync(file) && fs.statSync(file).size == 0){
        return false;
    }
    else{
        return true;
    }
};

// check mergers programs
const checkMerger = (bin, useMP4format) => {
    const merger = {
        MKVmerge: bin.mkvmerge,
        FFmpeg: bin.ffmpeg,
    };
    if( !useMP4format && !merger.MKVmerge ){
        console.log('[WARN] MKVMerge not found, skip using this...');
        merger.MKVmerge = false;
    }
    if( !merger.MKVmerge && !merger.FFmpeg || useMP4format && !merger.FFmpeg ){
        console.log('[WARN] FFmpeg not found, skip using this...');
        merger.FFmpeg = false;
    }
    return merger;
};

const makeFontsList = (fontsDir, fontsData, subs) => {
    let fontsNameList = [], fontsList = [], subsList = [], isNstr = true;
    for(const s of subs){
        fontsNameList.push(...s.fonts);
        subsList.push(s.language.locale);
    }
    fontsNameList = [...new Set(fontsNameList)];
    if(subsList.length > 0){
        console.log('\n[INFO] Subtitles: %s (Total: %s)', subsList.join(', '), subsList.length);
        isNstr = false;
    }
    if(fontsNameList.length > 0){
        console.log((isNstr ? '\n' : '') + '[INFO] Required fonts: %s (Total: %s)', fontsNameList.join(', '), fontsNameList.length);
    }
    for(const f of fontsNameList){
        const fontFile = fontsData.fonts[f];
        if(fontFile){
            const fontPath = path.join(fontsDir, fontFile);
            const fontMime = fontsData.fontMime(fontFile);
            if(fs.existsSync(fontPath) && fs.statSync(fontPath).size != 0){
                fontsList.push({
                    name: fontFile,
                    path: fontPath,
                    mime: fontMime,
                });
            }
        }
    }
    return fontsList;
};

const buildCommandMkvMerge = (video, subtitles, fonts, options) => {
    const mkvmux = [];
    // defaults
    mkvmux.push('--output', `${video}.mkv`);
    mkvmux.push('--no-date', '--disable-track-statistics-tags', '--engage', 'no_variable_data');
    // video
    mkvmux.push('--track-name',`0:${options.vtag}`);
    if(options.vlang != 'und'){
        const vlang = options.useBCP ? options.vlang : bcp2code(options.vlang);
        mkvmux.push('--language',`0:${vlang}`);
    }
    mkvmux.push('--track-name',`1:${code2lang(options.audioDub)}`);
    mkvmux.push('--language',`1:${options.audioDub}`);
    mkvmux.push('--video-tracks','0','--audio-tracks','1');
    mkvmux.push('--no-subtitles','--no-attachments');
    mkvmux.push(`${video}.ts`);
    // subtitles and fonts
    if(options.addSubs){
        for(const t of subtitles){
            const langArg = options.useBCP ? t.language.locale : t.language.code;
            mkvmux.push('--track-name', `0:${t.title}`);
            mkvmux.push('--language', `0:${langArg}`);
            if(options.setMainSubLang && t.language.locale == options.setMainSubLang) {
                console.log(`[INFO] Set default subtitle language to: ${t.title}`);
                mkvmux.push('--default-track', '0:yes');
                options.setMainSubLang = false;
            }
            mkvmux.push(t.path);
        }
        if(fonts.length > 0){
            for(let f of fonts){
                mkvmux.push('--attachment-name', f.name);
                mkvmux.push('--attachment-mime-type', f.mime);
                mkvmux.push('--attach-file', f.path);
            }
        }
    }
    // end
    return mkvmux;
};

const buildCommandFFmpeg = (video, subtitles, fonts, options) => {
    // set arguments containers
    const ffmux  = [], ffmap = [], ffmeta = [];
    // init
    ffmux.push('-hide_banner');
    ffmux.push('-i', `"${video}.ts"`);
    // subtitles
    if(options.addSubs){
        let trackIndex = 0;
        for(const t of subtitles){
            ffmux.push('-i',`"${t.path}"`);
            ffmap.push(`-map ${trackIndex+1}:0`, `-c:s:${trackIndex}`, options.subsCodec);
            ffmeta.push(`-metadata:s:s:${trackIndex}`,`"language=${t.language.code}"`);
            ffmeta.push(`-metadata:s:s:${trackIndex}`,`"title=${toSaveStr(t.title)}"`);
            trackIndex++;
        }
    }
    // video
    ffmux.push('-map 0:0 -c:v copy');
    ffmux.push('-map 0:1 -c:a copy');
    ffmux.push(...ffmap);
    // add fonts
    if(options.addSubs && options.outputFormat == 'mkv' && fonts.length > 0){
        let attIndex = 0;
        for(const f of fonts){
            ffmux.push('-attach',`"${f.path}"`);
            ffmeta.push(`-metadata:s:t:${attIndex}`,`"mimetype=${f.mime}"`);
            ffmeta.push(`-metadata:s:t:${attIndex}`,`"filename=${f.name}"`);
            attIndex++;
        }
    }
    // additional data
    ffmux.push('-metadata', '"encoding_tool=no_variable_data"');
    ffmux.push('-metadata:s:v:0', `"title=${toSaveStr(options.vtag)}"`);
    if(options.vlang != 'und'){
        const vlang = bcp2code(options.vlang);
        ffmux.push('-metadata:s:v:0', `"language=${vlang}"`);
    }
    ffmux.push('-metadata:s:a:0', `"title=${code2lang(options.audioDub)}"`);
    ffmux.push('-metadata:s:a:0', `"language=${options.audioDub}"`);
    ffmux.push(...ffmeta);
    // output file
    ffmux.push(`"${video}.${options.outputFormat}"`);
    // end
    return ffmux.join(' ');
};

function constructVideoTag(vtag, gtag, hslang){
    vtag = vtag != '' ? vtag : gtag;
    vtag = vtag == '' ? 'CR' : vtag;
    vtag = `[${vtag}]`;
    if(hslang != 'none'){
        vtag = vtag + ' / ' + langsData.locale2language(hslang).language;
    }
    return vtag;
}

function bcp2code(vlang){
    return langsData.locale2language(vlang).code;
}

function code2lang(code){
    return langsData.langCode2name(code);
}

function toSaveStr(str){
    return str.replace(/"/g, '\'\'');
}

module.exports = {
    checkTSFile,
    checkMerger,
    makeFontsList,
    buildCommandMkvMerge,
    buildCommandFFmpeg,
    constructVideoTag,
};
