const _ = require('lodash');
const fs = require('fs');
const runSequence = require('run-sequence');
const mkdirp = require('mkdirp');
const gulp = require('gulp');
const gulpFileProcess = require('gulp-file-process');
const path = require('path');
const exec = require('child_process').exec;
const AWS = require('aws-sdk');
const canvas = require('./canvas');
const Promise = require('bluebird');
const morpheusMap = require('./morpheus.map.json');
const mkdirpAsync = Promise.promisify(mkdirp);
const Canvas = require('canvas-prebuilt');
const debugFactory = require('debug');
const Image = Canvas.Image;

Promise.promisifyAll(fs);

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

gulp.task('convert', (done) => {
  runSequence('atlas', 'copy:to:s3', done);
});

gulp.task('copytodb', () => {
  return gulp.src('**/*', { base: 'output/GameDB' })
    .pipe(gulp.dest('../GameDB'));
});

gulp.task('copypanos', () => {
  return gulp.src('**/*PAN.png', { base: 'output/GameDB' })
    .pipe(gulp.dest('../panos'));
});

gulp.task('build:wiki', (done) => {
  const debug = debugFactory('build:wiki');
  const scenes = [];
  const panoramas = [];
  const stills = [];
  const movies = [];
  const sounds = [];
  const comparators = [];
  const gamestates = [];

  function addScene({ type, data }) {
    scenes.push(data);
    if (true) {

    }
  }


  morpheusMap.forEach((morpheus) => {
    const { type, data } = morpheus;
    if (type === 'Scene') {
      addScene(morpheus);
    }
  });
});

gulp.task('atlas', (done) => {
  const onlyProcessType = process.env.MORPHEUS_TYPE;

  const gameDbPath = path.resolve('.');
  const outputBasePath = path.resolve(__dirname, 'output');
  const tmpBasePath = path.resolve(__dirname, 'tmp');
  const parsedFiles = [];
  const errorFiles = [];

  function patchFileName(fileName) {
    return fileName.replace('GameDb', 'GameDB');
  }
  function inputFileName(fileName) {
    return path.resolve(gameDbPath, patchFileName(fileName));
  }
  function outputFileName(fileName) {
    return path.resolve(outputBasePath, patchFileName(fileName));
  }
  function tmpFileName(fileName) {
    return path.resolve(tmpBasePath, path.basename(patchFileName(fileName)));
  }
  function handleFinalCatch(morpheus) {
    return function (err) {
      console.error(Object.assign({
        error: err.message,
        stack: err.stack
      }, morpheus));
    }
  }

  let promise = Promise.resolve();
  morpheusMap
    .filter(morpheus => !onlyProcessType || morpheus.type === onlyProcessType)
    .forEach(morpheus => {
      if (morpheus.data.fileName) console.log(morpheus.data.fileName)
      let tld = morpheus.data.fileName && morpheus.data.fileName.slice(-3).toUpperCase();
      if (morpheus.type === 'SoundCast') {
        const input = inputFileName(morpheus.data.fileName);
        const output = outputFileName(morpheus.data.fileName);
        const debug = debugFactory(`converter:${morpheus.type}:${morpheus.data.fileName}`);
        promise = promise
        .then(() => debug(`Checking if ${input} exists`))
        .then(() => fs.accessAsync(input, fs.constants.R_OK)
          .then(() => debug(`Checking if ${output} exists`))
          .then(() => fs.accessAsync(`${output}.ogg`, fs.constants.R_OK)
            .then(() => debug(`${output} already exists so skipping`))
            .catch(() => Promise.resolve(debug('Creating output dirs'))
              .then(() => mkdirpAsync(path.dirname(output)))
              .then(() => debug('Converting audio'))
              .then(() => Promise.all([
                execPromise(`ffmpeg -y -i "${input}" "${output}.ogg"`),
                execPromise(`ffmpeg -y -i "${input}" "${output}.aac"`),
                execPromise(`ffmpeg -y -i "${input}" "${output}.mp3"`),
              ]))
            )
          )
          .catch(handleFinalCatch(morpheus)));
      }
      else if (
        (morpheus.type === 'ControlledMovieCast' || morpheus.type === 'MovieSpecialCast') && (tld === 'TOM' || tld === 'NAR' || tld === 'MSC')) {
        const input = inputFileName(morpheus.data.fileName);
        const output = outputFileName(morpheus.data.fileName);
        const debug = debugFactory(`converter:${morpheus.type}:${morpheus.data.fileName}`);
        promise = promise
        .then(() => {
          morpheus.data.audioOnly = true;
        })
        .then(() => debug(`Checking if ${input} exists`))
        .then(() => fs.accessAsync(input, fs.constants.R_OK)
          .then(() => debug(`Checking if ${output} exists`))
          .then(() => fs.accessAsync(`${output}.ogg`, fs.constants.R_OK)
            .then(() => debug(`${output} already exists so skipping`))
            .catch(() => Promise.resolve(debug('Creating output dirs'))
              .then(() => mkdirpAsync(path.dirname(output)))
              .then(() => debug('Converting audio'))
              .then(() => Promise.all([
                execPromise(`ffmpeg -y -i "${input}" "${output}.ogg"`),
                execPromise(`ffmpeg -y -i "${input}" "${output}.aac"`),
                execPromise(`ffmpeg -y -i "${input}" "${output}.mp3"`),
              ]))
            )
          )
          .catch(handleFinalCatch(morpheus)));
      }
      else if (morpheus.type === 'PanoCast') {
        if (!morpheus.data.fileName.length) return;
        const input = inputFileName(morpheus.data.fileName);
        const output = `${outputFileName(morpheus.data.fileName)}.png`;
        const tmpFile = `${tmpFileName(morpheus.data.fileName)}.%03d.png`;
        const dimensionsTmpFile = `${tmpFileName(morpheus.data.fileName)}.png`;
        const debug = debugFactory(`converter:${morpheus.type}:${morpheus.data.fileName}`);
        promise = promise
          .then(() => debug(`Checking if ${input} exists`))
          .then(() => fs.accessAsync(input, fs.constants.R_OK)
            .then(() => debug(`Checking if ${output} exists`))
            .then(() => fs.accessAsync(output, fs.constants.R_OK)
              .then(() => debug(`${output} already exists so skipping`))
                .then(() => debug('Cleaning tmp file'))
              .catch(() => Promise.resolve(debug('Creating output dirs'))
                .then(() => mkdirpAsync(path.dirname(output)))
                .then(() => mkdirpAsync(path.dirname(tmpFile)))
                .then(() => debug('Converting video to images'))
                .then(() => execPromise(`ffmpeg -y -i ${input} -f image2 ${tmpFile}`))
                .then(() => debug('Read all images in tmp dir'))
                .then(() => fs.readdirAsync(path.dirname(tmpFile)))
                .map(file => path.resolve(tmpBasePath, file))
                .then(files => Promise.all(files
                  .filter(file => file.indexOf(path.basename(patchFileName(morpheus.data.fileName))) !== -1)
                  .map(imgFile => {
                    return fs.readFileAsync(imgFile)
                      .then(imageData => {
                        const img = new Image;
                        return Promise.all([
                          new Promise((resolve, reject) => {
                            img.onload = resolve;
                            img.onerror = reject;
                            img.src = imageData;
                          }),
                          fs.unlinkAsync(imgFile)
                        ])
                          .then(() => img);
                      });
                  }))
                .then((imgs) => {
                  debug(`Create ${imgs.length} canvases`)
                  return imgs;
                })
                .then(imgs => {
                  const width = imgs[0].width;
                  const height = imgs[0].height;

                  const canvas = new Canvas(width * 16, height * 2);
                  const ctx = canvas.getContext('2d');
                  imgs.forEach((img, index) => {
                    const row = index % 16;
                    const col = Math.floor(index / 16);
                    ctx.drawImage(img, row * width, col * height, width, height);
                  });
                  return new Promise((resolve, reject) => {
                    const out = fs.createWriteStream(output, {
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
                  })
                })
                )
              )
            )
          )
          .catch(handleFinalCatch(morpheus));
      }
      else if (morpheus.type === 'ControlledMovieCast') {
        if (!morpheus.data.fileName.length) return;
        const input = inputFileName(morpheus.data.fileName);
        const output = `${outputFileName(morpheus.data.fileName)}.png`;
        const tmpFile = `${tmpFileName(morpheus.data.fileName)}.%03d.png`;
        const dimensionsTmpFile = `${tmpFileName(morpheus.data.fileName)}.png`;
        const debug = debugFactory(`converter:${morpheus.type}:${morpheus.data.fileName}`);
        promise = promise
          .then(() => debug(`Checking if ${input} exists`))
          .then(() => fs.accessAsync(input, fs.constants.R_OK)
            .then(() => debug(`Checking if ${output} exists`))
            .then(() => fs.accessAsync(output, fs.constants.R_OK)
              .then(() => debug(`${output} already exists so skipping`))
              .then(() => execPromise(`ffmpeg -y -i "${input}" -frames 1 -f image2 "${dimensionsTmpFile}"`)
                .then(() => {
                  return fs.readFileAsync(tmpFile)
                    .then(imageData => {
                      return new Promise((resolve, reject) => {
                        const img = new Image;
                        img.onload = () => resolve(img);
                        img.onerror = reject;
                        img.src = imageData;
                      });
                    })
                    .then(img => {
                      morpheus.data.width = img.width;
                      morpheus.data.height = img.height;
                    });
                })
                .then(() => debug('Cleaning tmp file'))
                .then(() => fs.unlinkAsync(dimensionsTmpFile)))
              .catch(() => Promise.resolve(debug('Creating output dirs'))
                .then(() => mkdirpAsync(path.dirname(output)))
                .then(() => mkdirpAsync(path.dirname(tmpFile)))
                .then(() => debug('Converting video to images'))
                .then(() => execPromise(`ffmpeg -y -i ${input} -f image2 ${tmpFile}`))
                .then(() => debug('Read all images in tmp dir'))
                .then(() => fs.readdirAsync(path.dirname(tmpFile)))
                .map(file => path.resolve(tmpBasePath, file))
                .then(files => Promise.all(files
                  .filter(file => file.indexOf(path.basename(patchFileName(morpheus.data.fileName))) !== -1)
                  .map(imgFile => {
                    return fs.readFileAsync(imgFile)
                      .then(imageData => {
                        const img = new Image;
                        return Promise.all([
                          new Promise((resolve, reject) => {
                            img.onload = resolve;
                            img.onerror = reject;
                            img.src = imageData;
                          }),
                          fs.unlinkAsync(imgFile)
                        ])
                          .then(() => img);
                      });
                  }))
                .then((imgs) => {
                  debug(`Create ${imgs.length} canvases`)
                  return imgs;
                })
                .then(imgs => {
                  const width = imgs[0].width;
                  const height = imgs[0].height;
                  morpheus.data.width = width;
                  morpheus.data.height = height;
                  const canvas = new Canvas(width * imgs.length, height);
                  const ctx = canvas.getContext('2d');
                  imgs.forEach((img, index) => {
                    ctx.drawImage(img, index * width, 0, width, height);
                  });
                  return new Promise((resolve, reject) => {
                    const out = fs.createWriteStream(output, {
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
                  })
                })
                )
              )
            )
          )
          .catch(handleFinalCatch(morpheus));
      }
      else if (morpheus.data.fileName === 'GameDB/Deck4/atriumSPC' || morpheus.type === 'MovieSpecialCast'
        // Anything n-n  or 0-1 is always a single frame image
        && (morpheus.data.startFrame === morpheus.data.endFrame
          || (morpheus.data.startFrame === 0
          && morpheus.data.endFrame === 1)
        && morpheus.data.castId !== 806049)
      ) {
        const frame = morpheus.data.startFrame;
        const input = inputFileName(morpheus.data.fileName);
        const output = `${outputFileName(morpheus.data.fileName)}.${frame}.png`;
        const tmpFile = `${tmpFileName(morpheus.data.fileName)}.%03d.png`;
        const dimensionsTmpFile = `${tmpFileName(morpheus.data.fileName)}.png`;
        const debug = debugFactory(`converter:${morpheus.type}:${morpheus.data.fileName}`);

        promise = promise
        .then(() => debug(`Checking if ${input} exists`))
        .then(() => fs.accessAsync(input, fs.constants.R_OK)
          .then(() => debug(`Checking if ${output} exists`))
          .then(() => fs.accessAsync(output, fs.constants.R_OK)
            .then(() => debug(`${output} already exists so skipping`))
            .then(() => execPromise(`ffmpeg -y -i "${input}" -frames 1 -f image2 "${dimensionsTmpFile}"`)
              .then(() => {
                return fs.readFileAsync(tmpFile)
                  .then(imageData => {
                    return new Promise((resolve, reject) => {
                      const img = new Image;
                      img.onload = () => resolve(img);
                      img.onerror = reject;
                      img.src = imageData;
                    });
                  })
                  .then(img => {
                    morpheus.data.image = true;
                    morpheus.data.width = img.width;
                    morpheus.data.height = img.height;
                  });
              })
              .then(() => debug('Cleaning tmp file'))
              .then(() => fs.unlinkAsync(dimensionsTmpFile)))
            .catch(() => Promise.resolve(debug('Creating output dirs'))
              .then(() => mkdirpAsync(path.dirname(output)))
              .then(() => mkdirpAsync(path.dirname(tmpFile)))
              .then(() => debug('Converting single frame video to image'))
              .then(() => execPromise(`ffmpeg -y -i ${input} -f image2 ${tmpFile}`))
              .then(() => debug('Read all images in tmp dir'))
              .then(() => fs.readdirAsync(path.dirname(tmpFile)))
              .map(file => path.resolve(tmpBasePath, file))
              .then(files => Promise.all(files
                .filter(file => file.indexOf(path.basename(patchFileName(morpheus.data.fileName))) !== -1)
                .map(imgFile => {
                  return fs.readFileAsync(imgFile)
                    .then(imageData => {
                      const img = new Image;
                      return Promise.all([
                        new Promise((resolve, reject) => {
                          img.onload = resolve;
                          img.onerror = reject;
                          img.src = imageData;
                        }),
                        fs.unlinkAsync(imgFile)
                      ])
                        .then(() => img);
                    });
                })))
              .then((imgs) => {
                debug(`Create ${imgs.length} canvases`)
                return imgs;
              })
              .then(imgs => {
                const img = imgs[frame];
                const width = img.width;
                const height = img.height;
                morpheus.data.image = true;
                morpheus.data.width = img.width;
                morpheus.data.height = img.height;
                const canvas = new Canvas(width, height);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                return new Promise((resolve, reject) => {
                  const out = fs.createWriteStream(output, {
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
                })
              })
            )
          )
        )
        .catch(handleFinalCatch(morpheus));
      }
      else if (morpheus.type === 'MovieSpecialCast' && tld === 'STL') {
        const input = inputFileName(morpheus.data.fileName);
        const output = `${outputFileName(morpheus.data.fileName)}.0.png`;
        const debug = debugFactory(`converter:${morpheus.type}:${morpheus.data.fileName}`);
        const tmpFile = `${tmpFileName(morpheus.data.fileName)}.png`;

        promise = promise
        .then(() => debug(`Checking if ${input} exists`))
        .then(() => fs.accessAsync(input, fs.constants.R_OK)
          .then(() => debug(`Checking if ${output} exists`))
          .then(() => fs.accessAsync(output, fs.constants.R_OK)
            .then(() => debug(`${output} already exists so skipping`))
            .then(() => execPromise(`ffmpeg -y -i "${input}" -frames 1 -f image2 "${tmpFile}"`)
              .then(() => {
                return fs.readFileAsync(tmpFile)
                  .then(imageData => {
                    return new Promise((resolve, reject) => {
                      const img = new Image;
                      img.onload = () => resolve(img);
                      img.onerror = reject;
                      img.src = imageData;
                    });
                  })
                  .then(img => {
                    morpheus.data.image = true;
                    morpheus.data.width = img.width;
                    morpheus.data.height = img.height;
                  });
              })
              .then(() => debug('Cleaning tmp file'))
              .then(() => fs.unlinkAsync(tmpFile)))
            .catch(() => Promise.resolve(debug('Creating output dirs'))
              .then(() => mkdirpAsync(path.dirname(output)))
              .then(() => mkdirpAsync(path.dirname(tmpFile)))
              .then(() => debug('Converting single frame video to image'))
              .then(() => execPromise(`ffmpeg -y -i "${input}" -frames 1 -f image2 "${output}"`))
              .then(() => fs.readFileAsync(output)
                .then(imageData => {
                  return new Promise((resolve, reject) => {
                    const img = new Image;
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = imageData;
                  });
                })
                .then(img => {
                  morpheus.data.image = true;
                  morpheus.data.width = img.width;
                  morpheus.data.height = img.height;
                }))
              )
            )
          )
          .catch(handleFinalCatch(morpheus));
      }
      // else if (morpheus.type === 'MovieSpecialCast' &&  tld === 'SPC') {
      //   const input = inputFileName(morpheus.data.fileName);
      //   const outputSingle = `${outputFileName(morpheus.data.fileName)}.0.png`;
      //   const outputWebm = `${outputFileName(morpheus.data.fileName)}.webm`;
      //   const outputMp4 = `${outputFileName(morpheus.data.fileName)}.mp4`;
      //   const debug = debugFactory(`converter:${morpheus.type}:${morpheus.data.fileName}`);
      //   const dimensionsTmpFile = `${tmpFileName(morpheus.data.fileName)}.png`;
      //   const tmpFile = `${tmpFileName(morpheus.data.fileName)}.%03d.png`;
      //
      //   promise = promise
      //   .then(() => debug(`Checking if ${input} exists`))
      //   .then(() => fs.accessAsync(input, fs.constants.R_OK)
      //   .then(() => execPromise(`ffmpeg -y -i "${input}" -frames 1 -f image2 "${dimensionsTmpFile}"`)
      //     .then(() => {
      //       return fs.readFileAsync(dimensionsTmpFile)
      //         .then(imageData => {
      //           return new Promise((resolve, reject) => {
      //             const img = new Image;
      //             img.onload = () => resolve(img);
      //             img.onerror = reject;
      //             img.src = imageData;
      //           });
      //         })
      //         .then(img => {
      //           morpheus.data.width = img.width;
      //           morpheus.data.height = img.height;
      //         });
      //     })
      //     .then(() => debug('Cleaning tmp file'))
      //     .then(() => fs.unlinkAsync(dimensionsTmpFile)))
      //   .catch(() => Promise.resolve(debug('Creating output dirs'))
      //     .then(() => mkdirpAsync(path.dirname(outputSingle)))
      //     .then(() => debug('Converting video to images'))
      //     .then(() => execPromise(`ffmpeg -y -i ${input} -f image2 ${tmpFile}`))
      //     .then(() => debug('Read all images in tmp dir'))
      //     .then(() => fs.readdirAsync(path.dirname(tmpFile)))
      //     .map(file => path.resolve(tmpBasePath, file))
      //     .then(files => Promise.all(files
      //       .filter(file => file.indexOf(path.basename(patchFileName(morpheus.data.fileName))) !== -1)
      //       .map(imgFile => {
      //         return fs.readFileAsync(imgFile)
      //           .then(imageData => {
      //             const img = new Image;
      //             return new Promise((resolve, reject) => {
      //               img.onload = resolve;
      //               img.onerror = reject;
      //               img.src = imageData;
      //             })
      //               .then(() => ({
      //                 img,
      //                 file: imgFile,
      //               }));
      //           });
      //         })))
      //       .then(imgsData => {
      //         debug('number of frames', imgsData.length);
      //         if (imgsData.length === 1) {
      //           // This is a single frame SPC
      //           morpheus.data.image = true;
      //           return new Promise((resolve, reject) => {
      //             fs.createReadStream(imgsData[0].file)
      //               .pipe(fs.createWriteStream(outputSingle))
      //               .on('end', resolve)
      //               .on('error', reject);
      //           })
      //             .then(() => imgsData.map(d => d.file));
      //         } else {
      //           return  Promise.all([
      //             execPromise(`ffmpeg -y -i "${input}" -codec:v libvpx -crf 8 -b:v 800k -qmin 0 -qmax 50 -c:a libvorbis "${outputWebm}"`),
      //             execPromise(`ffmpeg -y -i "${input}" -filter:v "crop=${morpheus.data.width}:${morpheus.data.height}:0:0" -crf 18 -preset veryslow -profile:v main -level 4.1 -pix_fmt yuv420p "${outputMp4}"`)
      //           ])
      //             .then(() => imgsData.map(d => d.file));
      //         }
      //       })
      //       .map(file => fs.unlinkAsync(file))
      //     )
      //   )
      //   .catch(handleFinalCatch(morpheus));
      // }
      else if (morpheus.type === 'MovieSpecialCast' || morpheus.type === 'PanoAnim') {
        const input = inputFileName(morpheus.data.fileName);
        const output = outputFileName(morpheus.data.fileName);
        const tmpFile = `${tmpFileName(morpheus.data.fileName)}.png`;
        const debug = debugFactory(`converter:${morpheus.type}:${morpheus.data.fileName}`);
        function setDimensions() {
          return execPromise(`ffmpeg -y -i "${input}" -frames 1 -f image2 "${tmpFile}"`)
            .then(() => {
              return fs.readFileAsync(tmpFile)
                .then(imageData => {
                  return new Promise((resolve, reject) => {
                    const img = new Image;
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = imageData;
                  });
                })
                .then(img => {
                  morpheus.data.width = img.width;
                  morpheus.data.height = img.height;
                  if (morpheus.data.height % 2 === 1) {
                    morpheus.data.height--;
                  }
                  if (morpheus.data.width % 2 === 1) {
                    morpheus.data.width--;
                  }
                });
            })
            .then(() => debug('Cleaning tmp file'))
            .then(() => fs.unlinkAsync(tmpFile));
        }
        promise = promise
        .then(() => debug(`Checking if ${input} exists`))
        .then(() => fs.accessAsync(input, fs.constants.R_OK)
          .then(() => debug(`Checking if ${output} exists`))
          .then(() => fs.accessAsync(`${output}.webm`, fs.constants.R_OK)
            .then(() => debug(`${output} already exists so skipping`))
            .then (setDimensions)
            .catch(() => Promise.resolve(debug('Creating output dirs'))
              .then(() => mkdirpAsync(path.dirname(output)))
              .then(() => debug('Converting'))
              .then(setDimensions)
              .then(() => Promise.all([
                execPromise(`ffmpeg -y -i "${input}" -codec:v libvpx -crf 8 -b:v 800k -qmin 0 -qmax 50 -c:a libvorbis "${output}.webm"`),
                execPromise(`ffmpeg -y -i "${input}" -filter:v "crop=${morpheus.data.width}:${morpheus.data.height}:0:0" -crf 18 -preset veryslow -profile:v main -level 4.1 -pix_fmt yuv420p "${output}.mp4"`)
              ]))
            )
          )
          .catch(handleFinalCatch(morpheus))
        );
      }
    });
  promise
    .then(() => fs.writeFileAsync('morpheus.map.out.json', JSON.stringify(morpheusMap, null, 2), 'utf8'))
    .then(() => {
      if (errorFiles.length) {
        console.error('Errors converting the following morpheus objects:');
        errorFiles.forEach(m => console.error(`-------------------------\n${JSON.stringify(m, null, 2)}`));
      }
    })
    .then(() => done());

});

gulp.task('reset:gamedb', (done) => {
  const process = gulpFileProcess({
    run(file) {
      if(path.extname(file)) {
        return fs.unlinkAsync(file);
      }
    },
  });

  const gamdDbPath = path.resolve('../GameDB');
});

gulp.task('copy:to:s3', (done) => {
  const s3 = new AWS.S3();
  const errFiles = [];
  const process = gulpFileProcess({
    run: (file) => {
      const basePath = path.join(__dirname, '..');
      let filePath = file.path;
      if (filePath.indexOf(basePath) === 0) {
        filePath = filePath.slice(basePath.length + 1).split(path.sep).join(path.posix.sep);
      }
      console.log(`Processing ${filePath}`);
      return s3.headObject({
        Bucket: 'soapbubble-morpheus-dev',
        Key: filePath,
      })
        .promise()
        .then(null, () => {
          const fileStream = fs.createReadStream(file.path);

          return s3.putObject({
            Bucket: 'soapbubble-morpheus-dev',
            Key: filePath,
            Body: fileStream
          }).promise();
        })
        .then(null, () => {
          errFiles.push(filePath);
        });

    } // do something else, for instance notify user about processed file
  });

  process.on('end', () => {
    if (errFiles.length) {
      console.log('The following files had errors', errFiles);
    }
  });
  return gulp.src('../GameDB/**/*')
    .pipe(process);
});
