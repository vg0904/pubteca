#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera los audios, el video y su poster del libro de prueba con medios.

Son INVENTADOS y diminutos: una carta de ajuste de 160x90 de un segundo y dos
tonos de un segundo. Existen para que CI meta audio y video de verdad en el
EPUB de Apple Books y lo pase por EPUBCheck, no para verse.

Cumplen lo que pide Apple (Asset Guide 5.3.1), porque son lo que el motor
espera recibir ya convertido:
  - video H.264 en MPEG-4 (.m4v), con el PRIMER y el ULTIMO fotograma en negro;
  - audio AAC en .m4a, estereo, todos a la misma frecuencia (44,1 kHz);
  - el poster del mismo tamaño y proporcion que el video.

A diferencia de las imagenes de prueba, esto no se puede escribir a mano: hace
falta un codificador. Necesita ffmpeg, SOLO para regenerarlos; los archivos
se commitean y CI no lo necesita. Las opciones bitexact quitan la version y las
fechas, para que regenerarlos con el mismo ffmpeg de los mismos bytes.

Uso: python3 -I scripts/medios-prueba.py
"""

import shutil
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
LIBRO = RAIZ / "tests" / "fixtures" / "libro-medios"
MEDIOS = LIBRO / "medios"
SUELTOS = RAIZ / "tests" / "fixtures" / "medios-sueltos"

EXACTO = ["-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact",
          "-map_metadata", "-1", "-map_chapters", "-1"]


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *args], check=True)


def tono(salida: Path, frecuencia: int) -> None:
    ffmpeg("-f", "lavfi", "-i", f"sine=frequency={frecuencia}:duration=1:sample_rate=44100",
           "-ac", "2", "-c:a", "aac", "-b:a", "128k", *EXACTO,
           "-movflags", "+faststart", "-f", "ipod", str(salida))


def main() -> int:
    if shutil.which("ffmpeg") is None:
        print("Hace falta ffmpeg para regenerar los medios de prueba.", file=sys.stderr)
        return 1
    MEDIOS.mkdir(parents=True, exist_ok=True)

    # Un segundo a 30 fps: el fotograma 0 y el 29 van en negro.
    video = MEDIOS / "cap01-v01.m4v"
    ffmpeg("-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=1",
           "-f", "lavfi", "-i", "sine=frequency=330:duration=1:sample_rate=44100",
           "-vf", "drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='eq(n,0)+eq(n,29)'",
           "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "veryslow",
           "-crf", "35", "-x264-params", "threads=1",
           "-c:a", "aac", "-ac", "2", "-b:a", "96k", *EXACTO,
           "-movflags", "+faststart", "-f", "mp4", str(video))

    # El poster: un fotograma del medio, del mismo tamaño que el video.
    ffmpeg("-ss", "0.5", "-i", str(video), "-frames:v", "1", "-q:v", "5", *EXACTO,
           str(MEDIOS / "cap01-v01.jpg"))

    tono(MEDIOS / "cap01-a01.m4a", 440)
    tono(MEDIOS / "cap02-a01.m4a", 523)

    # Para la inspeccion (tests/medios-inspeccion.test.ts): lo que un autor
    # arrastra tal cual. Un .mov vertical como el del iPhone (girado en los
    # metadatos), una nota de voz WAV en mono a 48 kHz y un MP3.
    SUELTOS.mkdir(parents=True, exist_ok=True)
    ffmpeg("-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=1",
           "-f", "lavfi", "-i", "sine=frequency=330:duration=1:sample_rate=44100",
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "40", "-x264-params", "threads=1",
           "-c:a", "aac", "-ac", "2", "-b:a", "64k", *EXACTO, "-f", "mov", str(SUELTOS / "plano.mov"))
    ffmpeg("-display_rotation", "90", "-i", str(SUELTOS / "plano.mov"), "-c", "copy", *EXACTO,
           "-f", "mov", str(SUELTOS / "vertical.mov"))
    (SUELTOS / "plano.mov").unlink()
    ffmpeg("-f", "lavfi", "-i", "sine=frequency=440:duration=0.5:sample_rate=48000",
           "-ac", "1", "-c:a", "pcm_s16le", *EXACTO, str(SUELTOS / "nota-48k-mono.wav"))
    ffmpeg("-f", "lavfi", "-i", "sine=frequency=440:duration=0.5:sample_rate=44100",
           "-ac", "2", "-c:a", "libmp3lame", "-b:a", "64k", *EXACTO, str(SUELTOS / "nota.mp3"))

    for f in sorted([*MEDIOS.iterdir(), *SUELTOS.iterdir()]):
        print(f"  {f.relative_to(RAIZ)}  {f.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
