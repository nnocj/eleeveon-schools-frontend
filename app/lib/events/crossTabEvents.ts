/**
 * app/lib/events/crossTabEvents.ts
 * --------------------------------------------------------------------------
 * Same-device, multi-tab transport for selective data events.
 */

import {
  getDataEventsTabId,
  receiveDataEvent,
  type DataChangeEvent,
} from "./dataEvents";

export const DATA_EVENTS_CHANNEL_NAME =
  "eleeveon-data-events";

type CrossTabMessage = {
  type: "DATA_CHANGED";
  payload: DataChangeEvent;
};

let channel: BroadcastChannel | null = null;
let started = false;

function supported() {
  return (
    typeof window !== "undefined" &&
    typeof BroadcastChannel !== "undefined"
  );
}

export function startCrossTabDataEvents() {
  if (started || !supported()) return;

  started = true;
  channel = new BroadcastChannel(DATA_EVENTS_CHANNEL_NAME);

  channel.onmessage = (
    message: MessageEvent<CrossTabMessage>,
  ) => {
    const envelope = message.data;

    if (
      !envelope ||
      envelope.type !== "DATA_CHANGED" ||
      !envelope.payload
    ) {
      return;
    }

    const event = envelope.payload;

    if (event.originTabId === getDataEventsTabId()) {
      return;
    }

    receiveDataEvent({
      ...event,
      source: "cross-tab",
    });
  };

  channel.onmessageerror = (error) => {
    console.error("[cross-tab-events] invalid message", error);
  };
}

export function broadcastDataEvent(
  event: DataChangeEvent | null,
) {
  if (!event || event.changedTables.length === 0) {
    return false;
  }

  startCrossTabDataEvents();

  if (!channel) return false;

  const message: CrossTabMessage = {
    type: "DATA_CHANGED",
    payload: event,
  };

  channel.postMessage(message);
  return true;
}

export function stopCrossTabDataEvents() {
  channel?.close();
  channel = null;
  started = false;
}