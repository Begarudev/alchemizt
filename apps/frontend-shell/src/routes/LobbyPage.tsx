import { useState, useMemo, useCallback } from "react";
import type { FormEvent } from "react";
import type { MatchRoom } from "@alchemizt/contracts";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import RoomCard from "../components/RoomCard";
import {
  MATCH_SERVICE_URL,
  createRoom,
  fetchRooms,
  joinRoom,
  startCountdown,
  toggleReady,
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

export const LobbyPage = () => {
  const invalidateRooms = useInvalidateRooms();
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

  const roomsQuery = useQuery({
    queryKey: ["rooms"],
    queryFn: fetchRooms,
    select: (data) => data.rooms ?? [],
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

  const heroSubtitle = useMemo(() => {
    const suffix = roomsQuery.isLoading
      ? "syncing lobby state..."
      : `connected to ${MATCH_SERVICE_URL}`;
    return `Prototype lobby orchestration · ${suffix}`;
  }, [roomsQuery.isLoading]);

  const rooms = roomsQuery.data ?? [];
  const isMutating =
    createRoomMutation.isPending ||
    joinRoomMutation.isPending ||
    readyMutation.isPending ||
    countdownMutation.isPending;

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Stage 5 Prototype</p>
          <h1>Match Orchestrator Playground</h1>
          <p>{heroSubtitle}</p>
        </div>
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
          <h2>Control handle</h2>
          <label className="control-handle">
            Handle used for join/ready
            <input
              type="text"
              value={participantHandle}
              onChange={(event) => setParticipantHandle(event.target.value)}
              placeholder="chemist-01"
            />
          </label>
        </section>

        {(actionError || roomsQuery.error) && (
          <p className="error-banner">
            {actionError ||
              (roomsQuery.error instanceof Error
                ? roomsQuery.error.message
                : "Unable to load rooms")}
          </p>
        )}

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

