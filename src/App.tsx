import { useState } from 'react';
import type { ExerciseConfig, SessionResult } from './types';
import Setup from './pages/Setup';
import Exercise from './pages/Exercise';
import Complete from './pages/Complete';
import { appendSession, computeStats, loadHistory } from './storage';
import { initAudio } from './audio';

type Screen = 'setup' | 'exercise' | 'complete';

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [config, setConfig] = useState<ExerciseConfig | null>(null);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [previousBest, setPreviousBest] = useState(0);
  /** Muda a cada sessão para remontar o Exercise (repetir com a mesma config). */
  const [runId, setRunId] = useState(0);

  function handleStart(cfg: ExerciseConfig) {
    setConfig(cfg);
    setRunId((n) => n + 1);
    setScreen('exercise');
  }

  function handleComplete(sessionResult: SessionResult) {
    // O recorde anterior precisa ser lido antes de gravar a sessão nova.
    setPreviousBest(computeStats(loadHistory()).bestRetention);
    appendSession(sessionResult);
    setResult(sessionResult);
    setScreen('complete');
  }

  async function handleRepeat() {
    if (!config) return;
    try {
      await initAudio();
    } catch {
      // segue sem o som de inspiração
    }
    handleStart(config);
  }

  function handleHome() {
    setResult(null);
    setScreen('setup');
  }

  let page;
  if (screen === 'exercise' && config) {
    page = <Exercise key={runId} config={config} onComplete={handleComplete} />;
  } else if (screen === 'complete' && result) {
    page = (
      <Complete
        result={result}
        previousBest={previousBest}
        onRepeat={() => void handleRepeat()}
        onHome={handleHome}
      />
    );
  } else {
    page = <Setup onStart={handleStart} />;
  }

  return (
    <>
      <div className="sky" aria-hidden="true" />
      {page}
    </>
  );
}
