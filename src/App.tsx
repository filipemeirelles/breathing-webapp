import { useState } from 'react';
import type { ExerciseConfig } from './types';
import Setup from './pages/Setup';
import Exercise from './pages/Exercise';
import Complete from './pages/Complete';

type Screen = 'setup' | 'exercise' | 'complete';

interface CompletionData {
  rounds: number;
  totalSeconds: number;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [config, setConfig] = useState<ExerciseConfig | null>(null);
  const [completion, setCompletion] = useState<CompletionData | null>(null);

  function handleStart(cfg: ExerciseConfig) {
    setConfig(cfg);
    setScreen('exercise');
  }

  function handleComplete(rounds: number, totalSeconds: number) {
    setCompletion({ rounds, totalSeconds });
    setScreen('complete');
  }

  function handleRestart() {
    setConfig(null);
    setCompletion(null);
    setScreen('setup');
  }

  if (screen === 'exercise' && config) {
    return <Exercise config={config} onComplete={handleComplete} />;
  }

  if (screen === 'complete' && completion) {
    return (
      <Complete
        rounds={completion.rounds}
        totalSeconds={completion.totalSeconds}
        onRestart={handleRestart}
      />
    );
  }

  return <Setup onStart={handleStart} />;
}
