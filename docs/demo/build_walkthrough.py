"""Rebuild the current narrated walkthrough from versioned Discord captures."""
import argparse
import asyncio
import hashlib
import json
import re
import subprocess
from pathlib import Path

import edge_tts
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont, ImageOps


class WalkthroughBuilder:
    VOICE = 'pl-PL-MarekNeural'
    RATE = '+15%'

    def __init__(self, directory):
        self.root = directory.resolve()
        self.scenes = json.loads((self.root / 'scenes.json').read_text(encoding='utf-8'))
        self.ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

    @staticmethod
    def font(size, bold=False):
        return ImageFont.truetype('C:/Windows/Fonts/' + ('arialbd.ttf' if bold else 'arial.ttf'), size)

    @staticmethod
    def wrap(draw, text, font, width):
        lines, line = [], ''
        for word in text.split():
            candidate = f'{line} {word}'.strip()
            if draw.textlength(candidate, font=font) > width and line:
                lines.append(line)
                line = word
            else:
                line = candidate
        return lines + [line]

    def card(self, index, scene, second=False):
        canvas = Image.new('RGB', (1920, 1080), '#11151f')
        draw = ImageDraw.Draw(canvas)
        draw.rectangle((0, 0, 1920, 8), fill='#6fe4bd')
        draw.text((75, 58), 'BOTYSŁAWSMITH  /  PRZEWODNIK GRACZA', font=self.font(24, True), fill='#8f9db8')
        draw.text((75, 155), scene['command'], font=self.font(46, True), fill='#6fe4bd')
        y = 235
        for line in self.wrap(draw, scene['title'], self.font(49, True), 760):
            draw.text((75, y), line, font=self.font(49, True), fill='white')
            y += 62
        y += 42
        for bullet in scene['bullets']:
            draw.ellipse((78, y + 14, 87, y + 23), fill='#6fe4bd')
            for line in self.wrap(draw, bullet, self.font(32), 700):
                draw.text((110, y), line, font=self.font(32), fill='#d7ddeb')
                y += 44
            y += 23
        if y > 970:
            raise ValueError(f'Text exceeds safe area: scene {index}')
        image = scene['second_image'] if second else scene['image']
        crop = scene['second_crop'] if second else scene['crop']
        shot = Image.open(self.root / image).convert('RGB').crop(crop)
        shot = ImageOps.contain(shot, (925, 850), Image.Resampling.LANCZOS)
        x, sy = 930 + (925 - shot.width) // 2, 140 + (850 - shot.height) // 2
        draw.rounded_rectangle((x - 12, sy - 12, x + shot.width + 12, sy + shot.height + 12), radius=16, fill='#313848')
        canvas.paste(shot, (x, sy))
        draw.text((75, 1010), f'{index + 1:02d} / {len(self.scenes):02d}    •    Aktualny widok Discorda', font=self.font(23), fill='#8f9db8')
        path = self.root / f'card-{index:02d}{"-b" if second else ""}.png'
        canvas.save(path)
        return path

    def cards(self):
        images = []
        for i, scene in enumerate(self.scenes):
            images.append(self.card(i, scene))
            if 'second_image' in scene:
                images.append(self.card(i, scene, True))
        sheet = Image.new('RGB', (960, ((len(images) + 1) // 2) * 270), '#11151f')
        for i, path in enumerate(images):
            sheet.paste(Image.open(path).resize((480, 270)), ((i % 2) * 480, (i // 2) * 270))
        sheet.save(self.root / 'contact.png')

    def run(self, *arguments):
        subprocess.run([self.ffmpeg, '-y', '-loglevel', 'error', *map(str, arguments)], check=True)

    @staticmethod
    def timestamp(seconds):
        ms = round(seconds * 1000)
        return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'

    async def build(self):
        chapters, subtitles, offset, subtitle_number = [], [], 0, 0
        for i, scene in enumerate(self.scenes):
            digest = hashlib.sha256((self.VOICE + self.RATE + scene['narration']).encode()).hexdigest()[:16]
            audio = self.root / f'voice-{digest}.mp3'
            if not audio.exists():
                await edge_tts.Communicate(scene['narration'], self.VOICE, rate=self.RATE).save(str(audio))
            info = subprocess.run([self.ffmpeg, '-i', str(audio)], capture_output=True, text=True).stderr
            h, m, s = map(float, re.search(r'Duration: (\d+):(\d+):([\d.]+)', info).groups())
            speech_duration = h * 3600 + m * 60 + s
            duration = speech_duration + .25
            card = self.root / f'card-{i:02d}.png'
            inputs = ['-loop', '1', '-i', card]
            filter_video = f'[0:v]fade=t=in:st=0:d=0.25,fade=t=out:st={duration - .25}:d=0.25[v]'
            if 'second_image' in scene:
                inputs += ['-loop', '1', '-i', self.root / f'card-{i:02d}-b.png']
                filter_video = f'[0:v][1:v]overlay=enable=\'gte(t,{duration * .6})\',fade=t=in:st=0:d=0.25,fade=t=out:st={duration - .25}:d=0.25[v]'
            audio_index = 2 if 'second_image' in scene else 1
            self.run(*inputs, '-i', audio, '-filter_complex', filter_video,
                     '-map', '[v]', '-map', f'{audio_index}:a', '-af', 'apad=pad_dur=0.25',
                     '-t', duration, '-r', 24, '-c:v', 'libx264', '-preset', 'ultrafast',
                     '-crf', 23, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', self.root / f'clip-{i:02d}.mp4')
            chapters.append({'chapter': scene['command'], 'start': offset, 'duration': duration, 'narration': scene['narration']})
            sentences = re.split(r'(?<=[.!?])\s+', scene['narration'])
            cursor, weight = offset, sum(len(sentence) for sentence in sentences)
            for sentence in sentences:
                end = cursor + speech_duration * len(sentence) / weight
                subtitle_number += 1
                subtitles.append(f'{subtitle_number}\n{self.timestamp(cursor)} --> {self.timestamp(end)}\n{sentence}\n')
                cursor = end
            offset += duration
            print(f'Chapter {i + 1}/{len(self.scenes)} complete ({duration:.1f}s)', flush=True)
        (self.root / 'concat.txt').write_text('\n'.join(f"file 'clip-{i:02d}.mp4'" for i in range(len(self.scenes))), encoding='utf-8')
        self.run('-f', 'concat', '-safe', 0, '-i', self.root / 'concat.txt', '-c', 'copy', '-movflags', '+faststart', self.root / 'BotyslawSmith-poradnik.mp4')
        (self.root / 'chapters.json').write_text(json.dumps(chapters, ensure_ascii=False, indent=2), encoding='utf-8')
        (self.root / 'subtitles.srt').write_text('\n'.join(subtitles), encoding='utf-8')
        print(f'Video complete: {offset:.1f}s', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    parser.add_argument('--cards-only', action='store_true')
    args = parser.parse_args()
    builder = WalkthroughBuilder(args.directory)
    builder.cards()
    if not args.cards_only:
        asyncio.run(builder.build())
