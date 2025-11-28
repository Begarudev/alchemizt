import type { MatchRoom } from "@alchemizt/contracts";
import "./RoomCard.css";

export interface RoomCardProps {
  readonly room: MatchRoom;
  readonly participantHandle: string;
  readonly onJoin: (roomId: string) => void;
  readonly onReadyToggle: (room: MatchRoom) => void;
  readonly onCountdown: (roomId: string) => void;
  readonly disabled?: boolean;
}

export const RoomCard = ({
  room,
  participantHandle,
  onJoin,
  onReadyToggle,
  onCountdown,
  disabled = false,
}: RoomCardProps) => {
  const participant = room.participants.find(
    (entry) => entry.handle.toLowerCase() === participantHandle.toLowerCase(),
  );
  const hasJoined = Boolean(participant);
  const readyLabel = participant?.ready ? "Set Not Ready" : "Ready Up";
  const countdownLabel =
    room.countdown.state === "running" ? "Countdown Running" : "Start Countdown";

  return (
    <article className="room-card">
      <header className="room-card__header">
        <div>
          <p className="eyebrow">{room.puzzleId}</p>
          <h3>{room.id}</h3>
          <p className="muted">
            Mode: <strong>{room.mode}</strong> · Timer: {room.timerConfig.totalSeconds}s
          </p>
        </div>
        <span className={`badge badge--${room.status}`}>{room.status}</span>
      </header>

      <section>
        <p className="muted">
          Countdown: {room.countdown.state} ({room.countdown.countdownSeconds}s)
        </p>
        {room.countdown.startedAt && (
          <p className="muted">
            Started at {new Date(room.countdown.startedAt).toLocaleTimeString()}
          </p>
        )}
      </section>

      <section className="room-card__participants">
        <h4>Participants</h4>
        <ul>
          {room.participants.map((entry) => (
            <li key={entry.id}>
              <span>{entry.handle}</span>
              <small>
                {entry.role} · {entry.ready ? "ready" : "not ready"}
              </small>
            </li>
          ))}
          {room.participants.length === 0 && <li className="muted">No players yet.</li>}
        </ul>
      </section>

      <footer className="room-card__actions">
        <button
          type="button"
          disabled={disabled || hasJoined || !participantHandle}
          onClick={() => onJoin(room.id)}
        >
          {hasJoined ? "Joined" : "Join"}
        </button>
        <button
          type="button"
          disabled={disabled || !hasJoined}
          onClick={() => onReadyToggle(room)}
        >
          {readyLabel}
        </button>
        <button
          type="button"
          disabled={disabled || room.countdown.state === "running" || !hasJoined}
          onClick={() => onCountdown(room.id)}
        >
          {countdownLabel}
        </button>
      </footer>
    </article>
  );
};

export default RoomCard;

