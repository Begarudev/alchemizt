import { randomUUID } from "node:crypto";
import type { Response } from "express";
import {
  CountdownState,
  MatchMode,
  MatchRoom,
  RouteDefinition,
  RoomParticipant,
  ServiceName,
} from "@alchemizt/contracts";
import { createServiceApp } from "@alchemizt/http-kit";

const routes: RouteDefinition[] = [
  {
    method: "POST",
    path: "/rooms",
    description: "Create a match room",
    handledBy: ServiceName.MatchOrchestrator,
  },
  {
    method: "POST",
    path: "/rooms/:roomId/ready",
    description: "Toggle ready state for a participant",
    handledBy: ServiceName.MatchOrchestrator,
  },
  {
    method: "POST",
    path: "/rooms/:roomId/countdown",
    description: "Start an authoritative countdown",
    handledBy: ServiceName.MatchOrchestrator,
  },
  {
    method: "POST",
    path: "/rooms/:roomId/join",
    description: "Join a match room with a specific role",
    handledBy: ServiceName.MatchOrchestrator,
  },
  {
    method: "GET",
    path: "/rooms/:roomId",
    description: "Inspect the current room state",
    handledBy: ServiceName.MatchOrchestrator,
  },
  {
    method: "GET",
    path: "/rooms",
    description: "List all active prototype rooms",
    handledBy: ServiceName.MatchOrchestrator,
  },
];

const activeRooms = new Map<string, MatchRoom>();

const nowIso = (): string => new Date().toISOString();

const defaultCountdown = (countdownSeconds: number): CountdownState => ({
  state: "idle",
  countdownSeconds,
});

const upsertRoom = (room: MatchRoom): MatchRoom => {
  const stampedRoom = { ...room, updatedAt: nowIso() };
  activeRooms.set(stampedRoom.id, stampedRoom);
  return stampedRoom;
};

const getRoomOr404 = (roomId: string, res: Response) => {
  const room = activeRooms.get(roomId);
  if (!room) {
    res.status(404).json({ error: "room_not_found", roomId });
    return null;
  }
  return room;
};

const buildParticipant = ({
  userId,
  handle,
  role,
}: {
  userId?: string;
  handle: string;
  role?: RoomParticipant["role"];
}): RoomParticipant => ({
  id: userId ?? randomUUID(),
  handle,
  role: role ?? "challenger",
  ready: false,
});

const applyReadyState = (room: MatchRoom, participantId: string, readyFlag?: boolean): MatchRoom => {
  const participants = room.participants.map((participant) => {
    if (participant.id !== participantId) {
      return participant;
    }
    const nextReady = readyFlag ?? !participant.ready;
    return { ...participant, ready: nextReady };
  });
  const readyCount = participants.filter((participant) => participant.ready).length;
  const readyPercent = participants.length === 0 ? 0 : Math.round((readyCount / participants.length) * 100);

  let countdownState: CountdownState = room.countdown;
  let status: MatchRoom["status"] = room.status;

  if (readyPercent === 100 && room.countdown.state === "idle") {
    countdownState = { ...room.countdown, state: "pending" };
    status = "countdown";
  } else if (readyPercent < 100 && room.countdown.state !== "running") {
    countdownState = { ...room.countdown, state: "idle" };
    status = "lobby";
  }

  return {
    ...room,
    participants,
    countdown: countdownState,
    status,
  };
};

const service = createServiceApp({
  serviceName: ServiceName.MatchOrchestrator,
  summary: "Lobby state, room timers, and WebSocket session orchestration",
  defaultPort: 4004,
  enableCors: true,
  routes,
  register: (router) => {
    router.post("/rooms", (req, res) => {
      const {
        hostHandle = "host",
        mode = "speedrun",
        puzzleId = "pz_001",
        countdownSeconds = 5,
        totalSeconds = 300,
      }: {
        hostHandle?: string;
        mode?: MatchMode;
        puzzleId?: string;
        countdownSeconds?: number;
        totalSeconds?: number;
      } = req.body ?? {};

      const roomId = `room_${Date.now()}`;
      const timestamp = nowIso();

      const hostParticipant = buildParticipant({
        handle: hostHandle,
        role: "host",
        userId: req.body?.hostUserId,
      });

      const room: MatchRoom = {
        id: roomId,
        puzzleId,
        mode,
        websocketChannel: `match:${roomId}`,
        participants: [hostParticipant],
        timerConfig: {
          countdownSeconds,
          totalSeconds,
        },
        status: "lobby",
        countdown: defaultCountdown(countdownSeconds),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      upsertRoom(room);
      res.status(201).json(room);
    });

    router.post("/rooms/:roomId/ready", (req, res) => {
      const room = getRoomOr404(req.params.roomId, res);
      if (!room) {
        return;
      }
      const participantId = req.body?.participantId ?? room.participants[0]?.id;
      if (!participantId) {
        res.status(400).json({ error: "participant_required" });
        return;
      }

      const updatedRoom = applyReadyState(room, participantId, req.body?.ready);
      upsertRoom(updatedRoom);
      res.json(updatedRoom);
    });

    router.post("/rooms/:roomId/countdown", (req, res) => {
      const room = getRoomOr404(req.params.roomId, res);
      if (!room) {
        return;
      }
      const action: "start" | "reset" = req.body?.action ?? "start";
      let countdown: CountdownState = room.countdown;
      let status: MatchRoom["status"] = room.status;

      if (action === "start") {
        countdown = {
          countdownSeconds: room.timerConfig.countdownSeconds,
          state: "running",
          startedAt: nowIso(),
          expiresAt: new Date(Date.now() + room.timerConfig.countdownSeconds * 1000).toISOString(),
        };
        status = "in_progress";
      } else if (action === "reset") {
        countdown = defaultCountdown(room.timerConfig.countdownSeconds);
        status = "lobby";
      }

      const updatedRoom: MatchRoom = {
        ...room,
        countdown,
        status,
      };
      upsertRoom(updatedRoom);
      res.json(updatedRoom);
    });

    router.post("/rooms/:roomId/join", (req, res) => {
      const room = getRoomOr404(req.params.roomId, res);
      if (!room) {
        return;
      }
      const handle: string | undefined = req.body?.handle;
      if (!handle) {
        res.status(400).json({ error: "handle_required" });
        return;
      }

      const existingParticipant = room.participants.find((participant) => participant.handle === handle);
      if (existingParticipant) {
        res.json(room);
        return;
      }

      const newParticipant = buildParticipant({
        handle,
        role: req.body?.role,
        userId: req.body?.userId,
      });

      const updatedRoom: MatchRoom = {
        ...room,
        participants: [...room.participants, newParticipant],
        status: "lobby",
        countdown: defaultCountdown(room.timerConfig.countdownSeconds),
      };
      upsertRoom(updatedRoom);
      res.status(201).json(updatedRoom);
    });

    router.get("/rooms/:roomId", (req, res) => {
      const room = getRoomOr404(req.params.roomId, res);
      if (!room) {
        return;
      }
      res.json(room);
    });

    router.get("/rooms", (_req, res) => {
      res.json({ rooms: Array.from(activeRooms.values()) });
    });
  },
});

service.start();
