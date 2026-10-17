# Áudio do app

## Sons gerados (public/audio/)

Todos mono, 44,1 kHz, mp3 192 kbps, normalizados a cerca de −20 LUFS (pico ≤ −3 dBTP),
com o silêncio inicial removido para que o app agende o som com precisão de amostra.

| Arquivo | Uso | Origem |
|---|---|---|
| `voice-inhale.mp3` | locução "Inspira" no início da inspiração | Gemini 3.8 Flash TTS (`google/gemini-3.8-flash-tts`, voz Kore) via OpenRouter |
| `voice-exhale.mp3` | locução "Expira" no início da expiração | idem |
| `breath-inhale-{2,3,4}s.mp3` | inspiração nasal; o app escolhe o mais próximo do ritmo e estica de ×0,75 a ×1,4 | Seed Audio 1.0 (`bytedance-seed/seed-audio-1-0`) via OpenRouter |
| `breath-exhale-{2,3}s.mp3` | expiração pela boca (3 s com decaimento de 0,4 s aplicado em pós-processo) | idem |
| `breath-recovery.mp3` | inspiração funda que abre a recuperação | idem |

Sem clipe adequado para a duração pedida (por exemplo expiração acima de ~3,6 s), o app
usa a expiração sintetizada em `src/audio.ts`, que escala para qualquer ritmo.

Locuções opcionais ainda não geradas (o app já as reconhece e ignora enquanto o arquivo
não existir; ao adicionar um arquivo, inclua o cue em `SHIPPED_VOICE_CUES` em `src/audio.ts`): `voice-hold.mp3` ("Segura"), `voice-deep.mp3` ("Inspira fundo"),
`voice-release.mp3` ("Solta") e `voice-prepare.mp3` ("Prepare-se").

## Como a voz foi gerada

Instrução de estilo enviada no campo `instructions` do endpoint `/api/v1/audio/speech`:

> Fale em português do Brasil, com sotaque neutro. Voz feminina, calma, suave e íntima,
> com tom definido, como numa aula de respiração guiada. Pronuncie só a palavra.

Texto: `Inspira.` e `Expira.`; formato `pcm` (24 kHz), convertido e tratado com ffmpeg
(corte de silêncio inicial, fade-out de 40 ms, `loudnorm=I=-20:TP=-3`).
Vozes testadas e descartadas por sotaque: ElevenLabs (Jessica, Callum), Microsoft MAI
(Harper, Luana, Pedro), Kokoro (pf_dora) e Fish Audio.

## Licença

⚠️ Antes de publicar na Play Store, confirme nos termos do OpenRouter e de cada provedor
(Google, ByteDance) que o áudio gerado pode ser redistribuído comercialmente dentro de um app.
