# Crunchyroll Downloader NX

Crunchyroll Downloader NX is capable of downloading videos from the *Crunchyroll* streaming service.

## Legal Warning

This application is not endorsed by or affiliated with *Crunchyroll*. This application enables you to download videos for offline viewing which may be forbidden by law in your country. The usage of this application may also cause a violation of the *Terms of Service* between you and the stream provider. This tool is not responsible for your actions; please make an informed decision before using this application.

## Prerequisites

* ffmpeg >= 4.x (https://www.videohelp.com/software/ffmpeg)
* MKVToolNix >= 60.x (https://www.videohelp.com/software/MKVToolNix)
* NodeJS >= 14.x (https://nodejs.org/) (Not needed for binary version)
* NPM >= 7.x (https://www.npmjs.org/) (Not needed for binary version)

### Paths Configuration

By default this application uses the following paths to programs (main executables) or from PATH system variable:
* `./bin/mkvtoolnix/mkvmerge[.exe]`
* `./bin/ffmpeg/ffmpeg[.exe]`

To change these paths you need to edit `yml` file in `./config/` directory.

### Node Modules (Only for source code)

After installing NodeJS with NPM go to directory with `package.json` file and type: `npm i`.
* [check dependencies](https://david-dm.org/anidl/crunchyroll-downloader-nx)

## CLI Options & CLI Examples

* use `--help` option to see all available options

## Load custom cookies to application

Put your `cookies.txt` file to `config` folder
application will overwrite your cookie with txt file
