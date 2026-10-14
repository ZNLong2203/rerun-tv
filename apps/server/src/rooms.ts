/**
 * Pairing rooms: the TV asks for a code, shows it as a QR, and every phone
 * that joins with the code shares a room with it. Messages are relayed to
 * everyone else in the room if the sender's role is allowed to send them.
 */

import { randomInt } from "node:crypto";
import {
  ALLOWED_FROM,
  PAIR_ALPHABET,
  PAIR_CODE_LENGTH,
  parseRoomMessage,
  type Role,
  type RoomMessage,
} from "@rerun/core";

/** The subset of a WebSocket the rooms need, so tests can use fakes. */
export interface Peer {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

interface Room {
  code: string;
  createdAt: number;
  lastActive: number;
  tv: Set<Peer>;
  phones: Set<Peer>;
}

/** Rooms with nobody in them are dropped after this long. */
export const ROOM_IDLE_MS = 6 * 60 * 60 * 1000;

export class Rooms {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Make a new code. A TV that already has one can keep using it. */
  create(): string {
    this.sweep();
    let code: string;
    do {
      code = Array.from({ length: PAIR_CODE_LENGTH }, () => PAIR_ALPHABET[randomInt(PAIR_ALPHABET.length)]).join("");
    } while (this.rooms.has(code));
    const t = this.now();
    this.rooms.set(code, { code, createdAt: t, lastActive: t, tv: new Set(), phones: new Set() });
    return code;
  }

  has(code: string): boolean {
    return this.rooms.has(code);
  }

  join(code: string, role: Role, peer: Peer): boolean {
    const room = this.rooms.get(code);
    if (!room) return false;
    (role === "tv" ? room.tv : room.phones).add(peer);
    room.lastActive = this.now();
    this.broadcastPresence(room);
    return true;
  }

  leave(code: string, peer: Peer) {
    const room = this.rooms.get(code);
    if (!room) return;
    room.tv.delete(peer);
    room.phones.delete(peer);
    room.lastActive = this.now();
    this.broadcastPresence(room);
  }

  /** Relay a raw message from a peer. Returns false if it was rejected. */
  relay(code: string, role: Role, from: Peer, raw: string): boolean {
    const room = this.rooms.get(code);
    const msg = parseRoomMessage(raw);
    if (!room || !msg || !ALLOWED_FROM[role].has(msg.type)) return false;
    room.lastActive = this.now();
    const data = JSON.stringify(msg);
    for (const peer of [...room.tv, ...room.phones]) if (peer !== from) peer.send(data);
    return true;
  }

  /** Send a server-originated message to everyone in a room. */
  publish(code: string, msg: RoomMessage) {
    const room = this.rooms.get(code);
    if (!room) return;
    const data = JSON.stringify(msg);
    for (const peer of [...room.tv, ...room.phones]) peer.send(data);
  }

  presence(code: string): { tv: boolean; phones: number } | undefined {
    const room = this.rooms.get(code);
    return room ? { tv: room.tv.size > 0, phones: room.phones.size } : undefined;
  }

  /** Every room, oldest first. For local testing only (DEBUG_ROOMS). */
  list(): { code: string; tv: boolean; phones: number; createdAt: number }[] {
    return [...this.rooms.values()]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => ({ code: r.code, tv: r.tv.size > 0, phones: r.phones.size, createdAt: r.createdAt }));
  }

  private broadcastPresence(room: Room) {
    this.publish(room.code, { type: "presence", tv: room.tv.size > 0, phones: room.phones.size });
  }

  /** Drop empty rooms that have been idle too long. */
  sweep() {
    const cutoff = this.now() - ROOM_IDLE_MS;
    for (const [code, room] of this.rooms) {
      if (room.tv.size === 0 && room.phones.size === 0 && room.lastActive < cutoff) this.rooms.delete(code);
    }
  }
}
