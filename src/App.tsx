import { useState } from 'react';
import type { ExerciseConfig, SessionResult } from './types';
import Setup from './pages/Setup';
import Exercise from './pages/Exercise';
import Complete from './pages/Complete';
import { appendSession } from './storage';

type Screen = 'setup' | 'exercise' | 'complete';

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [config, setConfig] = useState<ExerciseConfig | null>(null);
  const [result, setResult] = useState<SessionResult | null>(null);

  function handleStart(cfg: ExerciseConfig) {
    setConfig(cfg);
    setScreen('exercise');
  }

  function handleComplete(sessionResult: SessionResult) {
    appendSession(sessionResult);
    setResult(sessionResult);
    setScreen('complete');
  }

  function handleRestart() {
    setConfig(null);
    setResult(null);
    setScreen('setup');
  }

  if (screen === 'exercise' && config) {
    return <Exercise config={config} onComplete={handleComplete} />;
  }

  if (screen === 'complete' && result) {
    return <Complete result={result} onRestart={handleRestart} />;
  }

  return <Setup onStart={handleStart} />;
}
