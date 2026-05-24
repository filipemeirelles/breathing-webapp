import './RoundProgress.css';

interface Props {
  currentRound: number;
  totalRounds: number;
}

export default function RoundProgress({ currentRound, totalRounds }: Props) {
  return (
    <div className="round-progress">
      <span className="round-text">Round</span>
      <div className="round-dots">
        {Array.from({ length: totalRounds }, (_, i) => (
          <div
            key={i}
            className={`round-dot ${i < currentRound ? 'done' : ''} ${i === currentRound ? 'active' : ''}`}
          />
        ))}
      </div>
      <span className="round-count">{currentRound + 1} / {totalRounds}</span>
    </div>
  );
}
