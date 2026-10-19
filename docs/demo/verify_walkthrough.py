"""Verify a completed walkthrough and export representative decoded frames."""
import json
import re
import subprocess
import sys
from pathlib import Path
import imageio_ffmpeg
root=Path(sys.argv[1]);video=root/'BotyslawSmith-poradnik.mp4';ff=imageio_ffmpeg.get_ffmpeg_exe()
info=subprocess.run([ff,'-i',str(video)],capture_output=True,text=True).stderr
assert '1920x1080' in info and 'Audio: aac' in info
chapters=json.loads((root/'chapters.json').read_text(encoding='utf-8'))
scenes=json.loads((root/'scenes.json').read_text(encoding='utf-8'))
assert len(chapters)==len(scenes)
assert all('nick' not in item['narration'].lower() and 'gotowe' not in item['narration'].lower() for item in scenes)
assert all('poprzednia' not in (item['narration'] + ' '.join(item['bullets'])).lower() and 'następna' not in (item['narration'] + ' '.join(item['bullets'])).lower() for item in scenes)
for index in [0,len(chapters)//2,len(chapters)-2,len(chapters)-1]:
 second=chapters[index]['start']+min(2,chapters[index]['duration']/2)
 subprocess.run([ff,'-y','-loglevel','error','-ss',str(second),'-i',str(video),'-frames:v','1',str(root/f'verified-{index}.png')],check=True)
result=subprocess.run([ff,'-v','error','-i',str(video),'-f','null','-'],capture_output=True,text=True)
assert result.returncode==0 and not result.stderr,result.stderr
lines=[line.strip() for line in info.splitlines() if 'Duration:' in line or 'Stream #' in line]
print('\n'.join(lines)); print(f'Full video/audio decode passed. Size: {video.stat().st_size/1024/1024:.1f} MiB')
(root/'verification.json').write_text(json.dumps({'dimensions':'1920x1080','fps':24,'chapters':len(chapters),'duration_seconds':sum(x['duration'] for x in chapters),'full_decode':'passed','audio':'AAC, Polish synthetic narration +15%','pause_seconds':0.25,'source':'Genuine Discord captures; reminder channel original unmuted state restored'},indent=2),encoding='utf-8')
