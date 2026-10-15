import './RoundProgress.css';

interface Props {
  currentRound: number;
  totalRounds: number;
}

export default function RoundProgress({ currentRound, totalRounds }: Props) {
  return (
    <div className="round-progress" aria-label={`Round ${currentRound + 1} de ${totalRounds}`}>
      <span className="round-count">
        Round <strong>{currentRound + 1}</strong>
        <span className="round-total">/{totalRounds}</span>
      </span>
      <div className="round-dots" aria-hidden="true">
        {Array.from({ length: totalRounds }, (_, i) => (
          <div
            key={i}
            className={`round-dot${i < currentRound ? ' done' : ''}${i === currentRound ? ' active' : ''}`}
          />
        ))}
      </div>
    </div>
  );
}
