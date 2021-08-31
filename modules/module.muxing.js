// muxing only modules
const fs = require('fs');
const path = require('path');
const { lookpath } = require('lookpath');

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
const checkMerger = async (binFolder, useMP4format) => {
    const merger = {
        MKVmerge: await lookpath(path.join(binFolder.mkvmerge)),
        FFmpeg: await lookpath(path.join(binFolder.ffmpeg)),
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
    let fontsNameList = [], fontsList = [];
    for(const s of subs){
        fontsNameList.push(...s.fonts);
    }
    fontsNameList = [...new Set(fontsNameList)];
    if(fontsNameList.length > 0){
        console.log('\n[INFO] Required fonts (%s): %s', fontsNameList.length, fontsNameList.join(', '));
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
    mkvmux.push('--track-name',`0:[${options.ftag}]`);
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
            if(options.setMainSubLang && t.locale == options.setMainSubLang) {
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
    ffmux.push('-metadata:s:v:0', `"title=[${toSaveStr(options.ftag)}]"`);
    ffmux.push('-metadata:s:a:0', `"language=${options.audioDub}"`);
    ffmux.push(...ffmeta);
    // output file
    ffmux.push(`"${video}.${options.outputFormat}"`);
    // end
    return ffmux.join(' ');
};

function toSaveStr(str){
    return str.replace(/"|'/g, '’');
}

module.exports = {
    checkTSFile,
    checkMerger,
    makeFontsList,
    buildCommandMkvMerge,
    buildCommandFFmpeg,
};
