# Respiração

App de respiração guiada no estilo Wim Hof: rounds de respiração profunda,
retenção (apnéia) com pulmões vazios, recuperação com pulmões cheios e
meditação final. Web (Vite + React + TypeScript) e Android (Capacitor).

## Rodando

```bash
npm install
npm run dev        # desenvolvimento
npm test           # vitest (timeline, motor, estatísticas)
npm run lint
npm run build      # tsc -b && vite build → dist/
npm run android:sync && npm run android:open   # app Android
```

## Recursos

- **Presets** (Iniciante, Clássico, Avançado, Livre) e ajuste fino de rounds,
  respirações (20–60), ritmo, retenção por round, recuperação e meditação.
- **Duração estimada** da sessão calculada pela própria timeline do motor.
- **Retenção cronometrada ou livre** (toque no orbe, Espaço ou Enter para respirar).
- **Paisagens sonoras** sintetizadas: Brisa, Oceano, Chuva, Ressonância
  (tigela tibetana) ou Silêncio, com prévia, volume e batidas binaurais.
- **Contagem sonora** nos 3 últimos segundos e **vibração** nas trocas de fase.
- **Pausa** com "recomeçar etapa" (na recuperação, desfaz um toque acidental)
  e volume do fundo; o SO suspender o áudio vira pausa automática.
- **Progresso**: sessões, melhor retenção, dias seguidos, recorde por sessão.
- Atalhos: `Espaço` pausa / respira, `Esc` pausa, `M` silencia.

## Arquitetura

- `src/engine/timeline.ts` — a sessão inteira como segmentos com início/fim
  absolutos no relógio do `AudioContext` (sem drift).
- `src/engine/breathEngine.ts` — agenda o áudio com lookahead e dispara as
  fases da UI pelo mesmo relógio; pausar = suspender o `AudioContext`.
- `src/audio.ts` — grafo Web Audio: barramentos de guia e de fundo, reverb
  por convolução, limitador, ruídos coloridos com loop sem clique.
- `src/pages/*` — Setup, Exercise, Complete. Tema noturno com a cor do
  fundo/orbe acompanhando a fase (`<html data-tone>`).

> Pratique sentado ou deitado, nunca na água ou dirigindo.
