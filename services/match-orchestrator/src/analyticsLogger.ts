import type {
  AnalyticsEvent,
  CountdownStartedEvent,
  MatchResultRecordedEvent,
  RoomCreatedEvent,
  RoomReadyToggledEvent,
} from "@alchemizt/contracts";

const BUFFER_LIMIT = 200;
const analyticsEvents: AnalyticsEvent[] = [];

const pushEvent = (event: AnalyticsEvent) => {
  analyticsEvents.push(event);
  if (analyticsEvents.length > BUFFER_LIMIT) {
    analyticsEvents.shift();
  }
  if (process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console -- intentional structured log for observability
    console.info(`[analytics:${event.type}]`, event.payload);
  }
};

const now = () => new Date().toISOString();

export const recordRoomCreated = (payload: RoomCreatedEvent["payload"]) => {
  const event: RoomCreatedEvent = {
    type: "room.created",
    occurredAt: now(),
    payload,
  };
  pushEvent(event);
};

export const recordReadyToggled = (payload: RoomReadyToggledEvent["payload"]) => {
  const event: RoomReadyToggledEvent = {
    type: "room.ready_toggled",
    occurredAt: now(),
    payload,
  };
  pushEvent(event);
};

export const recordCountdownStarted = (payload: CountdownStartedEvent["payload"]) => {
  const event: CountdownStartedEvent = {
    type: "room.countdown_started",
    occurredAt: now(),
    payload,
  };
  pushEvent(event);
};

export const recordMatchResult = (payload: MatchResultRecordedEvent["payload"]) => {
  const event: MatchResultRecordedEvent = {
    type: "match.result_recorded",
    occurredAt: now(),
    payload,
  };
  pushEvent(event);
};

export const getAnalyticsEvents = (): AnalyticsEvent[] => [...analyticsEvents];

