const Canvas = require('canvas-prebuilt');
const gulp = require('gulp');
const async = require('async');
const mkdirp = require('mkdirp');
const gulpFileProcess = require('gulp-file-process');
const path = require('path');
const fs = require('fs');
const Image = Canvas.Image

function isFullScreenVideo(width, height) {
  return ((width === 320 || width === 336) && height === 200)
    || (width === 640 && height === 400);
}

function atlasConcat(originalGameDbDir, location, fileName, original, atlasInfo, audioFile) {
  return new Promise((resolve, reject) => {
    let atlasDetails;

    fs.readdir(location, function(err, files) {
      // if (files.length > 100) {
      //   return async.map(files.map(file => path.join(location, file)), fs.unlink, (err) => {
      //     if (err) return reject(err);
      //     const inFile = fs.createReadStream(path.join(originalGameDbDir, original))
      //     resolve();
      //   });
      // }
      async.map(files.filter(f => f.indexOf('.png') !== -1), (file, cb) => {
        const inputImgFile = path.join(location, file);
        fs.readFile(inputImgFile, (err, imgData) => {
          if (err) return cb(err);
          const img = new Image;
          async.series([
            imgLoadedCb => {
              img.onload = () => imgLoadedCb(null);
              img.onerror = imgLoadedCb;
              img.src = imgData;
            },
            imgDelCb => {
              fs.unlink(inputImgFile, (err) => {
                if (err) return reject(err);
                imgDelCb(null);
              });
            }
          ], err => {
            if (err) return cb(err);
            cb(null, img)
          });
        });
      }, (err, imgs) => {
        if (err) return reject(err);
        const width = imgs[0].width;
        const height = imgs[0].height;
        const dimensions = Math.ceil(Math.sqrt(imgs.length));
        const gameDbLoc = original.indexOf('GameD');
        const baseName = path.basename(fileName);
        const fileNameLocation = original.indexOf(baseName);
        const gameFileName = `${original.slice(gameDbLoc, fileNameLocation)}${baseName}`;
        fs.access(audioFile, (err) => {
          let audioFileExists = true;
          function process() {
            if (!atlasDetails) {
              atlasDetails = {
                width,
                height,
                audio: audioFileExists,
              };
              atlasInfo[gameFileName] = atlasDetails;
              console.log(`Saving ${gameFileName} details ${width} x ${height} which has audio: ${audioFileExists}`);
            }

            if (!(
              // Allow single frame ANI to be parsed
              ((gameFileName.indexOf('ANI') === gameFileName.length - 3) && imgs.length > 1)
              // Don't parse assets with audio, these will stay as movies
              || audioFileExists
              // Full screen assets stay as movies
              || isFullScreenVideo(width, height) && imgs.length > 1)
            ) {
              atlasDetails.atlas = imgs.length > 1;
              if (atlasDetails.atlas) {
                atlasDetails.atlasWidth = dimensions;
              }
              const canvas = new Canvas(width * dimensions, height * dimensions);
              const ctx = canvas.getContext('2d');
              imgs.forEach((img, index) => {
                const row = Math.floor(index / dimensions);
                const col = index % dimensions;
                ctx.drawImage(img, col * width, row * height, width, height);
              });

              const outputFileName = imgs.length > 1 ? `${fileName}.atlas.png` : `${fileName}.png`
              mkdirp(path.dirname(fileName), function (err) {
                if (err) return reject(err);
                const out = fs.createWriteStream(outputFileName, {
                  defaultEncoding: 'binary',
                });
                const stream = canvas.createPNGStream({
                  quality: 80,
                });

                stream.pipe(out);

                stream.on('end', function(){
                  resolve();
                });

                stream.on('error', reject);
              });
            } else {
              atlasDetails.video = true;
              resolve();
            }
          }
          if (err) {
            // there is an audio file
            audioFileExists = false;
            process();
          } else {
            console.log('-----------------> found audio file')
            fs.unlink(audioFile, (err) => {
              if (err) return reject (err);
              process();
            })
          }
        });
      });
    });
  });
}

module.exports.atlasConcat = atlasConcat;
