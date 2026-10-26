#!/usr/bin/env node
/* Split the 3D film's media bundle for the project page.

   The film (claude-3d-model_v14/assets/media.js, written by its tools/build_media.py) embeds every picture as a
   data: URI, so the page also works from file://. The page loads the OpenVid atlases (two thirds of the bundle) and the
   robot demonstrations only once the model stands, so they come in files of their own:
     assets/media.js        window.LALA_MEDIA        everything but `openvid`
     assets/media-video.js  window.LALA_MEDIA_VIDEO  { upper, lower }: the OpenVid sprite atlases + captions
     assets/robot.js        window.LALA_ROBOT_MEDIA  the film's robot demonstrations (its tools/build_robot.py), copied
     assets/poster-blur.jpg the blurred poster: the CSS stand-in for background b until WebGL draws it

   Usage: node tools/split_media.mjs [path/to/film/assets]   (default: ../claude-3d-model_v14/assets) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILM = path.resolve(process.argv[2] || path.join(HERE, '..', '..', 'claude-3d-model_v14', 'assets'));
const OUT = path.join(HERE, '..', 'assets');

const text = fs.readFileSync(path.join(FILM, 'media.js'), 'utf8');
const M = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
const { openvid, ...core } = M;
if (!openvid || !core.poster) throw new Error('unexpected media bundle: ' + Object.keys(M).join(', '));

const head = '/* LaLa-World project page media — split from the 3D film\'s assets/media.js by tools/split_media.mjs; do not edit by hand.\n';
fs.writeFileSync(path.join(OUT, 'media.js'), head +
  '   domains, worldVideo, omniedit, policy, rows, poster, nightSky (see the film\'s media.js for what each holds). */\n' +
  'window.LALA_MEDIA = ' + JSON.stringify(core) + ';\n');
fs.writeFileSync(path.join(OUT, 'media-video.js'), head +
  '   openvid: 4.5 s clips as 15 fps atlases + their 9 change captions; loaded after the model stands. */\n' +
  'window.LALA_MEDIA_VIDEO = ' + JSON.stringify(openvid) + ';\n');
fs.copyFileSync(path.join(FILM, 'robot.js'), path.join(OUT, 'robot.js'));
const blur = core.poster.blur.replace(/^data:image\/jpeg;base64,/, '');
fs.writeFileSync(path.join(OUT, 'poster-blur.jpg'), Buffer.from(blur, 'base64'));

for (const f of ['media.js', 'media-video.js', 'robot.js', 'poster-blur.jpg']) {
  console.log(f.padEnd(16), (fs.statSync(path.join(OUT, f)).size / 1024 / 1024).toFixed(2) + ' MB');
}
