import { useState, useMemo, useCallback } from "react";
import type { FormEvent } from "react";
import type { MatchMode, MatchRoom, QueueModeSnapshot } from "@alchemizt/contracts";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import RoomCard from "../components/RoomCard";
import {
  MATCH_SERVICE_URL,
  createRoom,
  fetchRooms,
  fetchCompetitiveDashboard,
  joinRoom,
  startCountdown,
  toggleReady,
  enqueueMatchmaking,
  cancelMatchmakingTicket,
} from "../lib/api";
import { usePreferencesStore } from "../store/preferences";
import "../App.css";

const POLL_MS = 5_000;

const useInvalidateRooms = () => {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["rooms"] }),
    [queryClient],
  );
};

const useInvalidateDashboard = () => {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["competitive-dashboard"] }),
    [queryClient],
  );
};

export const LobbyPage = () => {
  const invalidateRooms = useInvalidateRooms();
  const invalidateDashboard = useInvalidateDashboard();
  const {
    hostHandle,
    participantHandle,
    mode,
    puzzleId,
    countdownSeconds,
    totalSeconds,
    setHostHandle,
    setParticipantHandle,
    setMode,
    setPuzzleId,
    setCountdownSeconds,
    setTotalSeconds,
  } = usePreferencesStore();
  const [actionError, setActionError] = useState<string | null>(null);
  const [queueMode, setQueueMode] = useState<MatchMode>("speedrun");

  const roomsQuery = useQuery({
    queryKey: ["rooms"],
    queryFn: fetchRooms,
    select: (data) => data.rooms ?? [],
    refetchInterval: POLL_MS,
  });

  const dashboardHandle = participantHandle || hostHandle;
  const competitiveQuery = useQuery({
    queryKey: ["competitive-dashboard", dashboardHandle],
    queryFn: () => fetchCompetitiveDashboard(dashboardHandle),
    enabled: Boolean(dashboardHandle),
    refetchInterval: POLL_MS,
  });

  const createRoomMutation = useMutation({
    mutationFn: () =>
      createRoom({
        hostHandle,
        puzzleId,
        mode,
        countdownSeconds,
        totalSeconds,
      }),
    onSuccess: () => {
      setActionError(null);
      invalidateRooms();
    },
    onError: (error: unknown) => {
      setActionError(error instanceof Error ? error.message : "Unable to create room");
    },
  });

  const joinRoomMutation = useMutation({
    mutationFn: (roomId: string) => joinRoom(roomId, { handle: participantHandle }),
    onSuccess: () => {
      setActionError(null);
      invalidateRooms();
    },
    onError: (error: unknown) => {
      setActionError(error instanceof Error ? error.message : "Unable to join room");
    },
  });

  const readyMutation = useMutation({
    mutationFn: ({ room, participantId }: { room: MatchRoom; participantId: string }) =>
      toggleReady(room.id, participantId, !room.participants.find((entry) => entry.id === participantId)?.ready),
    onSuccess: () => {
      setActionError(null);
      invalidateRooms();
    },
    onError: (error: unknown) => {
      setActionError(error instanceof Error ? error.message : "Unable to toggle ready");
    },
  });

  const countdownMutation = useMutation({
    mutationFn: (roomId: string) => startCountdown(roomId),
    onSuccess: () => {
      setActionError(null);
      invalidateRooms();
    },
    onError: (error: unknown) => {
      setActionError(error instanceof Error ? error.message : "Unable to start countdown");
    },
  });

  const queueMutation = useMutation({
    mutationFn: () => enqueueMatchmaking({ handle: participantHandle, mode: queueMode }),
    onSuccess: () => {
      setActionError(null);
      invalidateDashboard();
    },
    onError: (error: unknown) => {
      setActionError(error instanceof Error ? error.message : "Unable to enter queue");
    },
  });

  const cancelTicketMutation = useMutation({
    mutationFn: (ticketId: string) => cancelMatchmakingTicket(ticketId),
    onSuccess: () => {
      setActionError(null);
      invalidateDashboard();
    },
    onError: (error: unknown) => {
      setActionError(error instanceof Error ? error.message : "Unable to leave queue");
    },
  });

  const handleCreateRoom = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!hostHandle) {
        setActionError("Host handle is required");
        return;
      }
      createRoomMutation.mutate();
    },
    [createRoomMutation, hostHandle],
  );

  const handleJoin = useCallback(
    (roomId: string) => {
      if (!participantHandle) {
        setActionError("Provide a participant handle to join");
        return;
      }
      joinRoomMutation.mutate(roomId);
    },
    [joinRoomMutation, participantHandle],
  );

  const handleReadyToggle = useCallback(
    (room: MatchRoom) => {
      const participant = room.participants.find(
        (entry) => entry.handle.toLowerCase() === participantHandle.toLowerCase(),
      );
      if (!participant) {
        setActionError("Join the room before toggling ready");
        return;
      }
      readyMutation.mutate({ room, participantId: participant.id });
    },
    [participantHandle, readyMutation],
  );

  const handleCountdown = useCallback(
    (roomId: string) => {
      countdownMutation.mutate(roomId);
    },
    [countdownMutation],
  );

  const handleQueueJoin = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!participantHandle) {
        setActionError("Provide a participant handle to enter the queue");
        return;
      }
      queueMutation.mutate();
    },
    [participantHandle, queueMutation],
  );

  const activeTicketId = competitiveQuery.data?.activeTicket?.ticketId;
  const handleQueueLeave = useCallback(() => {
    if (!activeTicketId) {
      setActionError("No active ticket to cancel");
      return;
    }
    cancelTicketMutation.mutate(activeTicketId);
  }, [activeTicketId, cancelTicketMutation]);

  const rooms = roomsQuery.data ?? [];
  const queueSnapshots = competitiveQuery.data?.queues ?? [];
  const totalQueueDepth = queueSnapshots.reduce((sum, snapshot) => sum + snapshot.queueDepth, 0);
  const pendingMatches = competitiveQuery.data?.pendingMatches ?? [];
  const profile = competitiveQuery.data?.profile;
  const activeTicket = competitiveQuery.data?.activeTicket;

  const heroSubtitle = useMemo(() => {
    const lobbyStatus = roomsQuery.isLoading ? "syncing rooms" : `${rooms.length} room(s) live`;
    const queueStatus = competitiveQuery.isLoading
      ? "queue telemetry warming up"
      : `${totalQueueDepth} players in matchmaking`;
    return `Stage 6 ladder systems · ${lobbyStatus} · ${queueStatus}`;
  }, [competitiveQuery.isLoading, rooms.length, roomsQuery.isLoading, totalQueueDepth]);

  const ladderEntries = useMemo(() => {
    if (!profile) {
      return [];
    }
    const ladderOrder: MatchMode[] = ["speedrun", "endurance", "sandbox"];
    return ladderOrder.map((ladderMode) => ({
      mode: ladderMode,
      snapshot: profile.ladders[ladderMode],
      isActive: mode === ladderMode,
    }));
  }, [mode, profile]);

  const isMutating =
    createRoomMutation.isPending ||
    joinRoomMutation.isPending ||
    readyMutation.isPending ||
    countdownMutation.isPending;

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Stage 6 Prototype</p>
          <h1>Competitive Matchmaking Playground</h1>
          <p>{heroSubtitle}</p>
        </div>
        <p className="connection-pill">Connected to {MATCH_SERVICE_URL}</p>
      </header>

      <main>
        <section className="panel">
          <h2>Create a room</h2>
          <form className="form-grid" onSubmit={handleCreateRoom}>
            <label>
              Host handle
              <input
                type="text"
                value={hostHandle}
                onChange={(event) => setHostHandle(event.target.value)}
                placeholder="chemist-host"
              />
            </label>

            <label>
              Puzzle ID
              <input
                type="text"
                value={puzzleId}
                onChange={(event) => setPuzzleId(event.target.value)}
                placeholder="pz_001"
              />
            </label>

            <label>
              Mode
              <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
                <option value="speedrun">Speedrun</option>
                <option value="endurance">Endurance</option>
                <option value="sandbox">Sandbox</option>
              </select>
            </label>

            <label>
              Countdown (seconds)
              <input
                type="number"
                min={3}
                value={countdownSeconds}
                onChange={(event) => setCountdownSeconds(Number(event.target.value))}
              />
            </label>

            <label>
              Total time (seconds)
              <input
                type="number"
                min={60}
                value={totalSeconds}
                onChange={(event) => setTotalSeconds(Number(event.target.value))}
              />
            </label>

            <button type="submit" disabled={isMutating}>
              {createRoomMutation.isPending ? "Creating..." : "Create room"}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Control handle & queue</h2>
            <span>Ready + matchmaking identity</span>
          </div>
          <div className="control-grid">
            <label className="control-handle">
              Handle used for join/ready
              <input
                type="text"
                value={participantHandle}
                onChange={(event) => setParticipantHandle(event.target.value)}
                placeholder="chemist-01"
              />
            </label>

            <form className="queue-form" onSubmit={handleQueueJoin}>
              <label>
                Queue mode
                <select value={queueMode} onChange={(event) => setQueueMode(event.target.value as MatchMode)}>
                  <option value="speedrun">Speedrun</option>
                  <option value="endurance">Endurance</option>
                  <option value="sandbox">Sandbox</option>
                </select>
              </label>
              <div className="queue-buttons">
                <button
                  type="submit"
                  disabled={queueMutation.isPending || !participantHandle || Boolean(activeTicket)}
                >
                  {queueMutation.isPending ? "Enqueuing..." : activeTicket ? "In queue" : "Enter queue"}
                </button>
                {activeTicket && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={handleQueueLeave}
                    disabled={cancelTicketMutation.isPending}
                  >
                    {cancelTicketMutation.isPending ? "Leaving..." : "Leave queue"}
                  </button>
                )}
              </div>
            </form>
          </div>
          {activeTicket && (
            <div className="ticket-pill">
              <p>
                Ticket <strong>{activeTicket.ticketId}</strong> · waiting {activeTicket.waitSeconds}s · spread cap ±
                {activeTicket.spreadCap}
              </p>
            </div>
          )}
        </section>

        {(actionError || roomsQuery.error || competitiveQuery.error) && (
          <p className="error-banner">
            {actionError ||
              (roomsQuery.error instanceof Error
                ? roomsQuery.error.message
                : competitiveQuery.error instanceof Error
                  ? competitiveQuery.error.message
                  : "Unable to load lobby state")}
          </p>
        )}

        <section className="panel">
          <div className="panel-heading">
            <h2>Competitive snapshot</h2>
            <span>{dashboardHandle || "Set a handle"}</span>
          </div>
          {competitiveQuery.isLoading ? (
            <p className="muted">Syncing ladder data…</p>
          ) : !profile ? (
            <p className="muted">Enter a handle above to surface ladder data.</p>
          ) : (
            <div className="ladder-grid">
              {ladderEntries.map(({ mode: ladderMode, snapshot, isActive }) => (
                <article
                  key={ladderMode}
                  className={`ladder-card${isActive ? " ladder-card--active" : ""}`}
                >
                  <header>
                    <p className="eyebrow">{ladderMode}</p>
                    <h3>
                      {snapshot.division} {snapshot.tier}
                    </h3>
                  </header>
                  <p className="ladder-metric">
                    Rating <strong>{snapshot.rating}</strong>{" "}
                    {snapshot.provisionalMatches > 0 && <span className="muted">(provisional)</span>}
                  </p>
                  <p className="ladder-metric">RD {snapshot.deviation} · σ {snapshot.volatility}</p>
                  <p className="ladder-metric">
                    Matches {snapshot.matchesPlayed} ·{" "}
                    {snapshot.lastPlayedAt ? new Date(snapshot.lastPlayedAt).toLocaleDateString() : "No games logged"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Matchmaking queues</h2>
            <span>{totalQueueDepth} searching</span>
          </div>
          {queueSnapshots.length === 0 ? (
            <p className="muted">Queue telemetry populates as soon as players enter.</p>
          ) : (
            <div className="queue-grid">
              {queueSnapshots.map((snapshot: QueueModeSnapshot) => (
                <article key={snapshot.mode} className="queue-card">
                  <header>
                    <p className="eyebrow">{snapshot.mode}</p>
                    <h3>{snapshot.queueDepth} searching</h3>
                  </header>
                  <p className="muted">Avg rating {snapshot.averageRating || "—"}</p>
                  <p className="muted">Longest wait {snapshot.longestWaitSeconds}s</p>
                  <ul className="queue-card__tickets">
                    {snapshot.tickets.map((ticket) => (
                      <li key={ticket.ticketId}>
                        <span>{ticket.handle}</span>
                        <small>
                          {ticket.rating} · {ticket.waitSeconds}s
                        </small>
                      </li>
                    ))}
                    {snapshot.tickets.length === 0 && <li className="muted">Waiting for players…</li>}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Recent pairings</h2>
            <span>{pendingMatches.length} tracked</span>
          </div>
          {pendingMatches.length === 0 ? (
            <p className="muted">Pairings appear once the queue forms stage-ready matches.</p>
          ) : (
            <ul className="match-list">
              {pendingMatches.map((match) => (
                <li key={match.roomId}>
                  <div>
                    <strong>{match.handles.join(" vs ")}</strong>
                    {match.botFilled && <span className="badge badge--bot">Bot fill</span>}
                  </div>
                  <small>
                    {match.mode} · spread ±{match.ratingSpread} ·{" "}
                    {match.expectedDeltas
                      .map((delta) => `${delta.handle} ${Math.round(delta.winChance * 100)}%`)
                      .join(" / ")}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Active rooms</h2>
            <span>{rooms.length} room(s)</span>
          </div>
          {roomsQuery.isLoading && rooms.length === 0 ? (
            <p className="muted">Loading rooms…</p>
          ) : (
            <div className="room-list">
              {rooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  participantHandle={participantHandle}
                  onJoin={handleJoin}
                  onReadyToggle={handleReadyToggle}
                  onCountdown={handleCountdown}
                  disabled={isMutating}
                />
              ))}
              {rooms.length === 0 && (
                <p className="muted">No active rooms. Be the first to create one above.</p>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default LobbyPage;

